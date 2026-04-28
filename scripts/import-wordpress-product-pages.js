const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { JSDOM } = require("jsdom");
const { createClient } = require("@supabase/supabase-js");

const SITE_URL = "https://www.azkazamdigital.com";
const USER_AGENT = "Mozilla/5.0 (compatible; AzkazamDigitalImporter/1.0)";

const PAGE_SLUG_ALIASES = {
  "instachatmax-ai": "order-instachatmax-ai",
};

const PAGE_SEO_OVERRIDES = {
  "instachatmax-ai": {
    title: "InstaChat Max AI - Order & Pembayaran",
    seoTitle: "InstaChat Max AI - Order & Pembayaran",
    seoDescription:
      "Form order InstaChat Max AI untuk paket hemat. Isi data penerima, pilih pembayaran Bank Transfer atau QRIS, lalu lanjutkan pemesanan dengan cepat.",
  },
};

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

loadEnvFile();

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY")
);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function decodeHtml(value) {
  const dom = new JSDOM(`<!doctype html><p>${value}</p>`);
  return dom.window.document.querySelector("p")?.textContent?.trim() || value;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value, maxLength) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trim();
}

function limitTextSmart(value, maxLength) {
  const cleanValue = normalizeWhitespace(value);
  if (cleanValue.length <= maxLength) return cleanValue;

  const sentences = cleanValue.match(/[^.!?]+[.!?]?/g) || [];
  let combined = "";

  for (const sentence of sentences) {
    const candidate = normalizeWhitespace(`${combined} ${sentence}`.trim());
    if (candidate.length > maxLength) {
      break;
    }
    combined = candidate;
  }

  if (combined) {
    return combined;
  }

  const words = cleanValue.split(" ");
  let fallback = "";

  for (const word of words) {
    const candidate = `${fallback} ${word}`.trim();
    if (candidate.length > maxLength) {
      break;
    }
    fallback = candidate;
  }

  return fallback || cleanValue.slice(0, maxLength).trim();
}

function firstMeaningfulParagraph(document) {
  const paragraphs = [...document.querySelectorAll("p")];
  for (const paragraph of paragraphs) {
    const text = normalizeWhitespace(paragraph.textContent || "");
    if (text.length >= 40) {
      return text;
    }
  }
  return "";
}

function extractStandaloneSeo(rawHtml, fallbackTitle) {
  const dom = new JSDOM(rawHtml);
  const document = dom.window.document;
  const innerTitle = normalizeWhitespace(
    document.querySelector("title")?.textContent || ""
  );
  const metaDescription = normalizeWhitespace(
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") || ""
  );
  const firstParagraph = firstMeaningfulParagraph(document);
  const firstImage =
    document.querySelector("img[src]")?.getAttribute("src")?.trim() || "";

  return {
    title: innerTitle || fallbackTitle,
    seoTitle: limitText(innerTitle || fallbackTitle, 70),
    seoDescription: limitTextSmart(metaDescription || firstParagraph, 170),
    featuredImage: firstImage,
  };
}

function shouldRewriteAnchor(anchor) {
  const href = anchor.getAttribute("href")?.trim() || "";
  if (!href) return false;
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  ) {
    return false;
  }

  const text = normalizeWhitespace(anchor.textContent || "").toLowerCase();
  const className = `${anchor.getAttribute("class") || ""} ${
    anchor.getAttribute("id") || ""
  }`.toLowerCase();

  const looksLikeCta =
    /\b(beli|pesan|order|checkout|daftar|gabung|ambil|buy)\b/.test(text) ||
    /\b(btn|button|cta|checkout)\b/.test(className);

  if (!looksLikeCta) {
    return false;
  }

  let pathname = href;

  try {
    const url = new URL(href, SITE_URL);
    if (url.origin !== new URL(SITE_URL).origin) {
      return false;
    }
    pathname = url.pathname.toLowerCase();
  } catch {
    pathname = href.toLowerCase();
  }

  return (
    pathname === "/" ||
    pathname.includes("/checkout") ||
    pathname.includes("/cart") ||
    pathname.includes("/order") ||
    pathname.includes("/beli") ||
    pathname.includes("/produk")
  );
}

function resolveCheckoutUrl(slug) {
  return `${SITE_URL}/order/${slug}`;
}

function resolveTargetCheckoutUrl(productSlug, anchor) {
  const text = normalizeWhitespace(anchor.textContent || "").toLowerCase();

  if (productSlug === "instachatmax" && /paket ai/i.test(text)) {
    return resolveCheckoutUrl("instachatmax-ai");
  }

  return resolveCheckoutUrl(productSlug);
}

