"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushPendingPixelEvents } from "@/components/tracking/PixelEvents";
import {
  getActivePixelsForEvent,
  normalizeTrackingConfig,
  routeTargetFromPathname,
  type TrackingConfig,
} from "@/lib/tracking-config";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __azTrackingConfig?: TrackingConfig;
    __azInitializedPixelIds?: string[];
  }
}

export function FacebookPixelRuntime({ config }: { config: TrackingConfig }) {
  const pathname = usePathname();

  useEffect(() => {
    const normalized = normalizeTrackingConfig(config);
    window.__azTrackingConfig = normalized;
    window.__azInitializedPixelIds = window.__azInitializedPixelIds || [];

    if (window.fbq) {
      normalized.pixels
        .filter((pixel) => pixel.active && pixel.pixelId.trim())
        .forEach((pixel) => {
          if (!window.__azInitializedPixelIds?.includes(pixel.pixelId)) {
            window.fbq?.("init", pixel.pixelId);
            window.__azInitializedPixelIds?.push(pixel.pixelId);
          }
        });

      flushPendingPixelEvents();
    }
  }, [config]);

  useEffect(() => {
    const normalized = window.__azTrackingConfig || normalizeTrackingConfig(config);
    const target = routeTargetFromPathname(pathname || "/", normalized);

    if (target.type === "checkout" || target.type === "thankyou") return;

    const pixels = getActivePixelsForEvent(normalized, "PageView", target);
    const activePixels = normalized.pixels.filter(
      (pixel) => pixel.active && pixel.pixelId.trim()
    );

    if (activePixels.length === 1 && pixels.length === 1) {
      window.fbq?.("track", "PageView");
      return;
    }

    pixels.forEach((pixel) => {
      window.fbq?.("trackSingle", pixel.pixelId, "PageView");
    });
  }, [config, pathname]);

  return null;
}
