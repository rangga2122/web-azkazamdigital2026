import { createSlug } from "@/lib/utils";
import type { Product } from "@/types";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type WordPressImportTarget = {
  url: string;
  slug: string;
  sourceType: "page" | "product";
  importable: boolean;
  reason?: string;
  title?: string;
};

export type ImportedWordPressPage = {
  url: string;
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImage: string | null;
  contentHtml: string;
  imageCount: number;
  productId: string | null;
};

const SYSTEM_PAGE_SLUGS = new Set([
  "",
  "sample-page",
  "shop",
  "cart",
  "checkout",
  "my-account",
  "selesai",
  "user",
  "login",
  "register",
  "members",
  "logout",
  "account",
  "password-reset",
]);

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".avif"];

export async function discoverWordPressImportTargets(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sitemapUrls = await readSitemapUrls(`${normalizedBaseUrl}/wp-sitemap.xml`);
  const pageSitemaps = sitemapUrls.filter((url) =>
    /wp-sitemap-posts-(page|product)-\d+\.xml$/i.test(url)
  );

  const targetMap = new Map<string, WordPressImportTarget>();
  const sitemapEntries = await Promise.all(
    pageSitemaps.map(async (sitemapUrl) => {
      const sourceType: WordPressImportTarget["sourceType"] = sitemapUrl.includes(
        "-product-"
      )
        ? "product"
        : "page";
      const urls = await readSitemapUrls(sitemapUrl);
      return { sourceType, urls };
    })
  );

  for (const sitemapEntry of sitemapEntries) {
    for (const url of sitemapEntry.urls) {
      const slug = getSlugFromUrl(url);
      const importable =
        sitemapEntry.sourceType === "product" ? true : !SYSTEM_PAGE_SLUGS.has(slug);
      const reason = importable ? undefined : "system_page";

      if (!targetMap.has(url)) {
        targetMap.set(url, {
          url,
          slug,
          sourceType: sitemapEntry.sourceType,
          importable,
          reason,
          title: importable ? humanizeSlug(slug) : undefined,
        });
      }
    }
  }

  return Array.from(targetMap.values()).sort((a, b) => {
    if (a.importable !== b.importable) return a.importable ? -1 : 1;
    if (a.sourceType !== b.sourceType) return a.sourceType.localeCompare(b.sourceType);
    return a.slug.localeCompare(b.slug);
  });
}

export async function importWordPressPage(options: {
  url: string;
  products: Pick<Product, "id" | "title" | "slug">[];
}) {
  const response = await fetch(options.url, {
    headers: { "user-agent": "AzkazamDigital Importer/1.0" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil halaman (${response.status}).`);
  }

  let html = await response.text();
  const assetCache = new Map<string, string>();
  const meta = extractDocumentMeta(html);
  const slug = createSlug(getSlugFromUrl(options.url) || meta.title || "landing-page");

  html = await inlineStylesheets(html, options.url, assetCache);
  html = await rewriteImageAttributes(html, options.url, assetCache);
  html = await rewriteStyleAttributes(html, options.url, assetCache);
  html = await rewriteStyleBlocks(html, options.url, assetCache);

  const featuredImage =
    (meta.ogImage ? assetCache.get(resolveUrl(meta.ogImage, options.url)) : null) ||
    findFirstImportedImage(html) ||
    null;

  return {
    url: options.url,
    slug,
    title: meta.title || slug,
    seoTitle: meta.title || null,
    seoDescription: meta.description || null,
    featuredImage,
    contentHtml: html,
    imageCount: assetCache.size,
    productId: guessProductId(slug, meta.title || "", options.products),
  } satisfies ImportedWordPressPage;
}

async function readSitemapUrls(sitemapUrl: string) {
  const response = await fetch(sitemapUrl, {
    headers: { "user-agent": "AzkazamDigital Importer/1.0" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Gagal membaca sitemap ${sitemapUrl}`);
  }

  const xml = await response.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1] || ""))
    .filter(Boolean);
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function getSlugFromUrl(url: string) {
  const pathname = new URL(url).pathname.replace(/\/+$/, "");
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) || "";
}

function humanizeSlug(slug: string) {
  if (!slug) return "Homepage";

  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractDocumentMeta(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descriptionMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );

  return {
    title: cleanTitle(titleMatch?.[1] || ""),
    description: decodeHtmlEntities(descriptionMatch?.[1] || "").trim() || null,
    ogImage: ogImageMatch?.[1] || null,
  };
}

function cleanTitle(value: string) {
  const decoded = decodeHtmlEntities(value).trim();
  return decoded
    .replace(/\s*[–|-]\s*azkazamdigital\s*$/i, "")
    .replace(/\s*[–|-]\s*Jual Produk Digital\s*$/i, "")
    .trim();
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function decodeHtmlEntities(value: string) {
  return decodeXml(value)
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, "&");
}

async function inlineStylesheets(
  html: string,
  pageUrl: string,
  assetCache: Map<string, string>
) {
  const linkMatches = Array.from(
    html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi)
  );

  let output = html;

  for (const match of linkMatches) {
    const fullMatch = match[0];
    const href = match[1];
    const stylesheetUrl = resolveUrl(href, pageUrl);

    try {
      const response = await fetch(stylesheetUrl, {
        headers: { "user-agent": "AzkazamDigital Importer/1.0" },
      });

      if (!response.ok) continue;

      const css = await response.text();
      const rewrittenCss = await rewriteCssUrls(css, stylesheetUrl, assetCache);
      output = output.replace(
        fullMatch,
        `<style data-imported-stylesheet="${escapeAttribute(stylesheetUrl)}">\n${rewrittenCss}\n</style>`
      );
    } catch {
      // Keep original link if stylesheet fetch fails.
    }
  }

  return output;
}

