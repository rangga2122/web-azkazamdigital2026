import type { Product } from "@/types";

type ProductTargetInput = Pick<
  Product,
  "slug" | "click_target_type" | "checkout_url"
> & {
  click_target_page?: { slug?: string | null } | null;
};

export function normalizeCustomTargetUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return `https://${trimmed}`;
}

export function isValidCustomTargetUrl(value: string | null | undefined) {
  const normalized = normalizeCustomTargetUrl(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

export function isAbsoluteUrl(value: string | null | undefined) {
  return /^(https?:)?\/\//i.test(String(value || "").trim());
}

export function resolveProductTargetHref(product: ProductTargetInput) {
  if (product.click_target_type === "custom_url") {
    const customUrl = normalizeCustomTargetUrl(product.checkout_url);
    if (isValidCustomTargetUrl(customUrl)) {
      return customUrl;
    }
  }

  if (
    product.click_target_type === "cms_page" &&
    product.click_target_page?.slug
  ) {
    return `/${product.click_target_page.slug}`;
  }

  if (
    product.click_target_type === "checkout" ||
    product.click_target_type === "custom_url"
  ) {
    return `/order/${product.slug}`;
  }

  return `/produk/${product.slug}`;
}
