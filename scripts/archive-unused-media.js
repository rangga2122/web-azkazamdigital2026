const fs = require("fs");
const path = require("path");
const { mkdir, readdir, rename, stat, writeFile } = require("fs/promises");
const { createClient } = require("@supabase/supabase-js");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const UPLOAD_REF_RE = /\/uploads\/[A-Za-z0-9_\-./]+/g;
const TABLES_TO_SCAN = [
  "site_settings",
  "pages",
  "articles",
  "products",
  "categories",
  "testimonials",
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function walkFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)));
      continue;
    }

    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const info = await stat(fullPath);
    results.push({
      absolutePath: fullPath,
      relativePath: `/${path.relative(path.join(process.cwd(), "public"), fullPath).replace(/\\/g, "/")}`,
      size: info.size,
      updatedAt: info.mtime.toISOString(),
    });
  }

  return results;
}

async function collectUsedUploadPaths() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const usedPaths = new Map();

  for (const table of TABLES_TO_SCAN) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      throw new Error(`Failed to scan table ${table}: ${error.message}`);
    }

    for (const row of data ?? []) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value !== "string" || !value.includes("/uploads/")) continue;

        for (const match of value.match(UPLOAD_REF_RE) ?? []) {
          if (!usedPaths.has(match)) {
            usedPaths.set(match, []);
          }

          usedPaths.get(match).push({
            table,
            id: row.id ?? null,
            slug: row.slug ?? null,
            column,
          });
        }
      }
    }
  }

  return usedPaths;
}

function createArchiveStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}

function parseArgs(argv) {
  const categoryArg = argv.find((value) => value.startsWith("--category="));

  return {
    apply: argv.includes("--apply"),
    category: categoryArg ? categoryArg.split("=")[1] : "all",
  };
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  const { apply, category } = parseArgs(process.argv.slice(2));
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const archiveStamp = createArchiveStamp();
  const archiveRoot = path.join(process.cwd(), ".media-archive", archiveStamp);

  const allFiles = await walkFiles(uploadsRoot);
  const usedPaths = await collectUsedUploadPaths();

  const candidates = allFiles.filter((file) => {
    const fileCategory = file.relativePath.split("/")[2] || "unknown";
    if (category !== "all" && fileCategory !== category) {
      return false;
    }

    return !usedPaths.has(file.relativePath);
  });

  const report = {
    mode: apply ? "apply" : "dry-run",
    category,
    totalUnusedFiles: candidates.length,
    totalUnusedBytes: candidates.reduce((sum, file) => sum + file.size, 0),
    filesByCategory: candidates.reduce((acc, file) => {
      const fileCategory = file.relativePath.split("/")[2] || "unknown";
      acc[fileCategory] = (acc[fileCategory] || 0) + 1;
      return acc;
    }, {}),
    sampleFiles: candidates.slice(0, 50).map((file) => file.relativePath),
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await ensureDirectory(archiveRoot);

  const manifest = [];

  for (const file of candidates) {
    const relativeFromUploads = file.relativePath.replace(/^\/uploads\//, "");
    const destinationPath = path.join(archiveRoot, "uploads", relativeFromUploads);

    await ensureDirectory(path.dirname(destinationPath));
    await rename(file.absolutePath, destinationPath);

    manifest.push({
      from: file.relativePath,
      to: destinationPath,
      size: file.size,
      updatedAt: file.updatedAt,
    });
  }

  const manifestPath = path.join(archiveRoot, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        ...report,
        archiveRoot,
        manifestPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
