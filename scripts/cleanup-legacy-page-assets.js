const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const LEGACY_UPLOAD_PATH = "/wp-content/uploads/";
const LEGACY_UPLOAD_URL_PATTERN =
  /(?:https?:\/\/[^"'\s<>()]+)?\/wp-content\/uploads\/[^"'\s<>()]+/gi;

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

function sanitizePublicMediaUrl(value) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return null;
  if (normalizedValue.includes(LEGACY_UPLOAD_PATH)) return null;

  try {
    const url = new URL(normalizedValue);
    if (url.pathname.includes(LEGACY_UPLOAD_PATH)) return null;
  } catch {
    return normalizedValue;
  }

  return normalizedValue;
}

function stripLegacyUploadAssetUrlsFromHtml(html) {
  if (!html || !html.includes("wp-content")) {
    return html;
  }

  return html
    .replace(
      /<img\b[^>]*\bsrc=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1[^>]*>/gi,
      ""
    )
    .replace(
      /<source\b[^>]*\bsrc=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1[^>]*>/gi,
      ""
    )
    .replace(
      /\s(?:src|href|poster)=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1/gi,
      ""
    )
    .replace(
      /url\((['"]?)(?:https?:\/\/[^)'"]+)?\/wp-content\/uploads\/[^)'"]+\1\)/gi,
      "none"
    )
    .replace(LEGACY_UPLOAD_URL_PATTERN, "");
}

function collectLegacyUrls(value) {
  if (typeof value !== "string") return [];
  return [...new Set(value.match(LEGACY_UPLOAD_URL_PATTERN) ?? [])];
}

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function createBackupFilePath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(process.cwd(), ".cleanup-reports", `legacy-pages-backup-${timestamp}.json`);
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    backupFile:
      argv.find((value) => value.startsWith("--backup-file="))?.split("=")[1] ?? null,
  };
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  const { apply, backupFile } = parseArgs(process.argv.slice(2));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: pages, error } = await supabase
    .from("pages")
    .select("id,slug,title,featured_image,content_html")
    .order("slug", { ascending: true });

  if (error) {
    throw error;
  }

  const candidates = [];

  for (const page of pages ?? []) {
    const legacyFeaturedImageUrls = collectLegacyUrls(page.featured_image);
    const legacyHtmlUrls = collectLegacyUrls(page.content_html);
    const cleanedFeaturedImage = sanitizePublicMediaUrl(page.featured_image);
    const cleanedContentHtml = stripLegacyUploadAssetUrlsFromHtml(page.content_html ?? "");
    const hasLegacyReferences =
      legacyFeaturedImageUrls.length > 0 || legacyHtmlUrls.length > 0;

    const hasChanges =
      cleanedFeaturedImage !== (page.featured_image ?? null) ||
      cleanedContentHtml !== (page.content_html ?? "");

    if (!hasLegacyReferences || !hasChanges) continue;

    candidates.push({
      id: page.id,
      slug: page.slug,
      title: page.title,
      legacyFeaturedImageUrls,
      legacyHtmlUrls,
      before: {
        featured_image: page.featured_image,
        content_html_length: page.content_html?.length ?? 0,
      },
      after: {
        featured_image: cleanedFeaturedImage,
        content_html_length: cleanedContentHtml.length,
      },
      update: {
        featured_image: cleanedFeaturedImage,
        content_html: cleanedContentHtml,
      },
    });
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    affectedPages: candidates.length,
    slugs: candidates.map((candidate) => candidate.slug),
    pages: candidates.map((candidate) => ({
      slug: candidate.slug,
      title: candidate.title,
      legacyFeaturedImageUrls: candidate.legacyFeaturedImageUrls,
      legacyHtmlUrlCount: candidate.legacyHtmlUrls.length,
      before: candidate.before,
      after: candidate.after,
    })),
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const resolvedBackupFile = backupFile
    ? path.resolve(process.cwd(), backupFile)
    : createBackupFilePath();
  ensureDirectory(path.dirname(resolvedBackupFile));
  fs.writeFileSync(resolvedBackupFile, JSON.stringify(candidates, null, 2));

  for (const candidate of candidates) {
    const { error: updateError } = await supabase
      .from("pages")
      .update(candidate.update)
      .eq("id", candidate.id);

    if (updateError) {
      throw new Error(`Failed to update page ${candidate.slug}: ${updateError.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        backupFile: resolvedBackupFile,
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
