/**
 * Kirim ulang notifikasi WhatsApp untuk satu order (tombol WA di menu Pesanan).
 *
 * Isi pesan diambil dari sumber yang SAMA dengan menu Notifikasi WA:
 *   mode "original" -> isi pesan persis seperti percobaan terakhir yang tercatat
 *                      di whatsapp_notification_logs (paling akurat, termasuk
 *                      password FBMP yang hanya diberikan sekali saat aktivasi)
 *   mode "template" -> dirender ulang dari template aktif (customerTemplate /
 *                      statusTemplate + paidAccessEntries)
 *
 * Route pemanggil: POST /api/admin/whatsapp/order-notifications (verifyLmAdmin).
 */

import {
  buildWhatsappOrderContext,
  formatWhatsappApiReceiver,
  getWhatsappNotificationConfig,
  renderOrderCreatedMessage,
  renderOrderStatusMessage,
  resolvePaidAccessEntry,
  resolvePaidAccessTemplate,
  sendWhatsappImage,
  sendWhatsappMessage,
  type PaidAccessTemplateContext,
  type WhatsappNotificationConfig,
  type WhatsappOrderContext,
} from "@/lib/whatsapp-notifications";
import { recordWhatsappNotification, loadFailedWhatsappNotification, loadLastWhatsappNotification } from "@/lib/whatsapp-notification-log";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type ResendMode = "original" | "template";

export type ResendResult =
  | { ok: true; type: "order_created" | "status_update"; mode: ResendMode; phone: string; message: string }
  | { ok: false; error: string; httpStatus: number };

type OrderRow = {
  id: string;
  order_code: string;
  status: string;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  product_id: string | null;
  product_name: string;
  total_amount: number | null;
  gateway_total_payment: number | null;
  created_at: string;
};

