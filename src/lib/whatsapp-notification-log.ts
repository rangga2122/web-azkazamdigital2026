/**
 * Log percobaan kirim notifikasi WhatsApp per order.
 *
 * Kenapa ada: kegagalan kirim WA (instablast/GOWA) sebelumnya hanya masuk
 * console container, sehingga panel Admin tidak tahu notif order mana yang
 * gagal, kenapa gagal, dan tidak bisa mengirim ulang. Satu baris = satu
 * percobaan kirim (berhasil maupun gagal).
 *
 * Tabel: public.whatsapp_notification_logs
 * Dipakai oleh: sendOrderCreatedWhatsappNotifications / sendOrderStatusWhatsappNotification
 * (via order-paid.ts + api/orders), dan route kirim ulang
 * POST /api/admin/whatsapp/order-notifications.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export type WhatsappNotificationType = "order_created" | "status_update";
export type WhatsappNotificationStatus = "sent" | "failed";

export type WhatsappNotificationLogRow = {
  id: string;
  order_id: string | null;
  order_code: string;
  type: WhatsappNotificationType;
  status: WhatsappNotificationStatus;
  phone: string | null;
  message: string | null;
  error: string | null;
  sender: string;
  created_at: string;
};

export type WhatsappNotificationSummary = {
  order_code: string;
  /** Status percobaan terakhir untuk order ini. */
  last_status: WhatsappNotificationStatus;
  last_type: WhatsappNotificationType;
  last_error: string | null;
  last_at: string;
  last_sender: string;
  /**
   * true kalau percobaan terakhir gagal, ATAU pernah gagal setelah kiriman
   * terakhir yang sukses (artinya masih ada notif yang belum terkirim).
   */
  needs_resend: boolean;
  sent_count: number;
  failed_count: number;
  /** Pesan terakhir yang berhasil/gagal dirender — dipakai untuk kirim ulang persis sama. */
  last_message: string | null;
  last_phone: string | null;
};

const TABLE = "whatsapp_notification_logs";

/** Batasi panjang error supaya tabel log tidak membengkak oleh body HTML gateway. */
function trimError(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : String(value);
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 600 ? `${clean.slice(0, 600)}…` : clean;
}

/**
 * Catat satu percobaan kirim. Tidak pernah melempar error — kegagalan logging
 * tidak boleh menggagalkan pengiriman notifikasi itu sendiri.
 */
export async function recordWhatsappNotification(input: {
  orderId?: string | null;
  orderCode: string;
  type: WhatsappNotificationType;
  status: WhatsappNotificationStatus;
  phone?: string | null;
  message?: string | null;
  error?: unknown;
  sender?: string | null;
}) {
  if (!input.orderCode) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from(TABLE).insert({
      order_id: input.orderId || null,
      order_code: input.orderCode,
      type: input.type,
      status: input.status,
      phone: input.phone || null,
      message: input.message || null,
      error: input.status === "failed" ? trimError(input.error) : null,
      sender: (input.sender || "system").slice(0, 120),
    });

    if (error) {
      console.error("Record WhatsApp notification log error:", error.message);
    }
  } catch (error) {
    console.error("Record WhatsApp notification log error:", error);
  }
}

/** Ringkasan status WA terakhir untuk sekumpulan kode order (menu Pesanan). */
export async function loadWhatsappNotificationSummaries(orderCodes: string[]) {
  const summary = new Map<string, WhatsappNotificationSummary>();
  const codes = Array.from(
    new Set(orderCodes.map((code) => String(code || "").trim()).filter(Boolean))
  );
  if (codes.length === 0) return summary;

  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("order_code, type, status, phone, message, error, sender, created_at")
      .in("order_code", codes)
      .order("created_at", { ascending: false })
      // 132 order x beberapa percobaan; batasi supaya response tetap ringan.
      .limit(2000);

    if (error || !data) {
      if (error) console.error("Load WhatsApp notification summaries error:", error.message);
      return summary;
    }

    const rows = data as Array<
      Pick<
        WhatsappNotificationLogRow,
        "order_code" | "type" | "status" | "phone" | "message" | "error" | "sender" | "created_at"
      >
    >;

    for (const row of rows) {
      const existing = summary.get(row.order_code);

      if (existing) {
        // rows urut created_at desc, jadi baris pertama = percobaan terakhir.
        if (row.status === "sent") existing.sent_count += 1;
        else existing.failed_count += 1;

        // pencarian pesan terakhir yang punya isi (untuk kirim ulang persis)
        if (!existing.last_message && row.message) existing.last_message = row.message;
        continue;
      }

      // Baris pertama tiap order = percobaan TERAKHIR. Tombol WA dihijaukan
      // hanya kalau percobaan terakhir sukses; kegagalan lama yang sudah
      // disusul kiriman sukses tidak boleh menyalakan tombol merah terus.
      summary.set(row.order_code, {
        order_code: row.order_code,
        last_status: row.status,
        last_type: row.type,
        last_error: row.error,
        last_at: row.created_at,
        last_sender: row.sender,
        needs_resend: row.status === "failed",
        sent_count: row.status === "sent" ? 1 : 0,
        failed_count: row.status === "failed" ? 1 : 0,
        last_message: row.message || null,
        last_phone: row.phone || null,
      });
    }

    return summary;
  } catch (error) {
    console.error("Load WhatsApp notification summaries error:", error);
    return summary;
  }
}

/**
 * Percobaan kirim TERAKHIR YANG GAGAL untuk satu order.
 *
 * Dipakai tombol "Kirim Ulang": yang perlu dikirim ulang adalah pesan yang
 * gagal, bukan pesan sukses terakhir. Penting karena pesan akses produk FBMP
 * memuat password yang hanya dikembalikan sekali saat provisioning — kalau
 * dirender ulang dari template, password itu hilang.
 */
export async function loadFailedWhatsappNotification(orderCode: string) {
  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, order_id, order_code, type, status, phone, message, error, sender, created_at")
      .eq("order_code", orderCode)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as WhatsappNotificationLogRow;
  } catch {
    return null;
  }
}

/** Notif terakhir untuk satu order (dipakai saat kirim ulang). */
export async function loadLastWhatsappNotification(orderCode: string) {
  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, order_id, order_code, type, status, phone, message, error, sender, created_at")
      .eq("order_code", orderCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as WhatsappNotificationLogRow;
  } catch {
    return null;
  }
}
