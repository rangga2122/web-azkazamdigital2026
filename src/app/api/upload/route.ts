import { NextRequest, NextResponse } from "next/server";
import { readdir, stat, writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE = (parseInt(process.env.UPLOAD_MAX_SIZE_MB || "5") || 5) * 1024 * 1024;
const CATEGORY_FOLDERS: Record<string, string> = {
  products: "uploads/products",
  banners: "uploads/banners",
  pages: "uploads/pages",
  site: "uploads/site",
  testimonials: "uploads/testimonials",
  general: "uploads/general",
};
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

export async function GET(request: NextRequest) {
  const requestedCategory = request.nextUrl.searchParams.get("category");
  const categories = requestedCategory && CATEGORY_FOLDERS[requestedCategory]
    ? [requestedCategory]
    : Object.keys(CATEGORY_FOLDERS);

  const files = [];

  for (const category of categories) {
    const folder = CATEGORY_FOLDERS[category];
    const uploadDir = path.join(process.cwd(), "public", folder);

    if (!existsSync(uploadDir)) continue;

    const entries = await readdir(uploadDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const filePath = path.join(uploadDir, entry.name);
      const info = await stat(filePath);

      files.push({
        filename: entry.name,
        original_name: entry.name,
        file_path: `/${folder}/${entry.name}`,
        file_size: info.size,
        category,
        updated_at: info.mtime.toISOString(),
      });
    }
  }

  files.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  return NextResponse.json({ files });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Only images are accepted." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size is ${MAX_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    // Determine upload directory
    const folder = CATEGORY_FOLDERS[category] || CATEGORY_FOLDERS.general;
    const uploadDir = path.join(process.cwd(), "public", folder);

    // Create directory if not exists
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(file.name);
    const uniqueName = `${uuidv4()}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const publicPath = `/${folder}/${uniqueName}`;

    return NextResponse.json({
      success: true,
      file: {
        filename: uniqueName,
        original_name: file.name,
        file_path: publicPath,
        file_size: file.size,
        mime_type: file.type,
        category,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { file_path?: string };
    const filePath = body.file_path?.trim();

    if (!filePath) {
      return NextResponse.json(
        { error: "Path file wajib diisi." },
        { status: 400 }
      );
    }

    const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
    const requestedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const absolutePath = path.resolve(process.cwd(), "public", requestedPath);

    if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
      return NextResponse.json(
        { error: "File tidak valid untuk dihapus." },
        { status: 400 }
      );
    }

    if (!existsSync(absolutePath)) {
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 404 }
      );
    }

    await unlink(absolutePath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete upload error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus file." },
      { status: 500 }
    );
  }
}
