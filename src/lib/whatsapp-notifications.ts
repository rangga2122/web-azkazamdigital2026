import type { Product } from "@/types";

export type WhatsappStatus = "pending" | "paid" | "failed" | "cancelled";

export type WhatsappBroadcastStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "failed";

export type WhatsappApiProvider = "gowa" | "instablast";

export type WhatsappDeviceInfo = {
  id: string;
  deviceId: string;
  displayName: string;
  phone: string;
  state: string;
  isConnected: boolean;
  isLoggedIn: boolean;
};

export type WhatsappNotificationConfig = {
  enabled: boolean;
  provider: WhatsappApiProvider;
  apiUrl: string;
  apiUsername: string;
  apiPassword: string;
  deviceId: string;
  adminNumber: string;
  notifyAdmin: boolean;
  notifyCustomer: boolean;
  notifyCustomerStatus: boolean;
  formatNumber: boolean;
  enableImage: boolean;
  defaultImageUrl: string;
  customerTemplate: string;
  adminTemplate: string;
  statusTemplate: string;
  notifyOnStatuses: WhatsappStatus[];
  broadcastTemplate: string;
  broadcastMinDelaySeconds: number;
  broadcastMaxDelaySeconds: number;
  broadcastStatuses: WhatsappStatus[];
  broadcastDateFrom: string;
  broadcastDateTo: string;
  broadcastEnableImage: boolean;
  broadcastImageUrl: string;
  broadcastEnableVideo: boolean;
  broadcastVideoUrl: string;
  followupEnabled: boolean;
  followupStatuses: WhatsappStatus[];
  followupDelayHours: number;
  followupTemplate: string;
  followup2Enabled: boolean;
  followupDelayHours2: number;
  followupTemplate2: string;
  followup3Enabled: boolean;
  followupDelayHours3: number;
  followupTemplate3: string;
};

export type WhatsappOrderContext = {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderTotal: number;
  orderDate: string;
  orderStatus: string;
  previousStatus?: string | null;
  orderItems: string;
  paymentMethod: string;
  siteTitle: string;
  productImageUrl?: string | null;
};

export type WhatsappBroadcastRecipientContext = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lastOrderCode: string;
  lastOrderDate: string;
  lastOrderTotal: string;
  siteTitle: string;
};

const DEFAULT_CUSTOMER_TEMPLATE =
  "Terima kasih *{customer_name}* atas pesanan Anda!\n\nPesanan *#{order_id}* telah kami terima.\n*Total:* {order_total}\n*Metode Pembayaran:* {payment_method}\n\nKami akan segera memproses pesanan Anda.";

const DEFAULT_ADMIN_TEMPLATE =
  "Pesanan baru masuk.\n\n*Kode:* #{order_id}\n*Pelanggan:* {customer_name}\n*Email:* {customer_email}\n*WhatsApp:* {customer_phone}\n*Total:* {order_total}\n*Item:* {order_items}\n*Status:* {order_status}";

const DEFAULT_STATUS_TEMPLATE =
  "Halo *{customer_name}*,\n\nStatus pesanan *#{order_id}* telah diperbarui menjadi: *{order_status}*.\n\nTerima kasih telah berbelanja di toko kami.";

const DEFAULT_BROADCAST_TEMPLATE =
  "Halo {customer_name},\n\nTerima kasih sudah menjadi pelanggan {site_title}.\nKami punya penawaran terbaru untuk Anda.\n\nBalas pesan ini jika ingin kami bantu lebih lanjut.";

const DEFAULT_FOLLOWUP_TEMPLATE =
  "Halo *{customer_name}*,\n\nKami melihat pesanan Anda *#{order_id}* dengan status *{order_status}* sejak *{order_date}*.\n\nApakah ada yang bisa kami bantu untuk menyelesaikan pesanan Anda?\n\nTerima kasih.";

