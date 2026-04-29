const LEGACY_WORDPRESS_PATH = "/wp-content/uploads/";

export function isLegacyUploadAssetUrl(value: string | null | undefined) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return false;

  if (normalizedValue.includes(LEGACY_WORDPRESS_PATH)) {
    return true;
  }

  try {
    const url = new URL(normalizedValue);
    return url.pathname.includes(LEGACY_WORDPRESS_PATH);
  } catch {
    return false;
  }
}

export function sanitizePublicMediaUrl(value: string | null | undefined) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return null;
  if (isLegacyUploadAssetUrl(normalizedValue)) return null;
  return normalizedValue;
}

export function stripLegacyUploadAssetUrlsFromHtml(html: string) {
  if (!html || !html.includes("wp-content")) {
    return html;
  }

  return html
    .replace(
      /<img\b[^>]*\bsrc=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1[^>]*>/gi,
      ""
    )
    .replace(
      /<source\b[^>]*\bsrc=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1[^>]*>/gi,
      ""
    )
    .replace(
      /\s(?:src|href|poster)=(["'])(?:https?:\/\/[^"'<>]+)?\/wp-content\/uploads\/[^"']+\1/gi,
      ""
    )
    .replace(
      /url\((['"]?)(?:https?:\/\/[^)'"]+)?\/wp-content\/uploads\/[^)'"]+\1\)/gi,
      "none"
    )
    .replace(
      /(?:https?:\/\/[^"'\s<>()]+)?\/wp-content\/uploads\/[^"'\s<>()]+/gi,
      ""
    );
}
