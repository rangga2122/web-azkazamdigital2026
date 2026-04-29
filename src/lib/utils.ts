import { stripLegacyUploadAssetUrlsFromHtml } from "@/lib/legacy-media";

const ALLOWED_HTML_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'a', 'strong', 'em', 'b', 'i', 'u', 's',
  'blockquote', 'pre', 'code',
  'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span', 'section', 'article', 'header', 'footer', 'nav', 'main',
  'button', 'form', 'label', 'input', 'textarea', 'select', 'option',
  'video', 'source', 'iframe',
  'svg', 'path', 'g', 'defs', 'clipPath', 'linearGradient', 'stop', 'circle', 'rect', 'polygon', 'polyline', 'line',
  'style', 'html', 'head', 'body', 'title', 'meta', 'link',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'target', 'rel', 'src', 'alt', 'title',
  'class', 'id', 'style',
  'width', 'height',
  'colspan', 'rowspan',
  'type', 'name', 'value', 'placeholder', 'checked', 'selected', 'disabled',
  'controls', 'autoplay', 'loop', 'muted',
  'frameborder', 'allowfullscreen', 'allow',
  'charset', 'content', 'media', 'crossorigin', 'as',
  'viewbox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'cx', 'cy', 'r', 'points', 'offset', 'stop-color', 'stop-opacity', 'preserveaspectratio',
]);

function removeUnsafeBlocks(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

type SanitizeOptions = {
  allowEventHandlers?: boolean;
};

function cleanTagAttributes(
  rawAttributes: string,
  options: SanitizeOptions = {}
) {
  const sanitizedParts: string[] = [];
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of rawAttributes.matchAll(attrRegex)) {
    const rawName = match[1];
    const name = rawName.toLowerCase();

    if (!name) continue;

    if (name.startsWith('on')) {
      if (!options.allowEventHandlers) continue;

      const rawEventValue = match[2] ?? match[3] ?? match[4] ?? '';
      const eventValue = rawEventValue.trim();
      if (!eventValue) continue;
      sanitizedParts.push(`${rawName}="${escapeHtmlAttr(eventValue)}"`);
      continue;
    }

    if (!ALLOWED_ATTRS.has(name) && !name.startsWith('data-')) continue;

    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    const normalizedValue = rawValue.trim();
    const lowerValue = normalizedValue.toLowerCase();

    if (
      (name === 'href' || name === 'src' || name === 'action') &&
      (lowerValue.startsWith('javascript:') ||
        lowerValue.startsWith('vbscript:') ||
        lowerValue.startsWith('data:text/html'))
    ) {
      continue;
    }

    if (name === 'style') {
      const safeStyle = normalizedValue
        .replace(/expression\s*\([^)]*\)/gi, '')
        .replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, '')
        .trim();

      if (!safeStyle) continue;
      sanitizedParts.push(`${rawName}="${escapeHtmlAttr(safeStyle)}"`);
      continue;
    }

    if (match[2] !== undefined || match[3] !== undefined || match[4] !== undefined) {
      sanitizedParts.push(`${rawName}="${escapeHtmlAttr(normalizedValue)}"`);
    } else {
      sanitizedParts.push(rawName);
    }
  }

  return sanitizedParts.length ? ` ${sanitizedParts.join(' ')}` : '';
}

function sanitizeAllowedMarkup(
  html: string,
  options: SanitizeOptions = {}
) {
  const withoutUnsafeBlocks = removeUnsafeBlocks(html);

  return withoutUnsafeBlocks.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*)>/g,
    (fullMatch, rawTagName: string, rawAttributes: string) => {
      const tagName = rawTagName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tagName)) return '';

      const isClosing = fullMatch.startsWith('</');
      if (isClosing) return `</${rawTagName}>`;

      const selfClosing = /\/\s*>$/.test(fullMatch);
      const safeAttributes = cleanTagAttributes(rawAttributes || '', options);
      return `<${rawTagName}${safeAttributes}${selfClosing ? ' /' : ''}>`;
    }
  );
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize HTML to prevent XSS while allowing safe HTML rendering
 */