const DEFAULT_FOLLOWUP_TEMPLATE_2 =
  "Halo *{customer_name}*,\n\nKami ingin mengingatkan kembali bahwa pesanan Anda *#{order_id}* masih berstatus *{order_status}* sejak *{order_date}*.\n\nJika ada kendala, silakan hubungi kami untuk bantuan lebih lanjut.\n\nTerima kasih.";

const DEFAULT_FOLLOWUP_TEMPLATE_3 =
  "Halo *{customer_name}*,\n\nIni adalah pengingat terakhir untuk pesanan Anda *#{order_id}* yang masih berstatus *{order_status}*.\n\nMohon segera selesaikan transaksi Anda atau hubungi kami jika membutuhkan bantuan.\n\nTerima kasih.";

const DEFAULT_CONFIG: WhatsappNotificationConfig = {
  enabled: false,
  provider: "gowa",
  apiUrl: "http://localhost:3000",
  apiUsername: "",
  apiPassword: "",
  deviceId: "",
  adminNumber: "",
  notifyAdmin: true,
  notifyCustomer: true,
  notifyCustomerStatus: true,
  formatNumber: true,
  enableImage: false,
  defaultImageUrl: "",
  customerTemplate: DEFAULT_CUSTOMER_TEMPLATE,
  adminTemplate: DEFAULT_ADMIN_TEMPLATE,
  statusTemplate: DEFAULT_STATUS_TEMPLATE,
  notifyOnStatuses: ["paid"],
  broadcastTemplate: DEFAULT_BROADCAST_TEMPLATE,
  broadcastMinDelaySeconds: 10,
  broadcastMaxDelaySeconds: 30,
  broadcastStatuses: ["paid"],
  broadcastDateFrom: "",
  broadcastDateTo: "",
  broadcastEnableImage: false,
  broadcastImageUrl: "",
  broadcastEnableVideo: false,
  broadcastVideoUrl: "",
  followupEnabled: false,
  followupStatuses: ["pending"],
  followupDelayHours: 24,
  followupTemplate: DEFAULT_FOLLOWUP_TEMPLATE,
  followup2Enabled: false,
  followupDelayHours2: 48,
  followupTemplate2: DEFAULT_FOLLOWUP_TEMPLATE_2,
  followup3Enabled: false,
  followupDelayHours3: 72,
  followupTemplate3: DEFAULT_FOLLOWUP_TEMPLATE_3,
};

