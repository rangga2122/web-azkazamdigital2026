import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  fetchPakasirTransactionDetail,
  isPakasirConfigured,
  resolvePakasirConfig,
} from "@/lib/pakasir";
import { processOrderPaidTransition } from "@/lib/order-paid";
import { resolveRequestOrigin } from "@/lib/site-url";

export async function POST(request: NextRequest) {
  try {
    const body = (await parseWebhookBody(request)) as {
      amount?: number;
      order_id?: string;
      project?: string;
      status?: string;
      payment_method?: string;
      completed_at?: string;
    };

    const orderCode = String(body.order_id || "").trim();
    const webhookStatus = String(body.status || "").trim().toLowerCase();
    const amount = Math.round(Number(body.amount || 0));
    const project = String(body.project || "").trim();

    if (!orderCode || !project || !amount || webhookStatus !== "completed") {
      return NextResponse.json({ success: true, ignored: true });
    }

    const serviceSupabase = await createServiceRoleClient();
    const [{ data: settings }, { data: existingOrder, error: orderError }] = await Promise.all([
      serviceSupabase
        .from("site_settings")
        .select(
          "pakasir_enabled, pakasir_mode, pakasir_project_slug, pakasir_api_key, pakasir_webhook_url"
        )
        .limit(1)
        .single(),
      serviceSupabase
        .from("orders")
        .select(
          "id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at, payment_provider, gateway_status"
        )
        .eq("order_code", orderCode)
        .maybeSingle(),
    ]);

    if (orderError || !existingOrder) {
      return NextResponse.json({ success: false, error: "Order tidak ditemukan." }, { status: 404 });
    }

    const pakasirConfig = resolvePakasirConfig(settings || {});
    if (!isPakasirConfigured(pakasirConfig)) {
      return NextResponse.json({ success: false, error: "Konfigurasi Pakasir belum lengkap." }, { status: 400 });
    }

    if (pakasirConfig.projectSlug !== project) {
      return NextResponse.json({ success: false, error: "Project slug webhook tidak cocok." }, { status: 400 });
    }

    if (Math.round(Number(existingOrder.total_amount || 0)) !== amount) {
      return NextResponse.json({ success: false, error: "Amount webhook tidak cocok." }, { status: 400 });
    }

    const transaction = await fetchPakasirTransactionDetail({
      projectSlug: pakasirConfig.projectSlug!,
      apiKey: pakasirConfig.apiKey!,
      orderId: orderCode,
      amount,
    });

    if (
      String(transaction.status || "").toLowerCase() !== "completed" ||
      Math.round(Number(transaction.amount || 0)) !== amount ||
      String(transaction.order_id || "").trim() !== orderCode
    ) {
      return NextResponse.json({ success: false, error: "Status transaksi belum valid." }, { status: 400 });
    }

    const { data: updatedOrder, error: updateError } = await serviceSupabase
      .from("orders")
      .update({
        status: "paid",
        payment_provider: "pakasir",
        payment_method: "qris",
        gateway_status: "completed",
        gateway_completed_at: transaction.completed_at || body.completed_at || new Date().toISOString(),
        gateway_payload: body,
      })
      .eq("id", existingOrder.id)
      .select(
        "id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at"
      )
      .single();

    if (updateError || !updatedOrder) {
      return NextResponse.json({ success: false, error: "Gagal memperbarui order." }, { status: 400 });
    }

    const origin = resolveRequestOrigin({
      headers: request.headers,
      nextUrlOrigin: request.nextUrl.origin,
    });

    await processOrderPaidTransition({
      serviceSupabase,
      origin,
      previousStatus: existingOrder.status,
      updatedOrder,
      licenseRegistration: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pakasir webhook error:", error);
    return NextResponse.json(
      { success: false, error: "Webhook Pakasir gagal diproses." },
      { status: 500 }
    );
  }
}

async function parseWebhookBody(request: NextRequest) {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(rawBody);
    return Object.fromEntries(params.entries());
  }
}