async function rewriteImageAttributes(
  html: string,
  pageUrl: string,
  assetCache: Map<string, string>
) {
  let output = html;

  const attrPattern = /\b(src|poster|data-src|data-lazy-src)=("([^"]*)"|'([^']*)')/gi;
  for (const match of Array.from(output.matchAll(attrPattern))) {
    const fullMatch = match[0];
    const attrName = match[1];
    const quote = match[2][0];
    const value = match[3] ?? match[4] ?? "";
    const imported = await maybeImportAsset(value, pageUrl, assetCache);
    if (!imported) continue;
    output = output.replace(
      fullMatch,
      `${attrName}=${quote}${imported}${quote}`
    );
  }

  const srcsetPattern = /\bsrcset=("([^"]*)"|'([^']*)')/gi;
  for (const match of Array.from(output.matchAll(srcsetPattern))) {
    const fullMatch = match[0];
    const quote = match[1][0];
    const value = match[2] ?? match[3] ?? "";
    const rewrittenCandidates: string[] = [];

    for (const candidate of value.split(",")) {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
      const imported = (await maybeImportAsset(urlPart, pageUrl, assetCache)) || urlPart;
      rewrittenCandidates.push(descriptor ? `${imported} ${descriptor}` : imported);
    }

    output = output.replace(
      fullMatch,
      `srcset=${quote}${rewrittenCandidates.join(", ")}${quote}`
    );
  }

  return output;
}

async function rewriteStyleAttributes(
  html: string,
  pageUrl: string,
  assetCache: Map<string, string>
) {
  let output = html;
  const stylePattern = /\bstyle=("([^"]*)"|'([^']*)')/gi;

  for (const match of Array.from(output.matchAll(stylePattern))) {
    const fullMatch = match[0];
    const quote = match[1][0];
    const value = match[2] ?? match[3] ?? "";
    const rewrittenStyle = await rewriteCssUrls(value, pageUrl, assetCache);
    output = output.replace(fullMatch, `style=${quote}${rewrittenStyle}${quote}`);
  }

  return output;
}

async function rewriteStyleBlocks(
  html: string,
  pageUrl: string,
  assetCache: Map<string, string>
) {
  let output = html;
  const stylePattern = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;

  for (const match of Array.from(output.matchAll(stylePattern))) {
    const fullMatch = match[0];
    const attrs = match[1] || "";
    const css = match[2] || "";
    const rewrittenCss = await rewriteCssUrls(css, pageUrl, assetCache);
    output = output.replace(fullMatch, `<style${attrs}>${rewrittenCss}</style>`);
  }

  return output;
}

async function rewriteCssUrls(
  css: string,
  baseUrl: string,
  assetCache: Map<string, string>
) {
  let output = css;
  const urlPattern = /url\((['"]?)([^'")]+)\1\)/gi;

  for (const match of Array.from(output.matchAll(urlPattern))) {
    const fullMatch = match[0];
    const quote = match[1] || "";
    const value = match[2] || "";
    const imported = await maybeImportAsset(value, baseUrl, assetCache);
    if (!imported) continue;
    output = output.replace(fullMatch, `url(${quote}${imported}${quote})`);
  }

  return output;
}

async function maybeImportAsset(
  rawUrl: string,
  baseUrl: string,
  assetCache: Map<string, string>
) {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) {
    return null;
  }

  const resolvedUrl = resolveUrl(trimmed, baseUrl);
  if (!resolvedUrl) return null;

  if (assetCache.has(resolvedUrl)) {
    return assetCache.get(resolvedUrl) || null;
  }

  const importedPath = await downloadRemoteImage(resolvedUrl);
  if (!importedPath) return null;

  assetCache.set(resolvedUrl, importedPath);
  return importedPath;
}

function resolveUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

async function downloadRemoteImage(assetUrl: string) {
  try {
    const response = await fetch(assetUrl, {
      headers: { "user-agent": "AzkazamDigital Importer/1.0" },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const ext = getImageExtension(assetUrl, contentType);
    const buffer = Buffer.from(await response.arrayBuffer());
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "pages");

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const filename = `${randomUUID()}${ext}`;
    const absolutePath = path.join(uploadsDir, filename);
    await writeFile(absolutePath, buffer);

    return `/uploads/pages/${filename}`;
  } catch {
    return null;
  }
}

function getImageExtension(assetUrl: string, contentType: string) {
  const pathname = new URL(assetUrl).pathname.toLowerCase();
  const matchedExt = IMAGE_EXTENSIONS.find((ext) => pathname.endsWith(ext));
  if (matchedExt) return matchedExt;

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("bmp")) return ".bmp";
  if (contentType.includes("avif")) return ".avif";
  return ".jpg";
}

function findFirstImportedImage(html: string) {
  const match = html.match(/\b(?:src|poster)=["'](\/uploads\/pages\/[^"']+)["']/i);
  return match?.[1] || null;
}

function guessProductId(
  slug: string,
  title: string,
  products: Pick<Product, "id" | "title" | "slug">[]
) {
  const normalizedNeedle = `${slug} ${title}`.toLowerCase();

  const matchedProduct = products.find((product) => {
    const normalizedProduct = `${product.slug} ${product.title}`.toLowerCase();
    const productTokens = normalizedProduct
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);

    return productTokens.some((token) => normalizedNeedle.includes(token));
  });

  return matchedProduct?.id || null;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