export function getWhatsappNotificationConfig(
  socialLinks: Record<string, unknown> | null | undefined,
  fallbackAdminNumber?: string | null
) {
  const raw = isObject(socialLinks?.whatsapp_notifications)
    ? socialLinks?.whatsapp_notifications
    : {};

  const config: WhatsappNotificationConfig = {
    enabled: toBoolean(raw.enabled, DEFAULT_CONFIG.enabled),
    provider: toProvider(raw.provider, DEFAULT_CONFIG.provider),
    apiUrl: toString(raw.apiUrl, DEFAULT_CONFIG.apiUrl),
    apiUsername: toString(raw.apiUsername, DEFAULT_CONFIG.apiUsername),
    apiPassword: toString(raw.apiPassword, DEFAULT_CONFIG.apiPassword),
    deviceId: toString(raw.deviceId, DEFAULT_CONFIG.deviceId),
    adminNumber: toString(
      raw.adminNumber,
      fallbackAdminNumber || DEFAULT_CONFIG.adminNumber
    ),
    notifyAdmin: toBoolean(raw.notifyAdmin, DEFAULT_CONFIG.notifyAdmin),
    notifyCustomer: toBoolean(raw.notifyCustomer, DEFAULT_CONFIG.notifyCustomer),
    notifyCustomerStatus: toBoolean(
      raw.notifyCustomerStatus,
      DEFAULT_CONFIG.notifyCustomerStatus
    ),
    formatNumber: toBoolean(raw.formatNumber, DEFAULT_CONFIG.formatNumber),
    enableImage: toBoolean(raw.enableImage, DEFAULT_CONFIG.enableImage),
    defaultImageUrl: toString(raw.defaultImageUrl, DEFAULT_CONFIG.defaultImageUrl),
    customerTemplate: toString(raw.customerTemplate, DEFAULT_CONFIG.customerTemplate),
    adminTemplate: toString(raw.adminTemplate, DEFAULT_CONFIG.adminTemplate),
    statusTemplate: toString(raw.statusTemplate, DEFAULT_CONFIG.statusTemplate),
    notifyOnStatuses: normalizeStatuses(
      raw.notifyOnStatuses,
      DEFAULT_CONFIG.notifyOnStatuses
    ),
    broadcastTemplate: toString(
      raw.broadcastTemplate,
      DEFAULT_CONFIG.broadcastTemplate
    ),
    broadcastMinDelaySeconds: toPositiveInt(
      raw.broadcastMinDelaySeconds,
      DEFAULT_CONFIG.broadcastMinDelaySeconds
    ),
    broadcastMaxDelaySeconds: toPositiveInt(
      raw.broadcastMaxDelaySeconds,
      DEFAULT_CONFIG.broadcastMaxDelaySeconds
    ),
    broadcastStatuses: normalizeStatuses(
      raw.broadcastStatuses,
      DEFAULT_CONFIG.broadcastStatuses
    ),
    broadcastDateFrom: toString(
      raw.broadcastDateFrom,
      DEFAULT_CONFIG.broadcastDateFrom
    ),
    broadcastDateTo: toString(raw.broadcastDateTo, DEFAULT_CONFIG.broadcastDateTo),
    broadcastEnableImage: toBoolean(
      raw.broadcastEnableImage,
      DEFAULT_CONFIG.broadcastEnableImage
    ),
    broadcastImageUrl: toString(
      raw.broadcastImageUrl,
      DEFAULT_CONFIG.broadcastImageUrl
    ),
    broadcastEnableVideo: toBoolean(
      raw.broadcastEnableVideo,
      DEFAULT_CONFIG.broadcastEnableVideo
    ),
    broadcastVideoUrl: toString(
      raw.broadcastVideoUrl,
      DEFAULT_CONFIG.broadcastVideoUrl
    ),
    followupEnabled: toBoolean(raw.followupEnabled, DEFAULT_CONFIG.followupEnabled),
    followupStatuses: normalizeStatuses(
      raw.followupStatuses,
      DEFAULT_CONFIG.followupStatuses
    ),
    followupDelayHours: toPositiveInt(
      raw.followupDelayHours,
      DEFAULT_CONFIG.followupDelayHours
    ),
    followupTemplate: toString(raw.followupTemplate, DEFAULT_CONFIG.followupTemplate),
    followup2Enabled: toBoolean(
      raw.followup2Enabled,
      DEFAULT_CONFIG.followup2Enabled
    ),
    followupDelayHours2: toPositiveInt(
      raw.followupDelayHours2,
      DEFAULT_CONFIG.followupDelayHours2
    ),
    followupTemplate2: toString(
      raw.followupTemplate2,
      DEFAULT_CONFIG.followupTemplate2
    ),
    followup3Enabled: toBoolean(
      raw.followup3Enabled,
      DEFAULT_CONFIG.followup3Enabled
    ),
    followupDelayHours3: toPositiveInt(
      raw.followupDelayHours3,
      DEFAULT_CONFIG.followupDelayHours3
    ),
    followupTemplate3: toString(
      raw.followupTemplate3,
      DEFAULT_CONFIG.followupTemplate3
    ),
  };

  if (config.broadcastMinDelaySeconds > config.broadcastMaxDelaySeconds) {
    config.broadcastMinDelaySeconds = config.broadcastMaxDelaySeconds;
  }

  return config;
}

