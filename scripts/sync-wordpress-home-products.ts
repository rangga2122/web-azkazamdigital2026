import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";

type HomeProduct = {
  title: string;
  slug: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
  badge: string | null;
  compareAtPrice: number | null;
  price: number;
  shortDescription: string;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

const SITE_URL = "https://www.azkazamdigital.com/";
const PRODUCT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function slugFromUrl(url: string) {
  const pathname = new URL(url).pathname.replace(/\/+/g, "/").replace(/\/$/, "");
  const segment = pathname.split("/").filter(Boolean).pop() || "";
  return segment.toLowerCase();
}

function parseIdr(text: string) {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AzkazamDigitalBot/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function extractHomeProducts(html: string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const cards = [...document.querySelectorAll(".product-card")];

  const products: HomeProduct[] = cards
    .map((card) => {
      const link = card.querySelector("a[href*='azkazamdigital.com']") as HTMLAnchorElement | null;
      const image = card.querySelector("img") as HTMLImageElement | null;
      const title = card.querySelector("h2, h3, .product-title, .title")?.textContent?.trim() || "";
      const text = card.textContent?.replace(/\s+/g, " ").trim() || "";

      if (!link?.href || !image?.src || !title) {
        return null;
      }

      const slug = slugFromUrl(link.href);
      if (!slug) {
        return null;
      }

      const oldPriceMatch = (text.match(/Rp[\.\d, ]+/g) || []) as string[];
      const priceValues = oldPriceMatch
        .map((value: string) => parseIdr(value))
        .filter((value: number | null): value is number => Boolean(value));
      const compareAtPrice = priceValues.length > 1 ? priceValues[0] : null;
      const price = priceValues.length > 1 ? priceValues[1] : priceValues[0] || 0;

      const badgeText = card.querySelector(".badge, .product-badge, .onsale")?.textContent?.trim()
        || text.match(/^(New|Best Seller|Trending)/i)?.[0]
        || null;

      return {
        title,
        slug,
        href: toAbsoluteUrl(link.href, SITE_URL),
        imageUrl: toAbsoluteUrl(image.currentSrc || image.src, SITE_URL),
        imageAlt: image.alt?.trim() || title,
        badge: badgeText,
        compareAtPrice,
        price,
        shortDescription: title,
      } satisfies HomeProduct;
    })
    .filter((item): item is HomeProduct => Boolean(item));

  const uniqueBySlug = new Map<string, HomeProduct>();
  for (const product of products) {
    uniqueBySlug.set(product.slug, product);
  }

  return [...uniqueBySlug.values()];
}

async function downloadProductImage(imageUrl: string, slug: string) {
  const response = await fetch(imageUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AzkazamDigitalBot/1.0)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to download image ${imageUrl}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const urlPath = new URL(imageUrl).pathname;
  const originalExt = path.extname(urlPath) || ".jpg";
  const ext = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(originalExt.toLowerCase())
    ? originalExt.toLowerCase()
    : ".jpg";

  const hash = createHash("md5").update(imageUrl).digest("hex").slice(0, 10);
  const filename = `${slug}-${hash}${ext}`;

  await mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });
  const absolutePath = path.join(PRODUCT_UPLOAD_DIR, filename);
  await writeFile(absolutePath, buffer);

  return `/uploads/products/${filename}`;
}

async function upsertProduct(item: HomeProduct, imagePath: string) {
  const now = new Date().toISOString();
  const payload = {
    title: item.title,
    slug: item.slug,
    short_description: item.shortDescription,
    description_html: "",
    landing_page_mode: "default",
    landing_page_html: "",
    click_target_type: "checkout",
    click_target_page_id: null,
    price: item.price,
    compare_at_price: item.compareAtPrice,
    thumbnail_url: imagePath,
    banner_url: imagePath,
    affiliate_commission_type: "percent",
    affiliate_commission_rate: 30,
    affiliate_commission_amount: 0,
    is_active: true,
    is_featured: true,
    badge: item.badge,
    purchase_url: null,
    checkout_url: null,
    demo_url: item.href,
    digital_file_url: null,
    seo_title: item.title,
    seo_description: item.shortDescription,
    updated_at: now,
  };

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id, slug")
    .eq("slug", item.slug)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
    if (error) {
      throw error;
    }
    return { id: existing.id, action: "updated" as const };
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      id: randomUUID(),
      created_at: now,
      ...payload,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id, action: "created" as const };
}

async function main() {
  console.log("Mengambil homepage WordPress...");
  const html = await fetchHtml(SITE_URL);
  const items = extractHomeProducts(html);

  if (!items.length) {
    throw new Error("Tidak menemukan kartu produk di homepage WordPress.");
  }

  console.log(`Ditemukan ${items.length} produk homepage.`);

  for (const [index, item] of items.entries()) {
    console.log(`[${index + 1}/${items.length}] download gambar + sinkron produk: ${item.slug}`);
    const imagePath = await downloadProductImage(item.imageUrl, item.slug);
    const result = await upsertProduct(item, imagePath);
    console.log(`  -> ${result.action} (${result.id}) gambar ${imagePath}`);
  }

  console.log("Selesai sinkron produk homepage.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