export function sanitizeHtml(html: string): string {
  return sanitizeAllowedMarkup(stripLegacyUploadAssetUrlsFromHtml(html));
}

export function isStandaloneHtml(html: string): boolean {
  return /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]/i.test(html);
}

export function sanitizeHtmlDocument(html: string): string {
  const sanitized = sanitizeAllowedMarkup(
    stripLegacyUploadAssetUrlsFromHtml(html)
  );

  if (/<html[\s>]/i.test(sanitized)) return sanitized;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;min-height:100%;}img,video,iframe{max-width:100%;}</style></head><body>${sanitized}</body></html>`;
}

export type EmbeddedHtmlDocument = {
  bodyHtml: string;
  headHtml: string;
  styles: string;
  scripts: EmbeddedHtmlScript[];
  bodyAttributes: Record<string, string | true>;
  title: string | null;
};

export type EmbeddedHtmlScript = {
  content: string | null;
  src: string | null;
  attributes: Record<string, string | true>;
};

export type EmbeddedHeadLink = {
  rel: string;
  href: string;
  attributes: Record<string, string | true>;
};

export function prepareEmbeddedHtmlDocument(
  html: string
): EmbeddedHtmlDocument {
  const cleanedHtml = stripLegacyUploadAssetUrlsFromHtml(html);
  const styles = Array.from(
    cleanedHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)
  )
    .map((match) => match[1])
    .join("\n");
  const headHtml = sanitizeAllowedMarkup(
    Array.from(cleanedHtml.matchAll(/<link\b[^>]*>/gi))
      .map((match) => match[0])
      .filter((tag) => /rel=["']?(stylesheet|preconnect|preload)/i.test(tag))
      .map((tag) => tag.replace(/\smedia=["']print["']/i, ' media="all"'))
      .join("\n")
  );
  const bodyMatch = cleanedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyTagMatch = cleanedHtml.match(/<body\b([^>]*)>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : cleanedHtml;
  const bodyWithoutHeadAssets = rawBody
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
  const bodyHtml = optimizeEmbeddedMediaMarkup(
    sanitizeAllowedMarkup(bodyWithoutHeadAssets, {
      allowEventHandlers: true,
    })
  );
  const scripts = extractEmbeddedScripts(cleanedHtml);
  const bodyAttributes = bodyTagMatch
    ? parseHtmlAttributes(bodyTagMatch[1] || "")
    : {};
  const title = extractDocumentTitle(cleanedHtml);

  return {
    bodyHtml,
    headHtml,
    styles,
    scripts,
    bodyAttributes,
    title,
  };
}

export function extractEmbeddedHeadLinks(headHtml: string): EmbeddedHeadLink[] {
  const links: EmbeddedHeadLink[] = [];
  const seen = new Set<string>();

  for (const match of headHtml.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(match[1] || "");
    const rel = typeof attributes.rel === "string" ? attributes.rel : "";
    const href = typeof attributes.href === "string" ? attributes.href : "";

    if (!rel || !href) continue;

    const key = `${rel}::${href}`;
    if (seen.has(key)) continue;

    seen.add(key);
    links.push({
      rel,
      href,
      attributes:
        typeof attributes.media === "string" &&
        attributes.media.toLowerCase() === "print"
          ? { ...attributes, media: "all" }
          : attributes,
    });
  }

  return links;
}

export function buildScopedEmbeddedStyles(
  styles: string,
  scopeSelector: string
) {
  if (!styles.trim()) {
    return "";
  }

  return `
${scopeSelector} img {
  display: inline-block;
}

