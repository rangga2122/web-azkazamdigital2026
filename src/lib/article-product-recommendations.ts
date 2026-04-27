import type { Product } from "@/types";

export type ProductRecommendationStyle = "spotlight" | "compact" | "banner";
export type ProductRecommendationLinkTarget = "product" | "order" | "landing";

export type ProductRecommendationSource = {
  title: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  click_target_type?: Product["click_target_type"] | null;
  click_target_page_slug?: string | null;
  preferred_caption?: string | null;
  preferred_style?: ProductRecommendationStyle | null;
  preferred_link_target?: ProductRecommendationLinkTarget | null;
  contact_label?: string | null;
  contact_url?: string | null;
};

export const PRODUCT_RECOMMENDATION_SHORTCODE_EXAMPLE =
  '[product-recommendation slug="slug-produk" caption="Caption singkat produk" style="spotlight" link="product" contactLabel="Hubungi Admin" contactUrl="https://wa.me/628123456789"]';

export const PRODUCT_RECOMMENDATION_STYLE_OPTIONS: Array<{
  value: ProductRecommendationStyle;
  label: string;
}> = [
  { value: "spotlight", label: "Spotlight Besar" },
  { value: "compact", label: "Compact Ringkas" },
  { value: "banner", label: "Banner Lebar" },
];

export const PRODUCT_RECOMMENDATION_LINK_OPTIONS: Array<{
  value: ProductRecommendationLinkTarget;
  label: string;
}> = [
  { value: "product", label: "Gateway Produk" },
  { value: "order", label: "Form Order" },
  { value: "landing", label: "Landing Page" },
];

type ProductRecommendationToken = {
  raw: string;
  slug: string;
  caption: string;
  style: ProductRecommendationStyle;
  linkTarget: ProductRecommendationLinkTarget;
  contactLabel: string;
  contactUrl: string;
};

type BuildShortcodeInput = {
  slug: string;
  caption?: string | null;
  style?: ProductRecommendationStyle | null;
  linkTarget?: ProductRecommendationLinkTarget | null;
  contactLabel?: string | null;
  contactUrl?: string | null;
};

const PRODUCT_RECOMMENDATION_PATTERN =
  /\[product-recommendation\s+([^\]]*?)\]/gi;
const SHORTCODE_ATTRIBUTE_PATTERN = /([a-zA-Z_][\w-]*)="([^"]*)"/g;
const DEFAULT_RECOMMENDATION_STYLE: ProductRecommendationStyle = "spotlight";
const DEFAULT_RECOMMENDATION_LINK_TARGET: ProductRecommendationLinkTarget =
  "product";

export function extractProductRecommendationTokens(content: string) {
  const tokens: ProductRecommendationToken[] = [];

  for (const match of content.matchAll(PRODUCT_RECOMMENDATION_PATTERN)) {
    const attributes = parseShortcodeAttributes(match[1] || "");
    const slug = String(attributes.slug || "").trim();

    if (!slug) continue;

    tokens.push({
      raw: match[0],
      slug,
      caption: String(attributes.caption || "").trim(),
      style: normalizeRecommendationStyle(attributes.style),
      linkTarget: normalizeRecommendationLinkTarget(attributes.link),
      contactLabel: String(attributes.contactLabel || "").trim(),
      contactUrl: String(attributes.contactUrl || "").trim(),
    });
  }

  return tokens;
}

export function hasProductRecommendationShortcode(content: string) {
  return extractProductRecommendationTokens(content).length > 0;
}

export function buildProductRecommendationShortcode({
  slug,
  caption,
  style,
  linkTarget,
  contactLabel,
  contactUrl,
}: BuildShortcodeInput) {
  const cleanSlug = slug.trim();
  const cleanCaption = sanitizeShortcodeAttribute(caption || "");
  const normalizedStyle = normalizeRecommendationStyle(style);
  const normalizedLinkTarget = normalizeRecommendationLinkTarget(linkTarget);
  const cleanContactLabel = sanitizeShortcodeAttribute(contactLabel || "");
  const cleanContactUrl = sanitizeShortcodeAttribute(contactUrl || "");

  const attributes = [`slug="${cleanSlug}"`];

  if (cleanCaption) {
    attributes.push(`caption="${cleanCaption}"`);
  }

  if (normalizedStyle !== DEFAULT_RECOMMENDATION_STYLE) {
    attributes.push(`style="${normalizedStyle}"`);
  }

  if (normalizedLinkTarget !== DEFAULT_RECOMMENDATION_LINK_TARGET) {
    attributes.push(`link="${normalizedLinkTarget}"`);
  }

  if (cleanContactLabel && cleanContactUrl) {
    attributes.push(`contactLabel="${cleanContactLabel}"`);
    attributes.push(`contactUrl="${cleanContactUrl}"`);
  }

  return `\n\n[product-recommendation ${attributes.join(" ")}]\n\n`;
}

