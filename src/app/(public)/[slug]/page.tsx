import { createServiceRoleClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EmbeddedHtmlPage } from "@/components/public/EmbeddedHtmlPage";
import { AffiliateReferralTracker } from "@/components/public/AffiliateReferralTracker";
import {
  formatPrice,
  isStandaloneHtml,
  prepareEmbeddedHtmlDocument,
  sanitizeHtml,
} from "@/lib/utils";
import type { Page } from "@/types";
import type { Metadata } from "next";

const getCachedPage = unstable_cache(
  async (slug: string) => {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("pages")
      .select("*, product:products!pages_product_id_fkey(id,title,slug,thumbnail_url,price,affiliate_commission_rate)")
      .eq("slug", slug)
      .eq("status", "published")
      .single();
    return data as Page | null;
  },
  ["public-page"],
  { revalidate: 60, tags: ["public-pages"] }
);

async function getPage(slug: string) {
  return getCachedPage(slug);
}

async function getMenuContentSettings() {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("social_links")
      .limit(1)
      .single();

    return (data?.social_links || {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function applyMenuContentSettings(page: Page) {
  if (page.slug !== "tentang-kami") return page;

  const socialLinks = await getMenuContentSettings();
  const title = getSocialText(socialLinks, "about_title", page.title);
  const subtitle = getSocialText(socialLinks, "about_subtitle", "");
  const contentOverride = getSocialText(socialLinks, "about_content_html", "");
  const baseContent = contentOverride || page.content_html;
  const contentHtml = subtitle
    ? `<p>${escapeHtml(subtitle)}</p>\n${baseContent}`
    : baseContent;

  return {
    ...page,
    title,
    content_html: contentHtml,
  };
}

function removeLeadingContentHeading(html: string) {
  return html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pageData = await getPage(slug);
  if (!pageData) return { title: "Halaman Tidak Ditemukan" };
  const page = await applyMenuContentSettings(pageData);
  return {
    title: page.seo_title || page.title,
    description: page.seo_description || "",
    openGraph: {
      title: page.seo_title || page.title,
      description: page.seo_description || "",
    },
  };
}

export default async function DynamicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const pageData = await getPage(slug);
  if (!pageData) notFound();
  const page = await applyMenuContentSettings(pageData);
  const checkoutUrl = page.product
    ? withReferral(`/order/${page.product.slug}`, ref)
    : "";
  const pageUrl = withReferral(`/${page.slug}`, ref);
  const contentHtml = applyPagePlaceholders(page.content_html || "", page, {
    checkoutUrl,
    pageUrl,
  });
  const hasStandaloneHtml = page.content_html
    ? isStandaloneHtml(page.content_html)
    : false;

  if (contentHtml && hasStandaloneHtml) {
    const embeddedPage = prepareEmbeddedHtmlDocument(contentHtml);

    return (
      <div className="min-h-screen bg-white" data-hide-public-chrome={page.hide_header_footer ? "true" : undefined}>
        {page.hide_header_footer && <HidePublicChromeStyle />}
        {page.product && <AffiliateReferralTracker productSlug={page.product.slug} />}
        <EmbeddedHtmlPage document={embeddedPage} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 sm:py-20" data-hide-public-chrome={page.hide_header_footer ? "true" : undefined}>
      {page.hide_header_footer && <HidePublicChromeStyle />}
      {page.product && <AffiliateReferralTracker productSlug={page.product.slug} />}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {page.title}
          </h1>

        </div>

        {/* Content */}
        {page.content_html && (
          <div
            className="cms-content rounded-2xl bg-dark-900 border border-dark-800 p-6 sm:p-10"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(removeLeadingContentHeading(contentHtml)),
            }}
          />
        )}
      </div>
    </div>
  );
}

function HidePublicChromeStyle() {
  return (
    <style>
      {`
        body:has([data-hide-public-chrome="true"]) [data-public-header],
        body:has([data-hide-public-chrome="true"]) [data-public-footer] {
          display: none !important;
        }
      `}
    </style>
  );
}

function applyPagePlaceholders(
  html: string,
  page: Page,
  urls: { checkoutUrl: string; pageUrl: string }
) {
  return html
    .replaceAll("{{PAGE_TITLE}}", escapeHtml(page.title))
    .replaceAll("{{PAGE_URL}}", escapeHtml(urls.pageUrl))
    .replaceAll("{{CHECKOUT_URL}}", escapeHtml(urls.checkoutUrl))
    .replaceAll("{{ORDER_URL}}", escapeHtml(urls.checkoutUrl))
    .replaceAll("{{PRODUCT_TITLE}}", escapeHtml(page.product?.title || ""))
    .replaceAll("{{PRODUCT_PRICE}}", escapeHtml(page.product ? formatPrice(page.product.price) : ""));
}

function withReferral(url: string, ref?: string) {
  if (!ref || !url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ref=${encodeURIComponent(ref)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getSocialText(
  socialLinks: Record<string, unknown>,
  key: string,
  fallback: string
) {
  const value = socialLinks[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
