"use client";

import { useEffect, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SESSION_KEY = "az_visitor_sid";
const LAST_VIEW_KEY = "az_visitor_last_view";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getUTMParams(searchParams: URLSearchParams) {
  return {
    utm_source: searchParams.get("utm_source") || undefined,
    utm_medium: searchParams.get("utm_medium") || undefined,
    utm_campaign: searchParams.get("utm_campaign") || undefined,
  };
}

function parseUserAgent(ua: string) {
  const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
      ? "tablet"
      : "desktop";

  const osMatch =
    ua.match(/Windows NT ([\d.]+)/) ||
    ua.match(/Mac OS X ([\d_]+)/) ||
    ua.match(/Android ([\d.]+)/) ||
    ua.match(/iOS ([\d_]+)/) ||
    ua.match(/Linux/);
  const os = osMatch ? osMatch[0].replace(/_/g, ".") : "unknown";

  const browserMatch =
    ua.match(/Chrome\/[\d.]+/) ||
    ua.match(/Safari\/[\d.]+/) ||
    ua.match(/Firefox\/[\d.]+/) ||
    ua.match(/Edge\/[\d.]+/);
  const browser = browserMatch ? browserMatch[0] : "unknown";

  return { deviceType, os, browser };
}

function VisitorTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSentPathRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    if (lastSentPathRef.current === fullPath) return;
    lastSentPathRef.current = fullPath;

    const sessionId = getSessionId();
    const startTime = Date.now();
    const previousViewRaw = sessionStorage.getItem(LAST_VIEW_KEY);
    const previousViewStart = previousViewRaw ? Number(previousViewRaw) : null;
    const durationSeconds = previousViewStart ? Math.round((startTime - previousViewStart) / 1000) : null;
    sessionStorage.setItem(LAST_VIEW_KEY, String(startTime));

    const ua = navigator.userAgent;
    const { deviceType, os, browser } = parseUserAgent(ua);
    const utm = getUTMParams(searchParams);

    const payload = {
      sessionId,
      path: pathname,
      query: searchParams.toString(),
      title: document.title,
      referrer: document.referrer || null,
      userAgent: ua,
      deviceType,
      os,
      browser,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      durationSeconds,
      utm_source: utm.utm_source || undefined,
      utm_medium: utm.utm_medium || undefined,
      utm_campaign: utm.utm_campaign || undefined,
    };

    const sendBeacon = () => {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon?.("/api/track-visitor", blob);
    };

    void fetch("/api/track-visitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // silent fail
    });

    const handleBeforeUnload = () => {
      if (previousViewStart) {
        sendBeacon();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pathname, searchParams]);

  return null;
}

export function VisitorTracker() {
  return (
    <Suspense fallback={null}>
      <VisitorTrackerInner />
    </Suspense>
  );
}

