import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

function isPrivateOrLocalIp(ip: string): boolean {
  return (
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("::ffff:192.168.") ||
    ip.startsWith("::ffff:10.")
  );
}

function getClientIp(request: NextRequest): string {
  // Cloudflare passes the real visitor IP in CF-Connecting-IP
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }
  // Fallback: X-Forwarded-For may contain Cloudflare edge IP + real IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For can be a chain: client, proxy1, proxy2
    // The leftmost *public* IP is usually the real client behind Cloudflare
    const ips = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
    for (const ip of ips) {
      if (!isPrivateOrLocalIp(ip)) {
        return ip;
      }
    }
    return ips[0] || "unknown";
  }
  return request.headers.get("x-real-ip") || request.headers.get("x-vercel-forwarded-for") || "unknown";
}

async function getGeoFromIp(ip: string): Promise<{
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
}> {
  if (isPrivateOrLocalIp(ip)) {
    return { country: null, countryCode: null, city: null, region: null };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,regionName`,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return { country: null, countryCode: null, city: null, region: null };

    const data = await res.json();
    if (data?.status === "success") {
      return {
        country: data.country || null,
        countryCode: data.countryCode || null,
        city: data.city || null,
        region: data.regionName || null,
      };
    }
  } catch {
    // silent fail: do not block tracking
  }

  return { country: null, countryCode: null, city: null, region: null };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId: string;
      path: string;
      query?: string;
      title?: string;
      referrer?: string | null;
      userAgent?: string;
      deviceType?: string;
      os?: string;
      browser?: string;
      screenWidth?: number;
      screenHeight?: number;
      language?: string;
      durationSeconds?: number | null;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
    };

    const sessionId = String(body.sessionId || "").trim();
    const path = String(body.path || "").trim();

    if (!sessionId || !path) {
      return NextResponse.json({ error: "Missing sessionId or path" }, { status: 400 });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || body.userAgent || "";

    const [geo] = await Promise.all([getGeoFromIp(ip)]);

    const supabase = await createServiceRoleClient();

    await supabase.rpc("upsert_visitor_session", {
      p_session_id: sessionId,
      p_ip_address: ip,
      p_country_code: geo.countryCode,
      p_country_name: geo.country,
      p_city: geo.city,
      p_region: geo.region,
      p_user_agent: userAgent,
      p_device_type: body.deviceType || null,
      p_os: body.os || null,
      p_browser: body.browser || null,
      p_referrer: body.referrer || null,
      p_landing_page: path,
      p_utm_source: body.utm_source || null,
      p_utm_medium: body.utm_medium || null,
      p_utm_campaign: body.utm_campaign || null,
      p_screen_width: body.screenWidth || null,
      p_screen_height: body.screenHeight || null,
      p_language: body.language || null,
    });

    await supabase.from("page_views").insert({
      session_id: sessionId,
      path,
      title: body.title || null,
      query_params: body.query || null,
      referrer: body.referrer || null,
      duration_seconds: body.durationSeconds || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Track visitor error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
