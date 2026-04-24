import { readFile, stat } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathParts } = await params;
    const response = await readUploadFile(pathParts);

    if (!response) {
      return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
    }

    return new NextResponse(response.buffer, {
      headers: {
        "Content-Type": response.contentType,
        "Content-Length": response.size.toString(),
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
  }
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathParts } = await params;
    const response = await readUploadFile(pathParts, false);

    if (!response) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, {
      headers: {
        "Content-Type": response.contentType,
        "Content-Length": response.size.toString(),
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

async function readUploadFile(pathParts: string[], includeBody = true) {
  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
  const requestedPath = pathParts.join(path.sep);
  const absolutePath = path.resolve(uploadRoot, requestedPath);

  if (!absolutePath.startsWith(uploadRoot + path.sep)) return null;

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return null;

  const info = await stat(absolutePath);
  if (!info.isFile()) return null;

  return {
    buffer: includeBody ? await readFile(absolutePath) : null,
    contentType,
    size: info.size,
  };
}
