import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/produk`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/artikel`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/kontak`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/affiliate`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];

  try {
    const supabase = await createServiceRoleClient();

    // Products
    const { data: products } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true);

    if (products) {
      products.forEach((p) => {
        entries.push({
          url: `${baseUrl}/produk/${p.slug}`,
          lastModified: new Date(p.updated_at),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      });
    }

    // Pages
    const { data: pages } = await supabase
      .from("pages")
      .select("slug, updated_at")
      .eq("status", "published");

    if (pages) {
      pages.forEach((p) => {
        entries.push({
          url: `${baseUrl}/${p.slug}`,
          lastModified: new Date(p.updated_at),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      });
    }

    const { data: articles } = await supabase
      .from("articles")
      .select("slug, updated_at, published_at")
      .eq("status", "published");

    if (articles) {
      articles.forEach((article) => {
        entries.push({
          url: `${baseUrl}/artikel/${article.slug}`,
          lastModified: new Date(article.updated_at || article.published_at || Date.now()),
          changeFrequency: "weekly",
          priority: 0.75,
        });
      });
    }

    // Categories
    const { data: categories } = await supabase
      .from("categories")
      .select("slug, updated_at");

    if (categories) {
      categories.forEach((c) => {
        entries.push({
          url: `${baseUrl}/produk?kategori=${c.slug}`,
          lastModified: new Date(c.updated_at),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      });
    }
  } catch {
    // Silently fail if Supabase not configured
  }

  return entries;
}