function rewriteStandaloneHtml(rawHtml, productSlug) {
  const dom = new JSDOM(rawHtml);
  const document = dom.window.document;

  document.querySelectorAll("a[href]").forEach((anchor) => {
    if (shouldRewriteAnchor(anchor)) {
      anchor.setAttribute("href", resolveTargetCheckoutUrl(productSlug, anchor));
    }
  });

  return dom.serialize();
}

async function fetchWordpressPage(slug) {
  const apiSlug = PAGE_SLUG_ALIASES[slug] || slug;
  const rows = await fetchJson(
    `${SITE_URL}/wp-json/wp/v2/pages?slug=${encodeURIComponent(
      apiSlug
    )}&_fields=id,slug,title,link,content`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0];
}

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,title,slug,thumbnail_url,is_active,click_target_type,click_target_page_id"
    )
    .eq("is_active", true)
    .order("title");

  if (error) throw error;
  return data || [];
}

async function loadPages() {
  const { data, error } = await supabase
    .from("pages")
    .select("id,title,slug,product_id,sort_order")
    .order("slug");

  if (error) throw error;
  return data || [];
}

function findExistingPage(product, pages, targetSlug) {
  return (
    pages.find((page) => page.product_id === product.id) ||
    pages.find((page) => page.slug.toLowerCase() === targetSlug.toLowerCase()) ||
    null
  );
}

async function upsertPage(product, pagePayload, existingPage) {
  const now = new Date().toISOString();
  const payload = {
    title: pagePayload.title,
    slug: pagePayload.slug,
    content_html: pagePayload.contentHtml,
    status: "published",
    product_id: product.id,
    hide_header_footer: true,
    seo_title: pagePayload.seoTitle,
    seo_description: pagePayload.seoDescription,
    featured_image: pagePayload.featuredImage || product.thumbnail_url || null,
    sort_order: existingPage?.sort_order || 0,
    updated_at: now,
  };

  if (existingPage) {
    const { error } = await supabase
      .from("pages")
      .update(payload)
      .eq("id", existingPage.id);

    if (error) throw error;
    return { id: existingPage.id, action: "updated" };
  }

  const { data, error } = await supabase
    .from("pages")
    .insert({
      id: randomUUID(),
      created_at: now,
      ...payload,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, action: "created" };
}

async function linkProductToPage(productId, pageId) {
  const { error } = await supabase
    .from("products")
    .update({
      click_target_type: "cms_page",
      click_target_page_id: pageId,
    })
    .eq("id", productId);

  if (error) throw error;
}

async function main() {
  const products = await loadProducts();
  const pages = await loadPages();
  const results = [];
  const missing = [];

  console.log(`Found ${products.length} active products.`);

  for (const [index, product] of products.entries()) {
    const sourcePage = await fetchWordpressPage(product.slug);

    if (!sourcePage) {
      missing.push(product.slug);
      console.log(`[${index + 1}/${products.length}] missing source page for ${product.slug}`);
      continue;
    }

    const renderedHtml = String(sourcePage.content?.rendered || "").trim();
    if (!renderedHtml) {
      missing.push(product.slug);
      console.log(`[${index + 1}/${products.length}] empty HTML for ${product.slug}`);
      continue;
    }

    const rewrittenHtml = rewriteStandaloneHtml(renderedHtml, product.slug);
    const seo = extractStandaloneSeo(
      rewrittenHtml,
      decodeHtml(sourcePage.title?.rendered || product.title)
    );
    const manualOverride = PAGE_SEO_OVERRIDES[product.slug] || null;
    const existingPage = findExistingPage(product, pages, product.slug);

    const pageResult = await upsertPage(
      product,
      {
        title:
          manualOverride?.title ||
          seo.title ||
          decodeHtml(sourcePage.title?.rendered || product.title),
        slug: product.slug,
        contentHtml: rewrittenHtml,
        seoTitle:
          manualOverride?.seoTitle ||
          seo.seoTitle ||
          decodeHtml(sourcePage.title?.rendered || product.title),
        seoDescription:
          manualOverride?.seoDescription ||
          seo.seoDescription ||
          limitText(`Landing page ${product.title} dari AzkazamDigital.`, 170),
        featuredImage: seo.featuredImage,
      },
      existingPage
    );

    await linkProductToPage(product.id, pageResult.id);

    results.push({
      productSlug: product.slug,
      pageSlug: product.slug,
      pageId: pageResult.id,
      action: pageResult.action,
      seoTitle: seo.seoTitle,
      seoDescription: seo.seoDescription,
    });

    console.log(
      `[${index + 1}/${products.length}] ${pageResult.action} page ${product.slug} for product ${product.slug}`
    );
  }

  console.log("\n=== IMPORT SUMMARY ===");
  console.log(JSON.stringify({ results, missing }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
