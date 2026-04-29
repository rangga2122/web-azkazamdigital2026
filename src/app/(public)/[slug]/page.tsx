import { createServiceRoleClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EmbeddedHtmlPage } from "@/components/public/EmbeddedHtmlPage";
import { AffiliateReferralTracker } from "@/components/public/AffiliateReferralTracker";
import { ExternalHeadLinks } from "@/components/public/ExternalHeadLinks";
import {
  extractProductRecommendationTokens,
  replaceProductRecommendationShortcodes,
  type ProductRecommendationSource,
} from "@/lib/article-product-recommendations";
import {
  buildScopedEmbeddedStyles,
  extractEmbeddedHeadLinks,
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
  const contentHtml = await renderPageContent(
    applyPagePlaceholders(page.content_html || "", page, {
      checkoutUrl,
      pageUrl,
      referralCode: ref,
    })
  );
  const hasStandaloneHtml = page.content_html
    ? isStandaloneHtml(page.content_html)
    : false;
  const hidePublicChrome = page.hide_header_footer || hasStandaloneHtml;

  if (contentHtml && hasStandaloneHtml) {
    const embeddedPage = prepareEmbeddedHtmlDocument(contentHtml);
    const scopeId = buildEmbeddedScopeId(page.slug);
    const scopedStyles = buildScopedEmbeddedStyles(
      embeddedPage.styles,
      `[data-embedded-html-scope="${scopeId}"]`
    );
    const embeddedHeadLinks = extractEmbeddedHeadLinks(embeddedPage.headHtml);

    return (
      <div className="min-h-screen bg-white" data-hide-public-chrome={hidePublicChrome ? "true" : undefined}>
        {hidePublicChrome && <HidePublicChromeStyle />}
        {page.product && <AffiliateReferralTracker productSlug={page.product.slug} />}
        <EmbeddedHeadAssets
          headLinks={embeddedHeadLinks}
          scopeId={scopeId}
          scopedStyles={scopedStyles}
        />
        <EmbeddedHtmlPage document={embeddedPage} scopeId={scopeId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 sm:py-20" data-hide-public-chrome={hidePublicChrome ? "true" : undefined}>
      {hidePublicChrome && <HidePublicChromeStyle />}
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

function EmbeddedHeadAssets({
  headLinks,
  scopeId,
  scopedStyles,
}: {
  headLinks: Array<{
    rel: string;
    href: string;
    attributes: Record<string, string | true>;
  }>;
  scopeId: string;
  scopedStyles: string;
}) {
  return (
    <>
      {headLinks.map((link, index) => (
        <link
          key={`${link.rel}-${link.href}-${index}`}
          {...toDomAttributes(link.attributes)}
        />
      ))}
      {scopedStyles ? (
        <style
          data-embedded-html-style={scopeId}
          dangerouslySetInnerHTML={{ __html: scopedStyles }}
        />
      ) : null}
    </>
  );
}

function toDomAttributes(attributes: Record<string, string | true>) {
  const reactAttributeMap: Record<string, string> = {
    crossorigin: "crossOrigin",
    referrerpolicy: "referrerPolicy",
    fetchpriority: "fetchPriority",
    hreflang: "hrefLang",
    imagesizes: "imageSizes",
    imagesrcset: "imageSrcSet",
  };

  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      reactAttributeMap[name.toLowerCase()] || name,
      value === true ? "" : value,
    ])
  );
}

function buildEmbeddedScopeId(slug: string) {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-");
  return `embedded-html-${safeSlug || "page"}`;
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

async function renderPageContent(contentHtml: string) {
  const tokens = extractProductRecommendationTokens(contentHtml);
  if (tokens.length === 0) {
    return contentHtml;
  }

  const slugs = Array.from(new Set(tokens.map((token) => token.slug)));
  const supabase = await createServiceRoleClient();
  const { data: products } = await supabase
    .from("products")
    .select(`
      title,
      slug,
      thumbnail_url,
      short_description,
      click_target_type,
      is_active,
      click_target_page:pages!products_click_target_page_id_fkey (
        slug
      )
    `)
    .in("slug", slugs)
    .eq("is_active", true);

  const productsBySlug = ((products || []) as Array<
    ProductRecommendationSource & {
      is_active: boolean;
      click_target_page?: { slug: string } | Array<{ slug: string }> | null;
    }
  >).reduce<Record<string, ProductRecommendationSource>>(
    (accumulator, product) => {
      accumulator[product.slug] = {
        title: product.title,
        slug: product.slug,
        thumbnail_url: product.thumbnail_url,
        short_description: product.short_description,
        click_target_type: product.click_target_type,
        click_target_page_slug: getRelatedPageSlug(product.click_target_page),
      };
      return accumulator;
    },
    {}
  );

  return replaceProductRecommendationShortcodes(contentHtml, productsBySlug);
}

function getRelatedPageSlug(
  relation: { slug: string } | Array<{ slug: string }> | null | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.slug || null;
  }

  return relation?.slug || null;
}