export function serializeWhatsappNotificationConfig(
  config: WhatsappNotificationConfig
) {
  const normalizedBroadcastMin = Math.max(1, Number(config.broadcastMinDelaySeconds || 1));
  const normalizedBroadcastMax = Math.max(
    normalizedBroadcastMin,
    Number(config.broadcastMaxDelaySeconds || normalizedBroadcastMin)
  );

  return {
    enabled: config.enabled,
    provider: config.provider,
    apiUrl: config.apiUrl.trim(),
    apiUsername: config.apiUsername.trim(),
    apiPassword: config.apiPassword,
    deviceId: config.deviceId.trim(),
    adminNumber: config.adminNumber.trim(),
    notifyAdmin: config.notifyAdmin,
    notifyCustomer: config.notifyCustomer,
    notifyCustomerStatus: config.notifyCustomerStatus,
    formatNumber: config.formatNumber,
    enableImage: config.enableImage,
    defaultImageUrl: config.defaultImageUrl.trim(),
    customerTemplate: config.customerTemplate,
    adminTemplate: config.adminTemplate,
    statusTemplate: config.statusTemplate,
    notifyOnStatuses: normalizeStatuses(
      config.notifyOnStatuses,
      DEFAULT_CONFIG.notifyOnStatuses
    ),
    broadcastTemplate: config.broadcastTemplate,
    broadcastMinDelaySeconds: normalizedBroadcastMin,
    broadcastMaxDelaySeconds: normalizedBroadcastMax,
    broadcastStatuses: normalizeStatuses(
      config.broadcastStatuses,
      DEFAULT_CONFIG.broadcastStatuses
    ),
    broadcastDateFrom: config.broadcastDateFrom.trim(),
    broadcastDateTo: config.broadcastDateTo.trim(),
    broadcastEnableImage: config.broadcastEnableImage,
    broadcastImageUrl: config.broadcastImageUrl.trim(),
    broadcastEnableVideo: config.broadcastEnableVideo,
    broadcastVideoUrl: config.broadcastVideoUrl.trim(),
    followupEnabled: config.followupEnabled,
    followupStatuses: normalizeStatuses(
      config.followupStatuses,
      DEFAULT_CONFIG.followupStatuses
    ),
    followupDelayHours: Math.max(1, Number(config.followupDelayHours || 1)),
    followupTemplate: config.followupTemplate,
    followup2Enabled: config.followup2Enabled,
    followupDelayHours2: Math.max(1, Number(config.followupDelayHours2 || 1)),
    followupTemplate2: config.followupTemplate2,
    followup3Enabled: config.followup3Enabled,
    followupDelayHours3: Math.max(1, Number(config.followupDelayHours3 || 1)),
    followupTemplate3: config.followupTemplate3,
  };
}

export function formatWhatsappPhone(value: string, autoFormat = true) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  return normalizeWhatsappPhone(digits, autoFormat);
}

export function formatWhatsappApiReceiver(
  value: string,
  autoFormat = true,
  provider: WhatsappApiProvider = "gowa"
) {
  const normalized = normalizeWhatsappPhone(value, autoFormat);
  if (!normalized) return "";

  if (provider === "instablast") {
    return normalized;
  }

  return normalized.endsWith("@s.whatsapp.net")
    ? normalized
    : `${normalized}@s.whatsapp.net`;
}

export function resolveWhatsappTemplate(
  template: string,
  context: WhatsappOrderContext
) {
  return resolveTemplateTokens(template, buildOrderTemplateTokens(context));
}

export function resolveBroadcastTemplate(
  template: string,
  context: WhatsappBroadcastRecipientContext
) {
  return resolveTemplateTokens(template, {
    "{customer_name}": context.customerName,
    "{customer_email}": context.customerEmail,
    "{customer_phone}": context.customerPhone,
    "{last_order_id}": context.lastOrderCode,
    "{last_order_date}": context.lastOrderDate,
    "{last_order_total}": context.lastOrderTotal,
    "{site_title}": context.siteTitle,
  });
}

export function processWhatsappSpintax(input: string) {
  let output = input;
  const pattern = /\{([^{}]+)\}/g;
  let previous = "";

  while (output !== previous) {
    previous = output;
    output = output.replace(pattern, (match, content) => {
      if (!content.includes("|")) return match;
      const options = content
        .split("|")
        .map((item: string) => item.trim())
        .filter(Boolean);
      if (options.length === 0) return "";
      return options[Math.floor(Math.random() * options.length)];
    });
  }

  return output;
}