export function replaceProductRecommendationShortcodes(
  content: string,
  productsBySlug: Record<string, ProductRecommendationSource>
) {
  return content.replace(
    PRODUCT_RECOMMENDATION_PATTERN,
    (_match, rawAttributes: string) => {
      const attributes = parseShortcodeAttributes(String(rawAttributes || ""));
      const slug = String(attributes.slug || "").trim();
      const product = productsBySlug[slug];

      if (!product) {
        return "";
      }

      const caption =
        String(attributes.caption || "").trim() ||
        product.preferred_caption ||
        product.short_description ||
        "";
      const style = normalizeRecommendationStyle(attributes.style);
      const linkTarget = normalizeRecommendationLinkTarget(attributes.link);
      const contactLabel =
        String(attributes.contactLabel || "").trim() ||
        String(product.contact_label || "").trim();
      const contactUrl =
        String(attributes.contactUrl || "").trim() ||
        String(product.contact_url || "").trim();

      return buildProductRecommendationHtml(
        product,
        caption,
        style,
        linkTarget,
        contactLabel,
        contactUrl
      );
    }
  );
}

export function injectProductRecommendationIntoHtml(
  content: string,
  shortcode: string
) {
  return injectProductRecommendationShortcodes(content, [shortcode]);
}

export function injectProductRecommendationShortcodes(
  content: string,
  shortcodes: string[]
) {
  const normalizedShortcodes = shortcodes
    .map((shortcode) => shortcode.trim())
    .filter(Boolean);

  if (normalizedShortcodes.length === 0) {
    return content;
  }

  const markers = Array.from(
    content.matchAll(/<\/(p|ul|ol|blockquote|table|div|section)>/gi)
  );

  if (markers.length === 0) {
    return `${content.trim()}\n\n${normalizedShortcodes.join("\n\n")}\n`;
  }

  const insertions = normalizedShortcodes
    .map((shortcode, index) => {
      const ratio = (index + 1) / (normalizedShortcodes.length + 1);
      const markerIndex = Math.min(
        markers.length - 1,
        Math.max(0, Math.floor(markers.length * ratio))
      );
      const marker = markers[markerIndex];

      return {
        insertionIndex: (marker.index || 0) + marker[0].length,
        shortcode,
        order: index,
      };
    })
    .sort((left, right) => left.insertionIndex - right.insertionIndex || left.order - right.order);

  let cursor = 0;
  let output = "";

  for (const insertion of insertions) {
    output += content.slice(cursor, insertion.insertionIndex);
    output += `\n\n${insertion.shortcode}\n\n`;
    cursor = insertion.insertionIndex;
  }

  output += content.slice(cursor);

  return output;
}

function buildProductRecommendationHtml(
  product: ProductRecommendationSource,
  caption: string,
  style: ProductRecommendationStyle,
  linkTarget: ProductRecommendationLinkTarget,
  contactLabel: string,
  contactUrl: string
) {
  const resolvedLink = resolveProductRecommendationLink(product, linkTarget);
  const ctaLabel = getRecommendationCtaLabel(linkTarget, resolvedLink.fallbackUsed);

  if (style === "compact") {
    return buildCompactRecommendationHtml(
      product,
      caption,
      resolvedLink.href,
      ctaLabel,
      contactLabel,
      contactUrl
    );
  }

  if (style === "banner") {
    return buildBannerRecommendationHtml(
      product,
      caption,
      resolvedLink.href,
      ctaLabel,
      contactLabel,
      contactUrl
    );
  }

  return buildSpotlightRecommendationHtml(
    product,
    caption,
    resolvedLink.href,
    ctaLabel,
    contactLabel,
    contactUrl
  );
}

