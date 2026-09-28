/**
 * Notifikasi WhatsApp per order untuk menu Pesanan admin.
 *
 *   GET  /api/admin/whatsapp/order-notifications
 *        -> ringkasan status WA terakhir per order (untuk penanda baris + tombol)
 *        ?orderCode=ORD-...  -> riwayat lengkap 1 order
 *
 *   POST /api/admin/whatsapp/order-notifications
 *        -> kirim ulang notifikasi (isi pesan sama seperti menu Notifikasi WA)
 *        body: { orderId?, orderCode?, mode?: "original"|"template", phone? }
 *
 * Auth: verifyLmAdmin() (cookie License Manager) — konsisten dengan menu
 * Notifikasi WA, BUKAN Supabase `admins` (itu penyebab 401 di route lama).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyLmAdmin } from "@/lib/lm-admin";
import { resolveRequestOrigin } from "@/lib/site-url";
import {
  loadWhatsappNotificationSummaries,
  loadLastWhatsappNotification,
} from "@/lib/whatsapp-notification-log";
import { resendOrderWhatsappNotification, type ResendMode } from "@/lib/order-whatsapp-resend";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await verifyLmAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orderCode = request.nextUrl.searchParams.get("orderCode")?.trim();

    if (orderCode) {
      const supabase = await createServiceRoleClient();
      const { data, error } = await supabase
        .from("whatsapp_notification_logs")
        .select("id, order_code, type, status, phone, message, error, sender, created_at")
        .eq("order_code", orderCode)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, logs: data || [] });
    }

    // Ringkasan untuk seluruh daftar order di halaman (satu request, bukan N).
    const codesParam = request.nextUrl.searchParams.get("codes");
    const codes = codesParam
      ? codesParam.split(",").map((code) => code.trim()).filter(Boolean)
      : [];

    const summaries = await loadWhatsappNotificationSummaries(codes);

    return NextResponse.json({
      success: true,
      summaries: Object.fromEntries(summaries),
    });
  } catch (error) {
    console.error("Order WhatsApp notifications GET error:", error);
    return NextResponse.json(
      { error: "Gagal memuat status notifikasi WhatsApp." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyLmAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      orderId?: string;
      orderCode?: string;
      mode?: ResendMode;
      phone?: string;
      preview?: boolean;
    };

    if (!body.orderId && !body.orderCode) {
      return NextResponse.json(
        { error: "orderId atau orderCode wajib diisi." },
        { status: 400 }
      );
    }

    const origin = resolveRequestOrigin({
      headers: request.headers,
      nextUrlOrigin: request.nextUrl.origin,
    });

    const result = await resendOrderWhatsappNotification({
      orderId: body.orderId,
      orderCode: body.orderCode,
      mode: body.mode,
      phone: body.phone,
      origin,
      sender: admin.email || "admin",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }

    return NextResponse.json({
      success: true,
      type: result.type,
      mode: result.mode,
      phone: result.phone,
      message: result.message,
    });
  } catch (error) {
    console.error("Order WhatsApp notifications POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal mengirim ulang notifikasi WhatsApp.",
      },
      { status: 500 }
    );
  }
}
