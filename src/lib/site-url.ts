const LOCALHOST_URL = "http://localhost:3000";

export function getSiteUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    LOCALHOST_URL;

  try {
    return new URL(rawUrl).origin;
  } catch {
    return LOCALHOST_URL;
  }
}

export function absoluteUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, getSiteUrl()).toString();
}

export function resolveRequestOrigin(input: {
  headers?: Headers;
  nextUrlOrigin?: string | null;
}) {
  const forwardedHost = input.headers?.get("x-forwarded-host")?.trim() || "";
  const forwardedProto =
    input.headers?.get("x-forwarded-proto")?.trim() ||
    input.headers?.get("x-forwarded-protocol")?.trim() ||
    "";
  const host = input.headers?.get("host")?.trim() || "";
  const originHeader = input.headers?.get("origin")?.trim() || "";
  const nextOrigin = String(input.nextUrlOrigin || "").trim();

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // continue
    }
  }

  if (host && !isLocalHost(host)) {
    return `${forwardedProto || "https"}://${host}`;
  }

  if (nextOrigin && !isLocalOrigin(nextOrigin)) {
    return nextOrigin;
  }

  return getSiteUrl();
}

function isLocalOrigin(value: string) {
  try {
    return isLocalHost(new URL(value).host);
  } catch {
    return false;
  }
}

function isLocalHost(value: string) {
  const host = value.split(":")[0].trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}