function buildSpotlightRecommendationHtml(
  product: ProductRecommendationSource,
  caption: string,
  href: string,
  ctaLabel: string,
  contactLabel: string,
  contactUrl: string
) {
  const imageHtml = buildRecommendationImage(product, "h-full w-full object-cover", 220);

  return `
<div data-product-recommendation="true" data-style="spotlight" class="my-10 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
  <div class="mb-4 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-500">
    Rekomendasi Produk
  </div>
  <div class="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
    <a href="${escapeHtmlAttr(
      href
    )}" class="block overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      ${imageHtml}
    </a>
    <div>
      <a href="${escapeHtmlAttr(
        href
      )}" class="text-xl font-bold leading-tight text-slate-900 no-underline" style="color:#0f172a;text-decoration:none;">
        ${escapeHtml(product.title)}
      </a>
      ${
        caption
          ? `<p class="mt-3 text-sm leading-7 text-slate-600" style="color:#475569;">${escapeHtml(
              caption
            )}</p>`
          : ""
      }
      <a href="${escapeHtmlAttr(
        href
      )}" class="mt-5 inline-flex items-center rounded-full bg-gradient-to-r from-primary-600 to-accent-600 px-5 py-3 text-sm font-semibold text-white no-underline" style="color:#ffffff;text-decoration:none;">
        ${escapeHtml(ctaLabel)}
      </a>
      ${
        contactUrl
          ? `<a href="${escapeHtmlAttr(
              contactUrl
            )}" target="_blank" rel="noreferrer" class="mt-3 inline-flex items-center text-sm font-semibold text-sky-600 no-underline" style="color:#0284c7;text-decoration:none;">
        ${escapeHtml(contactLabel || "Hubungi Sekarang")}
      </a>`
          : ""
      }
    </div>
  </div>
</div>`.trim();
}

function buildCompactRecommendationHtml(
  product: ProductRecommendationSource,
  caption: string,
  href: string,
  ctaLabel: string,
  contactLabel: string,
  contactUrl: string
) {
  const imageHtml = buildRecommendationImage(
    product,
    "h-full w-full object-cover",
    120
  );

  return `
<div data-product-recommendation="true" data-style="compact" class="my-8 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-[0_14px_32px_rgba(15,23,42,0.07)] sm:p-4">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
    <a href="${escapeHtmlAttr(
      href
    )}" class="block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white sm:w-[148px]">
      ${imageHtml}
    </a>
    <div class="min-w-0 flex-1">
      <div class="mb-2 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-500">
        Pilihan Cepat
      </div>
      <a href="${escapeHtmlAttr(
        href
      )}" class="block text-lg font-semibold leading-tight text-slate-900 no-underline" style="color:#0f172a;text-decoration:none;">
        ${escapeHtml(product.title)}
      </a>
      ${
        caption
          ? `<p class="mt-2 text-sm leading-6 text-slate-600" style="color:#475569;">${escapeHtml(
              caption
            )}</p>`
          : ""
      }
    </div>
    <div class="sm:self-center">
      <a href="${escapeHtmlAttr(
        href
      )}" class="inline-flex w-full items-center justify-center rounded-full border border-primary-200 bg-gradient-to-r from-primary-600 to-accent-600 px-4 py-2.5 text-sm font-semibold text-white no-underline sm:w-auto" style="color:#ffffff;text-decoration:none;">
        ${escapeHtml(ctaLabel)}
      </a>
      ${
        contactUrl
          ? `<a href="${escapeHtmlAttr(
              contactUrl
            )}" target="_blank" rel="noreferrer" class="mt-2 inline-flex w-full items-center justify-center text-sm font-semibold text-sky-600 no-underline sm:w-auto" style="color:#0284c7;text-decoration:none;">
        ${escapeHtml(contactLabel || "Hubungi Sekarang")}
      </a>`
          : ""
      }
    </div>
  </div>
</div>`.trim();
}