${transformCssBlocks(styles, scopeSelector)}
`.trim();
}

function optimizeEmbeddedMediaMarkup(html: string) {
  let imageIndex = 0;

  const optimizedImages = html.replace(/<img\b([^>]*)>/gi, (match, rawAttributes: string) => {
    imageIndex += 1;
    let nextTag = match;

    if (!/\bdecoding\s*=/i.test(rawAttributes)) {
      nextTag = nextTag.replace(/>$/, ' decoding="async">');
    }

    if (!/\bloading\s*=/i.test(rawAttributes)) {
      nextTag = nextTag.replace(
        />$/,
        imageIndex === 1 ? ' loading="eager">' : ' loading="lazy">'
      );
    }

    if (imageIndex === 1 && !/\bfetchpriority\s*=/i.test(rawAttributes)) {
      nextTag = nextTag.replace(/>$/, ' fetchpriority="high">');
    }

    return nextTag;
  });

  return optimizedImages.replace(/<iframe\b([^>]*)>/gi, (match, rawAttributes: string) => {
    if (/\bloading\s*=/i.test(rawAttributes)) {
      return match;
    }

    return match.replace(/>$/, ' loading="lazy">');
  });
}

function extractDocumentTitle(html: string) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return null;

  const title = titleMatch[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return title || null;
}

function parseHtmlAttributes(rawAttributes: string) {
  const attributes: Record<string, string | true> = {};
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of rawAttributes.matchAll(attrRegex)) {
    const rawName = match[1];
    const name = rawName.toLowerCase();

    if (!name || name.startsWith("on")) continue;
    if (
      !ALLOWED_ATTRS.has(name) &&
      !name.startsWith("data-") &&
      name !== "role" &&
      name !== "aria-hidden" &&
      name !== "tabindex"
    ) {
      continue;
    }

    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    const normalizedValue = rawValue.trim();

    if (
      match[2] !== undefined ||
      match[3] !== undefined ||
      match[4] !== undefined
    ) {
      attributes[name] = normalizedValue;
      continue;
    }

    attributes[name] = true;
  }

  return attributes;
}

function extractEmbeddedScripts(html: string): EmbeddedHtmlScript[] {
  const scripts: EmbeddedHtmlScript[] = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRegex)) {
    const rawAttributes = match[1] || "";
    const content = (match[2] || "").trim();
    const attributes = parseScriptAttributes(rawAttributes);
    const src = typeof attributes.src === "string" ? attributes.src : null;

    if (src && !isSafeScriptSource(src)) {
      continue;
    }

    if (!src && !content) {
      continue;
    }

    scripts.push({
      content: content || null,
      src,
      attributes,
    });
  }

  return scripts;
}

function parseScriptAttributes(rawAttributes: string) {
  const attributes: Record<string, string | true> = {};
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const allowedAttrs = new Set([
    "src",
    "type",
    "async",
    "defer",
    "crossorigin",
    "referrerpolicy",
    "integrity",
    "nomodule",
    "fetchpriority",
  ]);

  for (const match of rawAttributes.matchAll(attrRegex)) {
    const rawName = match[1];
    const name = rawName.toLowerCase();

    if (!name || name.startsWith("on") || !allowedAttrs.has(name)) continue;

    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    const normalizedValue = rawValue.trim();

    if (
      name === "src" &&
      normalizedValue &&
      !isSafeScriptSource(normalizedValue)
    ) {
      continue;
    }

    if (
      match[2] !== undefined ||
      match[3] !== undefined ||
      match[4] !== undefined
    ) {
      if (!normalizedValue) continue;
      attributes[name] = normalizedValue;
      continue;
    }

    attributes[name] = true;
  }

  return attributes;
}

function isSafeScriptSource(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) return false;
  if (normalizedValue.startsWith("javascript:")) return false;
  if (normalizedValue.startsWith("vbscript:")) return false;
  if (normalizedValue.startsWith("data:text/html")) return false;

  return true;
}

function transformCssBlocks(css: string, scopeSelector: string) {
  let output = "";
  let cursor = 0;

  while (cursor < css.length) {
    const openBrace = css.indexOf("{", cursor);
    if (openBrace === -1) {
      output += css.slice(cursor);
      break;
    }

    const selectorChunk = css.slice(cursor, openBrace);
    const closeBrace = findMatchingBrace(css, openBrace);

    if (closeBrace === -1) {
      output += css.slice(cursor);
      break;
    }

    const blockContent = css.slice(openBrace + 1, closeBrace);
    const trimmedSelector = selectorChunk.trim();

    if (!trimmedSelector) {
      output += `${selectorChunk}{${blockContent}}`;
      cursor = closeBrace + 1;
      continue;
    }

    if (
      trimmedSelector.startsWith("@media") ||
      trimmedSelector.startsWith("@supports") ||
      trimmedSelector.startsWith("@container") ||
      trimmedSelector.startsWith("@layer")
    ) {
      output += `${selectorChunk}{${transformCssBlocks(
        blockContent,
        scopeSelector
      )}}`;
      cursor = closeBrace + 1;
      continue;
    }

    if (trimmedSelector.startsWith("@")) {
      output += `${selectorChunk}{${blockContent}}`;
      cursor = closeBrace + 1;
      continue;
    }

    output += `${scopeSelectorList(
      selectorChunk,
      scopeSelector
    )}{${blockContent}}`;
    cursor = closeBrace + 1;
  }

  return output;
}

function findMatchingBrace(css: string, openBraceIndex: number) {
  let depth = 0;

  for (let index = openBraceIndex; index < css.length; index += 1) {
    const char = css[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function scopeSelectorList(selectorText: string, scopeSelector: string) {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of selectorText) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) {
    selectors.push(current);
  }

  return selectors
    .map((selector) => scopeSingleSelector(selector, scopeSelector))
    .join(", ");
}

function scopeSingleSelector(selector: string, scopeSelector: string) {
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) return trimmedSelector;

  if (
    trimmedSelector === "html" ||
    trimmedSelector === "body" ||
    trimmedSelector === ":root"
  ) {
    return scopeSelector;
  }

  if (trimmedSelector.includes(":root")) {
    return trimmedSelector.replaceAll(":root", scopeSelector);
  }

  if (/^html(?=[\s.#:[>~+]|$)/.test(trimmedSelector)) {
    return trimmedSelector.replace(/^html\b/, scopeSelector);
  }

  if (/^body(?=[\s.#:[>~+]|$)/.test(trimmedSelector)) {
    return trimmedSelector.replace(/^body\b/, scopeSelector);
  }

  if (trimmedSelector.startsWith(scopeSelector)) {
    return trimmedSelector;
  }

  return `${scopeSelector} ${trimmedSelector}`;
}

/**
 * Format price to Indonesian Rupiah
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Generate a unique order code
 */
export function generateOrderCode(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${rand}`;
}

