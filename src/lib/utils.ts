import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS while allowing safe HTML rendering
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'a', 'strong', 'em', 'b', 'i', 'u', 's',
      'blockquote', 'pre', 'code',
      'img', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'section', 'article', 'header', 'footer', 'nav',
      'video', 'source', 'iframe',
      'svg', 'path', 'g', 'defs', 'clipPath', 'linearGradient', 'stop', 'circle', 'rect', 'polygon', 'polyline', 'line',
      'style',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title',
      'class', 'id', 'style',
      'width', 'height',
      'colspan', 'rowspan',
      'type', 'controls', 'autoplay', 'loop', 'muted',
      'frameborder', 'allowfullscreen', 'allow',
      'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
      'cx', 'cy', 'r', 'points', 'offset', 'stop-color', 'stop-opacity', 'preserveAspectRatio',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

export function isStandaloneHtml(html: string): boolean {
  return /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]/i.test(html);
}

export function sanitizeHtmlDocument(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'title', 'meta', 'link',
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
      'style',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title',
      'class', 'id', 'style',
      'width', 'height',
      'colspan', 'rowspan',
      'type', 'name', 'value', 'placeholder', 'checked', 'selected', 'disabled',
      'controls', 'autoplay', 'loop', 'muted',
      'frameborder', 'allowfullscreen', 'allow',
      'charset', 'content', 'media',
      'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
      'cx', 'cy', 'r', 'points', 'offset', 'stop-color', 'stop-opacity', 'preserveAspectRatio',
    ],
    ALLOW_DATA_ATTR: true,
  });

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
  const headHtml = DOMPurify.sanitize(
    Array.from(html.matchAll(/<link\b[^>]*>/gi))
      .map((match) => match[0])
      .filter((tag) => /rel=["']?(stylesheet|preconnect|preload)/i.test(tag))
      .map((tag) => tag.replace(/\smedia=["']print["']/i, ' media="all"'))
      .join("\n"),
    {
      ALLOWED_TAGS: ['link'],
      ALLOWED_ATTR: ['href', 'rel', 'media', 'crossorigin', 'as', 'type'],
    }
  );
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : html;
  const bodyWithoutHeadAssets = rawBody
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
  const bodyHtml = DOMPurify.sanitize(bodyWithoutHeadAssets, {
    ALLOWED_TAGS: [
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
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title',
      'class', 'id', 'style',
      'width', 'height',
      'colspan', 'rowspan',
      'type', 'name', 'value', 'placeholder', 'checked', 'selected', 'disabled',
      'controls', 'autoplay', 'loop', 'muted',
      'frameborder', 'allowfullscreen', 'allow',
      'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
      'cx', 'cy', 'r', 'points', 'offset', 'stop-color', 'stop-opacity', 'preserveAspectRatio',
    ],
    ALLOW_DATA_ATTR: true,
  });

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