function buildBannerRecommendationHtml(
  product: ProductRecommendationSource,
  caption: string,
  href: string,
  ctaLabel: string,
  contactLabel: string,
  contactUrl: string
) {
  const imageHtml = product.thumbnail_url
    ? `<img src="${escapeHtmlAttr(product.thumbnail_url)}" alt="${escapeHtmlAttr(
        product.title
      )}" class="h-full w-full object-cover" loading="lazy" />`
    : "";

  return `
<div data-product-recommendation="true" data-style="banner" class="my-10 overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white px-5 py-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:px-7">
  <div class="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
    <a href="${escapeHtmlAttr(
      href
    )}" class="block overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
      ${imageHtml || `<div class="flex min-h-[220px] items-center justify-center bg-slate-100 text-4xl font-bold text-slate-400">${escapeHtml(
        product.title.charAt(0).toUpperCase()
      )}</div>`}
    </a>
    <div>
    <div class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-500">
      Direkomendasikan
    </div>
    <div class="mt-4 flex flex-col gap-5">
      <div class="max-w-2xl">
        <a href="${escapeHtmlAttr(
          href
        )}" class="block text-2xl font-bold leading-tight text-slate-900 no-underline sm:text-3xl" style="color:#0f172a;text-decoration:none;">
          ${escapeHtml(product.title)}
        </a>
        ${
          caption
            ? `<p class="mt-3 max-w-2xl text-sm leading-7 text-slate-600" style="color:#475569;">${escapeHtml(
                caption
              )}</p>`
            : ""
        }
      </div>
      <div class="flex flex-wrap gap-3">
        <a href="${escapeHtmlAttr(
          href
        )}" class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-primary-600 to-accent-600 px-5 py-3 text-sm font-semibold text-white no-underline" style="color:#ffffff;text-decoration:none;">
          ${escapeHtml(ctaLabel)}
        </a>
        ${
          contactUrl
            ? `<a href="${escapeHtmlAttr(
                contactUrl
              )}" target="_blank" rel="noreferrer" class="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-sky-600 no-underline" style="color:#0284c7;text-decoration:none;">
          ${escapeHtml(contactLabel || "Hubungi Sekarang")}
        </a>`
            : ""
        }
      </div>
    </div>
  </div>
</div>
</div>`.trim();
}

function buildRecommendationImage(
  product: ProductRecommendationSource,
  imageClassName: string,
  minHeight: number
) {
  return product.thumbnail_url
    ? `<img src="${escapeHtmlAttr(product.thumbnail_url)}" alt="${escapeHtmlAttr(
        product.title
      )}" class="${escapeHtmlAttr(imageClassName)}" loading="lazy" />`
    : `<div class="flex items-center justify-center bg-slate-100 text-4xl font-bold text-slate-400" style="min-height:${minHeight}px">${escapeHtml(
        product.title.charAt(0).toUpperCase()
      )}</div>`;
}

function resolveProductRecommendationLink(
  product: ProductRecommendationSource,
  linkTarget: ProductRecommendationLinkTarget
) {
  if (linkTarget === "order") {
    return {
      href: `/order/${encodeURIComponent(product.slug)}`,
      fallbackUsed: false,
    };
  }

  if (linkTarget === "landing") {
    if (product.click_target_page_slug) {
      return {
        href: `/${encodeURIComponent(product.click_target_page_slug)}`,
        fallbackUsed: false,
      };
    }

    return {
      href: `/produk/${encodeURIComponent(product.slug)}`,
      fallbackUsed: true,
    };
  }

  return {
    href: `/produk/${encodeURIComponent(product.slug)}`,
    fallbackUsed: false,
  };
}

function getRecommendationCtaLabel(
  linkTarget: ProductRecommendationLinkTarget,
  fallbackUsed: boolean
) {
  if (linkTarget === "order") {
    return "Pesan Sekarang";
  }

  if (linkTarget === "landing" && !fallbackUsed) {
    return "Buka Landing Page";
  }

  return "Lihat Produk";
}

function parseShortcodeAttributes(attributeText: string) {
  const attributes: Record<string, string> = {};

  for (const match of attributeText.matchAll(SHORTCODE_ATTRIBUTE_PATTERN)) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function sanitizeShortcodeAttribute(value: string) {
  return value.trim().replaceAll('"', "'").replace(/\s+/g, " ");
}

function normalizeRecommendationStyle(value: unknown): ProductRecommendationStyle {
  return value === "compact" || value === "banner" || value === "spotlight"
    ? value
    : DEFAULT_RECOMMENDATION_STYLE;
}

function normalizeRecommendationLinkTarget(
  value: unknown
): ProductRecommendationLinkTarget {
  return value === "order" || value === "landing" || value === "product"
    ? value
    : DEFAULT_RECOMMENDATION_LINK_TARGET;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtmlAttr(value: string) {
  return escapeHtml(value);
}
