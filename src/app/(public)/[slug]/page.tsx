import { createServiceRoleClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EmbeddedHtmlPage } from "@/components/public/EmbeddedHtmlPage";
import { AffiliateReferralTracker } from "@/components/public/AffiliateReferralTracker";
import { ExternalHeadLinks } from "@/components/public/ExternalHeadLinks";
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
    ? withReferral(buildPublicUrl(`/order/${page.product.slug}`), ref)
    : "";
  const pageUrl = withReferral(buildPublicUrl(`/${page.slug}`), ref);
  const contentHtml = applyPagePlaceholders(page.content_html || "", page, {
    checkoutUrl,
    pageUrl,
    referralCode: ref,
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
        <ExternalHeadLinks html={contentHtml} />
        <EmbeddedHtmlPage document={embeddedPage} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 sm:py-20" data-hide-public-chrome={page.hide_header_footer ? "true" : undefined}>
      {page.hide_header_footer && <HidePublicChromeStyle />}
      {page.product && <AffiliateReferralTracker productSlug={page.product.slug} />}
      {contentHtml && <ExternalHeadLinks html={contentHtml} />}
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
        body:has([data-hide-public-chrome="true"]) [data-public-footer],
        body:has([data-hide-public-chrome="true"]) [data-whatsapp-float] {
          display: none !important;
        }
      `}
    </style>
  );
}

function applyPagePlaceholders(
  html: string,
  page: Page,
  urls: { checkoutUrl: string; pageUrl: string; referralCode?: string }
) {
  const withScopedCheckoutUrls = html
    .replace(
      /\{\{CHECKOUT_URL:([a-z0-9-]+)\}\}/gi,
      (_, slug: string) => escapeHtml(buildCheckoutUrlForSlug(slug, urls.referralCode))
    )
    .replace(
      /\{\{ORDER_URL:([a-z0-9-]+)\}\}/gi,
      (_, slug: string) => escapeHtml(buildCheckoutUrlForSlug(slug, urls.referralCode))
    );

  const withPlaceholders = withScopedCheckoutUrls
    .replaceAll("{{PAGE_TITLE}}", escapeHtml(page.title))
    .replaceAll("{{PAGE_URL}}", escapeHtml(urls.pageUrl))
    .replaceAll("{{CHECKOUT_URL}}", escapeHtml(urls.checkoutUrl))
    .replaceAll("{{ORDER_URL}}", escapeHtml(urls.checkoutUrl))
    .replaceAll("{{PRODUCT_TITLE}}", escapeHtml(page.product?.title || ""))
    .replaceAll("{{PRODUCT_PRICE}}", escapeHtml(page.product ? formatPrice(page.product.price) : ""));

  return normalizeStandaloneProductLinks(withPlaceholders, page, urls);
}

function withReferral(url: string, ref?: string) {
  if (!ref || !url) return url;
  const nextUrl = new URL(url, "https://www.azkazamdigital.com");
  nextUrl.searchParams.set("ref", ref);
  return nextUrl.toString();
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

function buildCheckoutUrlForSlug(slug: string, ref?: string) {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) {
    return "";
  }

  return withReferral(buildPublicUrl(`/order/${cleanSlug}`), ref);
}

function buildPublicUrl(pathname: string) {
  const baseUrl = resolvePublicSiteBaseUrl();
  return new URL(pathname, baseUrl).toString();
}

function resolvePublicSiteBaseUrl() {
  const envCandidates = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "",
  ].filter(Boolean);

  const preferred = envCandidates.find((value) =>
    /azkazamdigital\.com/i.test(value)
  );

  return preferred || "https://www.azkazamdigital.com";
}

function normalizeStandaloneProductLinks(
  html: string,
  page: Page,
  urls: { checkoutUrl: string; pageUrl: string }
) {
  if (!page.product || !urls.checkoutUrl) {
    return html;
  }

  return html.replace(
    /<a\b([^>]*?)href=(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, beforeHref: string, quote: string, href: string, afterHref: string, innerHtml: string) => {
      if (!shouldRewriteProductLink(href, innerHtml, beforeHref, afterHref, page, urls)) {
        return match;
      }

      return `<a${beforeHref}href=${quote}${escapeHtml(urls.checkoutUrl)}${quote}${afterHref}>${innerHtml}</a>`;
    }
  );
}

function shouldRewriteProductLink(
  href: string,
  innerHtml: string,
  beforeHref: string,
  afterHref: string,
  page: Page,
  urls: { checkoutUrl: string; pageUrl: string }
) {
  const normalizedHref = href.trim();
  if (!normalizedHref || normalizedHref.startsWith("#")) {
    return false;
  }

  const text = stripHtml(innerHtml).toLowerCase();
  const attrs = `${beforeHref} ${afterHref}`.toLowerCase();
  const looksLikeCheckoutCta =
    /\b(beli|pesan|order|checkout|daftar)\b/.test(text) ||
    /\bbtn-primary\b|\bbtn-checkout\b/.test(attrs);

  if (!looksLikeCheckoutCta) {
    return false;
  }

  const candidates = new Set(
    [
      "/",
      page.slug ? `/${page.slug}` : "",
      urls.pageUrl,
      removeQueryAndHash(urls.pageUrl),
    ]
      .map((value) => normalizeComparablePath(value))
      .filter(Boolean)
  );

  return candidates.has(normalizeComparablePath(normalizedHref));
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function removeQueryAndHash(value: string) {
  return value.replace(/[?#].*$/, "");
}

function normalizeComparablePath(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  if (trimmedValue.startsWith("#")) {
    return trimmedValue;
  }

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const url = new URL(trimmedValue, baseUrl);
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return trimmedValue.replace(/\/+$/, "") || "/";
  }
}
