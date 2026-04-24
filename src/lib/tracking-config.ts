export const TRACKING_EVENTS = [
  "PageView",
  "ViewContent",
  "InitiateCheckout",
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "AddToCart",
] as const;

export type TrackingEventName = (typeof TRACKING_EVENTS)[number];

export type TrackingPixel = {
  uid: string;
  name: string;
  pixelId: string;
  active: boolean;
};

export type TrackingRule = {
  pixelUids: string[];
  events: TrackingEventName[];
};

export type TrackingConfig = {
  pixels: TrackingPixel[];
  rules: {
    global: TrackingRule;
    home: TrackingRule;
    pages: Record<string, TrackingRule>;
    checkoutProducts: Record<string, TrackingRule>;
    thankYouProducts: Record<string, TrackingRule>;
  };
};

export type TrackingTarget =
  | { type: "home" }
  | { type: "page"; slug?: string }
  | { type: "checkout"; productId?: string | null }
  | { type: "thankyou"; productId?: string | null }
  | { type: "product"; productId?: string | null };

const EMPTY_RULE: TrackingRule = {
  pixelUids: [],
  events: [],
};

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  pixels: [],
  rules: {
    global: { ...EMPTY_RULE },
    home: { ...EMPTY_RULE },
    pages: {},
    checkoutProducts: {},
    thankYouProducts: {},
  },
};

export function makeTrackingUid() {
  return `px_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function normalizeTrackingConfig(
  value?: unknown,
  legacy?: { enabled?: boolean | null; pixelId?: string | null }
): TrackingConfig {
  const source = isObject(value) ? value : {};
  const rules = isObject(source.rules) ? source.rules : {};
  const pixels = Array.isArray(source.pixels)
    ? source.pixels
        .map((item) => normalizePixel(item))
        .filter((pixel): pixel is TrackingPixel => Boolean(pixel))
    : [];

  const config: TrackingConfig = {
    pixels,
    rules: {
      global: normalizeRule(rules.global),
      home: normalizeRule(rules.home),
      pages: normalizeRuleMap(rules.pages),
      checkoutProducts: normalizeRuleMap(rules.checkoutProducts),
      thankYouProducts: normalizeRuleMap(rules.thankYouProducts),
    },
  };

  const legacyPixelId = legacy?.pixelId?.trim();
  if (legacy?.enabled && legacyPixelId && config.pixels.length === 0) {
    const uid = "legacy_global";
    config.pixels.push({
      uid,
      name: "Pixel Utama",
      pixelId: legacyPixelId,
      active: true,
    });
    config.rules.global = {
      pixelUids: [uid],
      events: ["PageView", "ViewContent", "InitiateCheckout", "Purchase"],
    };
  }

  return config;
}

export function getActivePixelsForEvent(
  config: TrackingConfig,
  eventName: TrackingEventName | string,
  target?: TrackingTarget
) {
  const event = normalizeEventName(eventName);
  if (!event) return [];

  const activePixels = config.pixels.filter(
    (pixel) => pixel.active && pixel.pixelId.trim()
  );
  const fallbackUid = activePixels.length === 1 ? activePixels[0].uid : null;
  const pixelUids = new Set<string>();

  collectRulePixels(config.rules.global, event, pixelUids, fallbackUid);

  const specificRule = getTargetRule(config, target);
  collectRulePixels(specificRule, event, pixelUids, fallbackUid);

  return activePixels.filter((pixel) => pixelUids.has(pixel.uid));
}

export function routeTargetFromPathname(
  pathname: string,
  config: TrackingConfig
): TrackingTarget {
  if (pathname === "/") return { type: "home" };
  if (pathname.startsWith("/order/")) return { type: "checkout" };
  if (pathname.startsWith("/thank-you/")) return { type: "thankyou" };

  const slug = pathname.replace(/^\/+|\/+$/g, "");
  if (slug && config.rules.pages[slug]) {
    return { type: "page", slug };
  }

  return { type: "page", slug };
}

function getTargetRule(config: TrackingConfig, target?: TrackingTarget) {
  if (!target) return EMPTY_RULE;

  if (target.type === "home") return config.rules.home;
  if (target.type === "page" && target.slug) {
    return config.rules.pages[target.slug] || EMPTY_RULE;
  }
  if ((target.type === "checkout" || target.type === "product") && target.productId) {
    return config.rules.checkoutProducts[target.productId] || EMPTY_RULE;
  }
  if (target.type === "thankyou" && target.productId) {
    return config.rules.thankYouProducts[target.productId] || EMPTY_RULE;
  }

  return EMPTY_RULE;
}

function collectRulePixels(
  rule: TrackingRule | undefined,
  event: TrackingEventName,
  pixelUids: Set<string>,
  fallbackUid?: string | null
) {
  if (!rule?.events.includes(event)) return;

  if ((!rule.pixelUids || rule.pixelUids.length === 0) && fallbackUid) {
    pixelUids.add(fallbackUid);
    return;
  }

  rule.pixelUids.forEach((uid) => pixelUids.add(uid));
}

function normalizePixel(value: unknown): TrackingPixel | null {
  if (!isObject(value)) return null;
  const pixelId = typeof value.pixelId === "string" ? value.pixelId.trim() : "";
  if (!pixelId) return null;

  return {
    uid:
      typeof value.uid === "string" && value.uid.trim()
        ? value.uid
        : makeTrackingUid(),
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name
        : "Facebook Pixel",
    pixelId,
    active: value.active !== false,
  };
}

function normalizeRule(value: unknown): TrackingRule {
  if (!isObject(value)) return { ...EMPTY_RULE };
  return {
    pixelUids: Array.isArray(value.pixelUids)
      ? value.pixelUids.filter((uid): uid is string => typeof uid === "string")
      : [],
    events: Array.isArray(value.events)
      ? value.events
          .map((event) => normalizeEventName(event))
          .filter((event): event is TrackingEventName => Boolean(event))
      : [],
  };
}

function normalizeRuleMap(value: unknown): Record<string, TrackingRule> {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, rule]) => [key, normalizeRule(rule)] as const)
      .filter(([, rule]) => rule.pixelUids.length > 0 || rule.events.length > 0)
  );
}

function normalizeEventName(value: unknown): TrackingEventName | null {
  if (typeof value !== "string") return null;
  return TRACKING_EVENTS.includes(value as TrackingEventName)
    ? (value as TrackingEventName)
    : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
