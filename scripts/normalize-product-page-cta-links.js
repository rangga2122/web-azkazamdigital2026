const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { createClient } = require("@supabase/supabase-js");

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

const SITE_URL = "https://www.azkazamdigital.com";

const SPECIAL_CHECKOUT_TARGETS = {
  instachatmax: [
    {
      matchText: /paket ai/i,
      targetSlug: "instachatmax-ai",
    },
    {
      matchText: /order|paket standar/i,
      targetSlug: "instachatmax",
    },
  ],
};

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function buildCheckoutUrl(slug) {
  return `${SITE_URL}/order/${slug}`;
}

function isPurchaseCta(anchor) {
  const href = anchor.getAttribute("href")?.trim() || "";
  const text = normalize(anchor.textContent || "").toLowerCase();

  if (!href) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;

  const purchaseByText =
    /\b(beli|pesan|order|checkout|pilih paket|dapatkan sekarang|mulai sekarang|dapatkan akses|dapatkan lisensi)\b/.test(
      text
    );
  const looksInformational =
    /\b(lihat|demo|fitur|youtube|detail)\b/.test(text) && !purchaseByText;
  const purchaseByHref =
    /\{\{CHECKOUT_URL/i.test(href) ||
    /azkazamdigital\.com\/.*(order|checkout|chekout|produk|perbulan|1-tahun|6-bulan|blastmap-order)/i.test(
      href
    ) ||
    /\/order\//i.test(href);

  if (looksInformational) {
    return false;
  }

  if (href.startsWith("#")) {
    return false;
  }

  return purchaseByText || purchaseByHref;
}

function resolveTargetSlug(pageSlug, defaultProductSlug, anchor) {
  const text = normalize(anchor.textContent || "");
  const specialRules = SPECIAL_CHECKOUT_TARGETS[pageSlug] || [];

  for (const rule of specialRules) {
    if (rule.matchText.test(text)) {
      return rule.targetSlug;
    }
  }

  return defaultProductSlug;
}

function normalizePageHtml(pageSlug, productSlug, html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let replacements = 0;

  document.querySelectorAll("a[href]").forEach((anchor) => {
    if (!isPurchaseCta(anchor)) {
      return;
    }

    const targetSlug = resolveTargetSlug(pageSlug, productSlug, anchor);
    const checkoutUrl = buildCheckoutUrl(targetSlug);
    const currentHref = anchor.getAttribute("href") || "";

    if (currentHref !== checkoutUrl) {
      anchor.setAttribute("href", checkoutUrl);
      replacements += 1;
    }
  });

  return {
    html: dom.serialize(),
    replacements,
  };
}

async function main() {
  const { data, error } = await supabase
    .from("pages")
    .select("id,slug,content_html,product_id,product:products!pages_product_id_fkey(slug)")
    .not("product_id", "is", null)
    .order("slug");

  if (error) {
    throw error;
  }

  const results = [];

  for (const page of data || []) {
    const productSlug = page.product?.slug?.trim().toLowerCase();
    if (!productSlug) {
      results.push({
        pageSlug: page.slug,
        replacements: 0,
        skipped: "missing_product_slug",
      });
      continue;
    }

    const normalized = normalizePageHtml(
      page.slug,
      productSlug,
      page.content_html || ""
    );

    if (normalized.replacements === 0) {
      results.push({
        pageSlug: page.slug,
        replacements: 0,
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from("pages")
      .update({
        content_html: normalized.html,
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id);

    if (updateError) {
      throw updateError;
    }

    results.push({
      pageSlug: page.slug,
      replacements: normalized.replacements,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