export function generateUniquePaymentCode(): number {
  return Math.floor(Math.random() * 51) + 50;
}

export function normalizeUniquePaymentCode(value?: number | null): number {
  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 50 && numericValue <= 100) {
    return numericValue;
  }

  return generateUniquePaymentCode();
}

/**
 * Generate a unique referral code from name
 */
export function generateReferralCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${clean}${rand}`;
}

/**
 * Create a slug from text
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Format date to Indonesian locale
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Truncate text
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    published: 'bg-emerald-500/20 text-emerald-400',
    draft: 'bg-amber-500/20 text-amber-400',
    active: 'bg-emerald-500/20 text-emerald-400',
    inactive: 'bg-gray-500/20 text-gray-400',
    pending: 'bg-amber-500/20 text-amber-400',
    approved: 'bg-emerald-500/20 text-emerald-400',
    paid: 'bg-blue-500/20 text-blue-400',
    rejected: 'bg-red-500/20 text-red-400',
    failed: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-gray-500/20 text-gray-400',
    suspended: 'bg-red-500/20 text-red-400',
  };
  return colors[status] || 'bg-gray-500/20 text-gray-400';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    published: 'Diterbitkan',
    draft: 'Draf',
    active: 'Aktif',
    inactive: 'Nonaktif',
    pending: 'Menunggu',
    approved: 'Disetujui',
    paid: 'Dibayar',
    rejected: 'Ditolak',
    failed: 'Gagal',
    cancelled: 'Dibatalkan',
    suspended: 'Ditangguhkan',
  };
  return labels[status] || status;
}

export function getProductCommissionLabel(product: {
  affiliate_commission_type?: 'percent' | 'fixed' | null;
  affiliate_commission_rate?: number | null;
  affiliate_commission_amount?: number | null;
}) {
  if (product.affiliate_commission_type === 'fixed') {
    return `${formatPrice(Number(product.affiliate_commission_amount || 0))} / order`;
  }

  return `${Number(product.affiliate_commission_rate || 0)}%`;
}