export async function sendWhatsappMessage(
  config: WhatsappNotificationConfig,
  receiver: string,
  message: string
) {
  if (!config.apiUrl || !config.apiUsername || !config.apiPassword || !receiver) {
    throw new Error("Konfigurasi API WhatsApp belum lengkap.");
  }

  const deviceId = await resolveDeviceId(config);
  const response = await fetch(buildProviderUrl(config, "/send/message", deviceId), {
    method: "POST",
    headers: buildProviderHeaders(config, deviceId, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      phone: receiver,
      message,
      ...(config.provider === "gowa" ? { is_forwarded: false } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Gagal mengirim pesan WhatsApp.");
  }

  return parseProviderResponse(response);
}

export async function sendWhatsappImage(
  config: WhatsappNotificationConfig,
  receiver: string,
  imageUrl: string,
  caption = ""
) {
  if (!config.apiUrl || !config.apiUsername || !config.apiPassword || !receiver || !imageUrl) {
    throw new Error("Konfigurasi API WhatsApp atau gambar belum lengkap.");
  }

  if (config.provider === "instablast") {
    const inlineImage = await loadRemoteMediaAsDataUrl(imageUrl, "image/");
    const deviceId = await resolveDeviceId(config);
    const response = await fetch(buildProviderUrl(config, "/send/image", deviceId), {
      method: "POST",
      headers: buildProviderHeaders(config, deviceId, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        phone: receiver,
        caption,
        image: inlineImage,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Gagal mengirim gambar WhatsApp.");
    }

    return parseProviderResponse(response);
  }

  const form = new FormData();
  form.append("phone", receiver);
  form.append("caption", caption);
  form.append("image_url", imageUrl);
  form.append("view_once", "false");
  form.append("compress", "false");
  form.append("is_forwarded", "false");

  const deviceId = await resolveDeviceId(config);
  const response = await fetch(buildProviderUrl(config, "/send/image", deviceId), {
    method: "POST",
    headers: buildProviderHeaders(config, deviceId),
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Gagal mengirim gambar WhatsApp.");
  }

  return parseProviderResponse(response);
}

export async function sendWhatsappVideo(
  config: WhatsappNotificationConfig,
  receiver: string,
  videoUrl: string,
  caption = ""
) {
  if (!config.apiUrl || !config.apiUsername || !config.apiPassword || !receiver || !videoUrl) {
    throw new Error("Konfigurasi API WhatsApp atau video belum lengkap.");
  }

  if (config.provider === "instablast") {
    const fallbackMessage = [caption.trim(), videoUrl.trim()].filter(Boolean).join("\n");
    return sendWhatsappMessage(
      config,
      receiver,
      fallbackMessage || `Video broadcast: ${videoUrl.trim()}`
    );
  }

  const form = new FormData();
  form.append("phone", receiver);
  form.append("caption", caption);
  form.append("video_url", videoUrl);
  form.append("view_once", "false");
  form.append("compress", "false");
  form.append("is_forwarded", "false");

  const deviceId = await resolveDeviceId(config);
  const response = await fetch(buildProviderUrl(config, "/send/video", deviceId), {
    method: "POST",
    headers: buildProviderHeaders(config, deviceId),
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Gagal mengirim video WhatsApp.");
  }

  return parseProviderResponse(response);
}

export async function sendOrderCreatedWhatsappNotifications(args: {
  config: WhatsappNotificationConfig;
  order: WhatsappOrderContext;
  origin: string;
}) {
  const { config, order } = args;
  if (!config.enabled) return { adminSent: false, customerSent: false };

  let adminSent = false;
  let customerSent = false;
  const customerReceiver = formatWhatsappApiReceiver(
    order.customerPhone,
    config.formatNumber,
    config.provider
  );
  const adminReceiver = formatWhatsappApiReceiver(
    config.adminNumber,
    config.formatNumber,
    config.provider
  );
  const imageUrl = pickNotificationImage(
    order.productImageUrl || null,
    config.defaultImageUrl,
    args.origin
  );

  if (config.notifyCustomer && customerReceiver) {
    const message = resolveWhatsappTemplate(config.customerTemplate, order);
    await sendWhatsappMessage(config, customerReceiver, message);
    customerSent = true;

    if (config.enableImage && imageUrl) {
      await sendWhatsappImage(config, customerReceiver, imageUrl, "");
    }
  }

  if (config.notifyAdmin && adminReceiver) {
    const message = resolveWhatsappTemplate(config.adminTemplate, order);
    await sendWhatsappMessage(config, adminReceiver, message);
    adminSent = true;

    if (config.enableImage && imageUrl) {
      await sendWhatsappImage(config, adminReceiver, imageUrl, "");
    }
  }

  return { adminSent, customerSent };
}

export async function sendOrderStatusWhatsappNotification(args: {
  config: WhatsappNotificationConfig;
  order: WhatsappOrderContext;
  origin: string;
}) {
  const { config, order } = args;
  if (!config.enabled || !config.notifyCustomerStatus) {
    return { customerSent: false };
  }

  if (!config.notifyOnStatuses.includes(order.orderStatus as WhatsappStatus)) {
    return { customerSent: false };
  }

  const receiver = formatWhatsappApiReceiver(
    order.customerPhone,
    config.formatNumber,
    config.provider
  );
  if (!receiver) return { customerSent: false };

  const message = resolveWhatsappTemplate(config.statusTemplate, order);
  await sendWhatsappMessage(config, receiver, message);

  const imageUrl = pickNotificationImage(
    order.productImageUrl || null,
    config.defaultImageUrl,
    args.origin
  );
  if (config.enableImage && imageUrl) {
    await sendWhatsappImage(config, receiver, imageUrl, "");
  }

  return { customerSent: true };
}

export function buildWhatsappOrderContext(args: {
  id: string;
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  productName: string;
  totalAmount: number;
  status: string;
  createdAt?: string | null;
  previousStatus?: string | null;
  siteName: string;
  productImageUrl?: string | null;
}) {
  return {
    orderId: args.id,
    orderCode: args.orderCode,
    customerName: args.buyerName,
    customerEmail: args.buyerEmail,
    customerPhone: args.buyerWhatsapp,
    orderTotal: Number(args.totalAmount || 0),
    orderDate: formatOrderDate(args.createdAt),
    orderStatus: args.status,
    previousStatus: args.previousStatus || null,
    orderItems: `${args.productName} (1x)`,
    paymentMethod: "Bank Transfer/QRIS",
    siteTitle: args.siteName,
    productImageUrl: args.productImageUrl || null,
  } satisfies WhatsappOrderContext;
}

export function resolveBroadcastMediaUrl(value: string, origin: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  try {
    return new URL(value, origin).toString();
  } catch {
    return "";
  }
}

export function productImageFromProduct(
  product: Pick<Product, "thumbnail_url"> | null | undefined
) {
  return product?.thumbnail_url || null;
}

function buildOrderTemplateTokens(context: WhatsappOrderContext) {
  return {
    "{order_id}": context.orderCode,
    "{customer_name}": context.customerName,
    "{order_total}": formatCurrency(context.orderTotal),
    "{order_date}": context.orderDate,
    "{order_status}": context.orderStatus,
    "{previous_status}": context.previousStatus || "-",
    "{order_items}": context.orderItems,
    "{customer_email}": context.customerEmail,
    "{customer_phone}": context.customerPhone,
    "{payment_method}": context.paymentMethod,
    "{site_title}": context.siteTitle,
  };
}

function resolveTemplateTokens(
  template: string,
  replacements: Record<string, string | number>
) {
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(token, String(value ?? "")),
    template
  );
}

function pickNotificationImage(
  productImageUrl: string | null,
  defaultImageUrl: string,
  origin: string
) {
  const source = productImageUrl || defaultImageUrl;
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return source;

  try {
    return new URL(source, origin).toString();
  } catch {
    return null;
  }
}

function formatOrderDate(value?: string | null) {
  if (!value) return new Date().toLocaleString("id-ID");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildProviderHeaders(
  config: WhatsappNotificationConfig,
  deviceId: string,
  extraHeaders: Record<string, string> = {}
) {
  return {
    Authorization: `Basic ${Buffer.from(
      `${config.apiUsername}:${config.apiPassword}`
    ).toString("base64")}`,
    "X-Device-Id": deviceId,
    ...extraHeaders,
  };
}

function buildProviderUrl(
  config: WhatsappNotificationConfig,
  path: string,
  deviceId: string
) {
  const url = new URL(`${stripTrailingSlash(config.apiUrl)}${path}`);
  url.searchParams.set("device_id", deviceId);
  return url.toString();
}

async function resolveDeviceId(config: WhatsappNotificationConfig) {
  const configured = config.deviceId.trim();
  if (configured) {
    return configured;
  }

  const devices = await listWhatsappDevices(config);
  const activeDevice =
    devices.find((device) => device.isLoggedIn && device.id) ||
    devices.find((device) => device.isConnected && device.id) ||
    devices.find((device) => device.id);

  if (!activeDevice?.id) {
    throw new Error(
      "Device ID belum ditemukan. Pastikan perangkat WhatsApp sudah login."
    );
  }

  return activeDevice.id;
}

export async function listWhatsappDevices(config: WhatsappNotificationConfig) {
  const response = await fetch(`${stripTrailingSlash(config.apiUrl)}/devices`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.apiUsername}:${config.apiPassword}`
      ).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Gagal mengambil daftar device WhatsApp.");
  }

  const payload = (await response.json()) as {
    results?: Array<{
      id?: string;
      device_id?: string;
      display_name?: string;
      phone?: string;
      state?: string;
      is_connected?: boolean;
      is_logged_in?: boolean;
    }>;
  };

  if (!Array.isArray(payload.results)) {
    return [] as WhatsappDeviceInfo[];
  }

  return payload.results
    .map((device) => {
      const id = toString(device.id, toString(device.device_id, "")).trim();
      if (!id) return null;

      const state = toString(device.state, "").trim().toLowerCase();
      const isLoggedIn =
        typeof device.is_logged_in === "boolean"
          ? device.is_logged_in
          : state === "connected" || state === "logged_in";
      const isConnected =
        typeof device.is_connected === "boolean"
          ? device.is_connected
          : isLoggedIn || state === "connecting";

      return {
        id,
        deviceId: toString(device.device_id, id),
        displayName: toString(device.display_name, id),
        phone: toString(device.phone, ""),
        state: state || (isLoggedIn ? "connected" : isConnected ? "connecting" : "disconnected"),
        isConnected,
        isLoggedIn,
      } satisfies WhatsappDeviceInfo;
    })
    .filter((device): device is WhatsappDeviceInfo => Boolean(device));
}

function normalizeStatuses(
  value: unknown,
  fallback: WhatsappStatus[]
): WhatsappStatus[] {
  const allowed: WhatsappStatus[] = ["pending", "paid", "failed", "cancelled"];
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const result = value.filter(
    (item): item is WhatsappStatus =>
      typeof item === "string" && allowed.includes(item as WhatsappStatus)
  );

  return [...new Set(result)];
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function toProvider(
  value: unknown,
  fallback: WhatsappApiProvider
): WhatsappApiProvider {
  return value === "instablast" || value === "gowa" ? value : fallback;
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhatsappPhone(value: string, autoFormat: boolean) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (!autoFormat) {
    return digits;
  }

  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }

  if (digits.startsWith("8")) {
    return `62${digits}`;
  }

  return digits;
}

async function loadRemoteMediaAsDataUrl(url: string, expectedMimePrefix: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil media remote: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.startsWith(expectedMimePrefix)) {
    throw new Error(`Media remote tidak sesuai. Diharapkan ${expectedMimePrefix}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType =
    contentType || (expectedMimePrefix === "image/" ? "image/jpeg" : "application/octet-stream");

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function parseProviderResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}