export async function resendOrderWhatsappNotification(input: {
  orderId?: string | null;
  orderCode?: string | null;
  mode?: ResendMode;
  /** Override nomor tujuan (dipakai kalau nomor pembeli salah, mis. "0"). */
  phone?: string | null;
  origin: string;
  sender: string;
}): Promise<ResendResult> {
  const supabase = await createServiceRoleClient();

  let orderQuery = supabase
    .from("orders")
    .select(
      "id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_id, product_name, total_amount, gateway_total_payment, created_at"
    );

  orderQuery = input.orderId
    ? orderQuery.eq("id", input.orderId)
    : orderQuery.eq("order_code", String(input.orderCode || "").trim());

  const { data: order, error: orderError } = await orderQuery.maybeSingle<OrderRow>();
  if (orderError || !order) {
    return { ok: false, error: "Pesanan tidak ditemukan.", httpStatus: 404 };
  }

  const { data: settings } = await supabase
    .from("site_settings")
    .select("site_name, whatsapp_number, social_links")
    .limit(1)
    .single();

  const config = getWhatsappNotificationConfig(
    (settings?.social_links as Record<string, unknown> | null) || null,
    settings?.whatsapp_number || null
  );

  if (!config.enabled) {
    return {
      ok: false,
      error: "Notifikasi WhatsApp sedang dimatikan di menu Notifikasi WA.",
      httpStatus: 400,
    };
  }

  // Notif order baru vs update status — ditentukan dari status order saat ini,
  // sama seperti saat notifikasi itu pertama dikirim.
  let type: "order_created" | "status_update" =
    order.status === "pending" ? "order_created" : "status_update";

  const receiver = resolveOrderReceiver({
    config,
    phoneOverride: input.phone,
    buyerPhone: order.buyer_whatsapp,
  });
  if (!receiver) {
    return {
      ok: false,
      error: `Nomor WhatsApp pembeli tidak valid${
        order.buyer_whatsapp ? ` ("${order.buyer_whatsapp}")` : ""
      }. Isi nomor tujuan manual di kolom nomor, lalu kirim ulang.`,
      httpStatus: 400,
    };
  }

  // Nomor seperti "0" ternormalisasi jadi "62" (tanpa nomor) dan tetap
  // diteruskan ke gateway — hasilnya gagal dengan error yang membingungkan.
  // Tolak di sini supaya admin langsung tahu nomornya yang salah.
  if (!isPlausibleWhatsappNumber(receiver)) {
    const source = String(input.phone || "").trim() || order.buyer_whatsapp;
    return {
      ok: false,
      error: `Nomor tujuan tidak lengkap: "${source}"${
        source === receiver ? "" : ` (jadi "${receiver}")`
      }. Isi nomor WhatsApp lengkap (mis. 08xx atau 628xx) lalu kirim ulang.`,
      httpStatus: 400,
    };
  }

  const [{ data: product }, { data: affiliate }] = await Promise.all([
    order.product_id
      ? supabase
          .from("products")
          .select("id, title, slug, thumbnail_url, digital_file_url, demo_url, purchase_url")
          .eq("id", order.product_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("affiliates")
      .select("referral_code")
      .eq("email", order.buyer_email)
      .maybeSingle(),
  ]);

  const context = buildWhatsappOrderContext({
    id: order.id,
    orderCode: order.order_code,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    buyerWhatsapp: order.buyer_whatsapp,
    productName: order.product_name,
    totalAmount: Number(order.gateway_total_payment || order.total_amount || 0),
    status: order.status,
    createdAt: order.created_at,
    siteName: settings?.site_name || "AzkazamDigital",
    origin: input.origin,
    productImageUrl: product?.thumbnail_url || null,
  });

  const mode: ResendMode = input.mode === "template" ? "template" : "original";

  let message: string;
  let usedMode: ResendMode = mode;

  if (mode === "original") {
    // Yang diulang adalah pesan yang GAGAL, bukan pesan sukses terakhir:
    // pesan akses produk FBMP memuat password yang hanya dikembalikan sekali
    // saat provisioning, jadi harus dikirim persis seperti aslinya.
    const stored = await resolveStoredMessage(order.order_code);

    if (stored?.message) {
      message = stored.message;
      // Kalau yang gagal ternyata notif tipe lain (mis. update status padahal
      // order masih pending), ikuti tipe pesan yang benar-benar dikirim ulang.
      type = stored.type;
    } else {
      message = buildMessage({ type, config, context, order, product, affiliate, origin: input.origin });
      usedMode = "template";
    }
  } else {
    message = buildMessage({ type, config, context, order, product, affiliate, origin: input.origin });
  }

  if (!message.trim()) {
    return {
      ok: false,
      error:
        "Isi pesan kosong. Isi template di menu Notifikasi WA (atau isi pesan akses produk) lalu coba lagi.",
      httpStatus: 400,
    };
  }

  try {
    await sendWhatsappMessage(config, receiver, message);

    const imageUrl = config.defaultImageUrl;
    if (config.enableImage && imageUrl) {
      const absolute = /^https?:\/\//i.test(imageUrl)
        ? imageUrl
        : new URL(imageUrl, input.origin).toString();
      try {
        await sendWhatsappImage(config, receiver, absolute, "");
      } catch (error) {
        console.error("Resend order WhatsApp image error:", error);
      }
    }

    await recordWhatsappNotification({
      orderId: order.id,
      orderCode: order.order_code,
      type,
      status: "sent",
      phone: receiver,
      message,
      sender: input.sender,
    });

    return { ok: true, type, mode: usedMode, phone: receiver, message };
  } catch (error) {
    const errorMessage = describeGatewayError(error);

    await recordWhatsappNotification({
      orderId: order.id,
      orderCode: order.order_code,
      type,
      status: "failed",
      phone: receiver,
      message,
      error: errorMessage,
      sender: input.sender,
    });

    return { ok: false, error: errorMessage, httpStatus: 502 };
  }
}

function resolveOrderReceiver(input: {
  config: WhatsappNotificationConfig;
  phoneOverride?: string | null;
  buyerPhone: string;
}) {
  const override = String(input.phoneOverride || "").trim();
  const source = override || input.buyerPhone;
  return formatWhatsappApiReceiver(source, input.config.formatNumber, input.config.provider);
}

/**
 * Nomor Indonesia yang masuk akal: 62 + 8xx + 7–12 digit.
 * Dipakai untuk menolak lebih awal nomor seperti "0"/"62" yang bikin gateway
 * gagal dengan pesan "usync query timed out" yang menyesatkan.
 */
function isPlausibleWhatsappNumber(receiver: string) {
  return /^628\d{7,12}$/.test(receiver.replace(/@s\.whatsapp\.net$/i, ""));
}

/**
 * Terjemahkan error gateway jadi pesan yang berguna untuk admin.
 *
 * Gateway membalas JSON string yang di-stringify ("{"code":"SEND_FAILED",...}"),
 * dan pesan mentahnya ("usync query timed out") menyesatkan — padahal biasanya
 * artinya nomor tujuan tidak punya WhatsApp / device lagi tidak login.
 */
function describeGatewayError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  let code = "";
  let message = raw;

  try {
    const parsed = JSON.parse(raw) as { code?: string; message?: string };
    if (parsed && typeof parsed === "object") {
      code = String(parsed.code || "");
      message = String(parsed.message || raw);
    }
  } catch {
    // bukan JSON — pakai teks mentah.
  }

  if (/not logged in|connection unavailable/i.test(message)) {
    return `Perangkat WhatsApp (instablast) sedang tidak login. Buka menu Notifikasi WA → perangkat → scan ulang QR, lalu klik Kirim Ulang. Detail: ${message}`;
  }

  if (/usync query timed out|failed to get device list/i.test(message)) {
    return `Gateway WhatsApp tidak merespons (kemungkinan nomor tujuan tidak punya WhatsApp, atau perangkat sedang sibuk). Detail: ${message}`;
  }

  if (/<!doctype html/i.test(message)) {
    return "Gateway WhatsApp membalas halaman HTML, bukan JSON — biasanya server gateway sedang error/restart. Coba lagi sebentar lagi.";
  }

  return code ? `${code}: ${message}` : message;
}

