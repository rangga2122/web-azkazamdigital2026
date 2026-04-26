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

function cleanTagAttributes(rawAttributes: string) {
  const sanitizedParts: string[] = [];
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of rawAttributes.matchAll(attrRegex)) {
    const rawName = match[1];
    const name = rawName.toLowerCase();

    if (!name || name.startsWith('on')) continue;
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

function sanitizeAllowedMarkup(html: string) {
  const withoutUnsafeBlocks = removeUnsafeBlocks(html);

  return withoutUnsafeBlocks.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)([^>]*)>/g,
    (fullMatch, rawTagName: string, rawAttributes: string) => {
      const tagName = rawTagName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tagName)) return '';

      const isClosing = fullMatch.startsWith('</');
      if (isClosing) return `</${rawTagName}>`;

      const selfClosing = /\/\s*>$/.test(fullMatch);
      const safeAttributes = cleanTagAttributes(rawAttributes || '');
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
  return sanitizeAllowedMarkup(html);
}

export function isStandaloneHtml(html: string): boolean {
  return /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]/i.test(html);
}

export function sanitizeHtmlDocument(html: string): string {
  const sanitized = sanitizeAllowedMarkup(html);

  if (/<html[\s>]/i.test(sanitized)) return sanitized;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;min-height:100%;}img,video,iframe{max-width:100%;}</style></head><body>${sanitized}</body></html>`;
}

export type EmbeddedHtmlDocument = {
  bodyHtml: string;
  headHtml: string;
  styles: string;
};

export function prepareEmbeddedHtmlDocument(
  html: string
): EmbeddedHtmlDocument {
  const styles = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join("\n");
  const headHtml = sanitizeAllowedMarkup(
    Array.from(html.matchAll(/<link\b[^>]*>/gi))
      .map((match) => match[0])
      .filter((tag) => /rel=["']?(stylesheet|preconnect|preload)/i.test(tag))
      .map((tag) => tag.replace(/\smedia=["']print["']/i, ' media="all"'))
      .join("\n")
  );
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : html;
  const bodyWithoutHeadAssets = rawBody
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
  const bodyHtml = sanitizeAllowedMarkup(bodyWithoutHeadAssets);

  return {
    bodyHtml,
    headHtml,
    styles,
  };
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
