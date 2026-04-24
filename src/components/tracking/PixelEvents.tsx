"use client";

import {
  getActivePixelsForEvent,
  normalizeTrackingConfig,
  TRACKING_EVENTS,
  type TrackingConfig,
  type TrackingEventName,
  type TrackingTarget,
} from "@/lib/tracking-config";

/**
 * Facebook Pixel event tracking helpers
 * Usage: import { trackEvent } from '@/components/tracking/PixelEvents';
 * trackEvent('ViewContent', { content_name: 'Product Name', value: 100 });
 */

declare global {
  interface Window {
    __azPendingPixelEvents?: PendingPixelEvent[];
    __azRecentPixelEvents?: Record<string, number>;
  }
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __azTrackingConfig?: TrackingConfig;
  }
}

type PendingPixelEvent = {
  eventName: string;
  params?: Record<string, unknown>;
  target?: TrackingTarget;
};

function dispatchEvent(
  eventName: string,
  params?: Record<string, unknown>,
  target?: TrackingTarget
) {
  if (typeof window === "undefined" || !window.fbq) return false;

  const config = normalizeTrackingConfig(window.__azTrackingConfig);
  if (config.pixels.length === 0) return false;

  const pixels = getActivePixelsForEvent(config, eventName, target);
  if (pixels.length === 0) return true;

  const eventSignature = JSON.stringify({ eventName, params, target });
  const now = Date.now();
  const recentEvents = window.__azRecentPixelEvents || {};
  const lastSentAt = recentEvents[eventSignature] || 0;

  if (now - lastSentAt < 1500) {
    return true;
  }

  window.__azRecentPixelEvents = {
    ...recentEvents,
    [eventSignature]: now,
  };

  pixels.forEach((pixel) => {
    window.fbq?.("trackSingle", pixel.pixelId, eventName, params);
  });

  return true;
}

function queueEvent(event: PendingPixelEvent) {
  if (typeof window === "undefined") return;
  window.__azPendingPixelEvents = window.__azPendingPixelEvents || [];
  window.__azPendingPixelEvents.push(event);
}

export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>,
  target?: TrackingTarget
) {
  if (!dispatchEvent(eventName, params, target)) {
    queueEvent({ eventName, params, target });
  }
}

export function trackPageView(target?: TrackingTarget) {
  trackEvent("PageView", undefined, target);
}

export function trackConfiguredEvents(
  target: TrackingTarget,
  paramsByEvent?: Partial<Record<TrackingEventName, Record<string, unknown>>>
) {
  TRACKING_EVENTS.forEach((eventName) => {
    trackEvent(eventName, paramsByEvent?.[eventName], target);
  });
}

export function flushPendingPixelEvents() {
  if (typeof window === "undefined") return;

  const pendingEvents = window.__azPendingPixelEvents || [];
  window.__azPendingPixelEvents = [];

  pendingEvents.forEach((event) => {
    void dispatchEvent(event.eventName, event.params, event.target);
  });
}

export function trackViewContent(
  productName: string,
  price: number,
  productId?: string | null
) {
  trackEvent("ViewContent", {
    content_name: productName,
    content_type: "product",
    value: price,
    currency: "IDR",
  }, { type: "product", productId });
}

export function trackLead() {
  trackEvent("Lead");
}

export function trackInitiateCheckout(
  productName: string,
  price: number,
  productId?: string | null
) {
  trackEvent("InitiateCheckout", {
    content_name: productName,
    value: price,
    currency: "IDR",
  }, { type: "checkout", productId });
}

export function trackPurchase(
  orderCode: string,
  price: number,
  productId?: string | null
) {
  trackEvent("Purchase", {
    content_name: orderCode,
    value: price,
    currency: "IDR",
  }, { type: "thankyou", productId });
}