/**
 * Ambil pesan yang GAGAL terakhir untuk order ini (kalau ada).
 *
 * Yang perlu dikirim ulang adalah pesan yang gagal, bukan pesan sukses
 * terakhir — kalau order ini sebelumnya punya kiriman sukses lalu satu
 * kiriman gagal, tombol Kirim Ulang harus mengulang yang gagal itu.
 */
async function resolveStoredMessage(orderCode: string) {
  const failed = await loadFailedWhatsappNotification(orderCode);
  if (failed?.message) return failed;

  return loadLastWhatsappNotification(orderCode);
}

function buildMessage(input: {
  type: "order_created" | "status_update";
  config: WhatsappNotificationConfig;
  context: WhatsappOrderContext;
  order: OrderRow;
  product: {
    title: string | null;
    thumbnail_url: string | null;
    digital_file_url: string | null;
    demo_url: string | null;
    purchase_url: string | null;
  } | null;
  affiliate: { referral_code: string | null } | null;
  origin: string;
}) {
  if (input.type === "order_created") {
    return renderOrderCreatedMessage(input.config, input.context);
  }

  const accessMessage =
    input.order.status === "paid" ? buildPaidAccessMessage(input) : "";
  return renderOrderStatusMessage(input.config, input.context, accessMessage);
}

function buildPaidAccessMessage(input: {
  config: WhatsappNotificationConfig;
  order: OrderRow;
  product: {
    title: string | null;
    digital_file_url: string | null;
    demo_url: string | null;
    purchase_url: string | null;
  } | null;
  affiliate: { referral_code: string | null } | null;
  origin: string;
}) {
  const entry = resolvePaidAccessEntry(input.config, {
    id: input.order.product_id,
    title: input.product?.title || input.order.product_name,
  });
  if (!entry) return "";

  const template = entry.whatsappMessage || entry.emailMessage || "";
  if (!template.trim()) return "";

  const context: PaidAccessTemplateContext = {
    customerName: input.order.buyer_name,
    customerEmail: input.order.buyer_email,
    customerPhone: input.order.buyer_whatsapp,
    productName: input.product?.title || input.order.product_name,
    siteTitle: "AzkazamDigital",
    orderCode: input.order.order_code,
    orderTotal: new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(input.order.gateway_total_payment || input.order.total_amount || 0)),
    invoiceUrl: new URL(`/thank-you/${input.order.order_code}`, input.origin).toString(),
    loginEmail: input.order.buyer_email,
    // Password akun hanya tersedia sekali saat aktivasi; kalau dikirim ulang
    // dari template, token password diisi petunjuk, bukan string kosong.
    loginPassword: "",
    loginUrl: new URL("/affiliate/login", input.origin).toString(),
    dashboardUrl: new URL("/dashboard", input.origin).toString(),
    registerUrl: new URL("/affiliate/register", input.origin).toString(),
    affiliateCode: input.affiliate?.referral_code || "",
    productDownloadUrl: input.product?.digital_file_url || "",
    productDemoUrl: input.product?.demo_url || "",
    productPurchaseUrl: input.product?.purchase_url || "",
  };

  return resolvePaidAccessTemplate(template, context);
}
