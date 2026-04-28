import http from "node:http";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const LEGACY_MEDIA_IP =
  process.env.LEGACY_MEDIA_IP?.trim() || "202.10.43.145";
const LEGACY_MEDIA_HOST =
  process.env.LEGACY_MEDIA_HOST?.trim() || "www.azkazamdigital.com";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyLegacyUpload(context, "GET");
}

export async function HEAD(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyLegacyUpload(context, "HEAD");
}

async function proxyLegacyUpload(
  context: { params: Promise<{ path: string[] }> },
  method: "GET" | "HEAD"
) {
  const { path } = await context.params;
  const normalizedPath = (path || [])
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  if (!normalizedPath) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const upstream = await requestLegacyAsset(normalizedPath, method);

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return new Response("Not Found", { status: upstream.statusCode || 404 });
    }

    const responseHeaders = new Headers();
    for (const headerName of [
      "content-type",
      "content-length",
      "cache-control",
      "etag",
      "last-modified",
      "expires",
      "accept-ranges",
    ]) {
      const value = upstream.headers[headerName];
      if (typeof value === "string" && value) {
        responseHeaders.set(headerName, value);
      }
    }

    if (!responseHeaders.has("cache-control")) {
      responseHeaders.set(
        "cache-control",
        "public, max-age=604800, stale-while-revalidate=2592000"
      );
    }

    return new Response(method === "HEAD" ? null : toBuffer(upstream.body), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Legacy media proxy failed:", error);
    return new Response("Not Found", { status: 404 });
  }
}

function toBuffer(value: Uint8Array | null) {
  if (!value) return null;
  return Buffer.from(value);
}

function requestLegacyAsset(pathname: string, method: "GET" | "HEAD") {
  return new Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Uint8Array | null;
  }>((resolve, reject) => {
    const request = http.request(
      {
        host: LEGACY_MEDIA_IP,
        port: 80,
        method,
        path: `/wp-content/uploads/${pathname}`,
        headers: {
          Host: LEGACY_MEDIA_HOST,
          Connection: "close",
        },
      },
      (response) => {
        if (method === "HEAD") {
          response.resume();
          resolve({
            statusCode: response.statusCode || 500,
            headers: response.headers,
            body: null,
          });
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 500,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error("Legacy media request timeout"));
    });
    request.end();
  });
}
