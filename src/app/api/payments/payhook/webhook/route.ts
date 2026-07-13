import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processOrderPaidTransition } from "@/lib/order-paid";
import { resolveRequestOrigin } from "@/lib/site-url";

/**
 * PayHook Webhook Receiver
 *
 * PayHook (Android app) monitors payment notifications from e-wallet/bank apps
 * and sends parsed payment data as JSON to this endpoint.
 *
 * Authentication:
 * - Set PAYHOOK_WEBHOOK_SECRET env var on the server
 * - Configure PayHook app to send one of:
 *   - Bearer Token: Authorization: Bearer <secret>
 *   - API Key: X-API-Key: <secret>
 *   - No Auth: (only if env var is not set — testing only)
 *
 * Order Matching:
 * - PayHook sends amount detected from notification text
 * - We match against pending orders by total_amount (includes unique_code)
 * - unique_code makes each order amount unique, enabling reliable matching
 */

type PayHookPayload = {
  amount?: number;
  amount_raw?: string;
  currency?: string;
  app?: string;
  app_name?: string;
  package_name?: string;
  title?: string;
  notification_title?: string;
  text?: string;
  notification_text?: string;
  timestamp?: string;
  received_at?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // --- Auth validation ---
    const webhookSecret = process.env.PAYHOOK_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const authHeader = request.headers.get("authorization")?.trim() || "";
      const apiKeyHeader = request.headers.get("x-api-key")?.trim() || "";
      const customKeyHeader = request.headers.get("x-payhook-key")?.trim() || "";

      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const bearerToken = bearerMatch?.[1]?.trim();
      const providedToken = bearerToken || apiKeyHeader || customKeyHeader;

      if (!providedToken || providedToken !== webhookSecret) {
        console.warn("[payhook] Unauthorized webhook attempt");
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // --- Parse payload ---
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json(
        { success: false, error: "Empty payload" },
        { status: 400 }
      );
    }

    let body: PayHookPayload;
    try {
      body = JSON.parse(rawBody) as PayHookPayload;
    } catch {
      // Some webhook senders use form-encoded data
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries()) as unknown as PayHookPayload;
    }

    // --- Extract amount ---
    const amount = extractAmount(body);
    if (!amount || amount <= 0) {
      console.warn("[payhook] No valid amount found in payload:", JSON.stringify(body).slice(0, 200));
      return NextResponse.json(
        { success: false, error: "Amount tidak ditemukan dalam payload" },
        { status: 400 }
      );
    }

    const sourceApp = String(body.app || body.app_name || body.package_name || "unknown").trim();
    const notificationText = String(body.text || body.notification_text || body.title || body.notification_title || "").trim();
    const timestamp = String(body.timestamp || body.received_at || new Date().toISOString());

    console.log(`[payhook] Webhook received: amount=${amount}, app=${sourceApp}, text="${notificationText.slice(0, 80)}"`);

    // --- Find matching pending order by total_amount ---
    const serviceSupabase = await createServiceRoleClient();

    const { data: pendingOrders, error: orderError } = await serviceSupabase
      .from("orders")
      .select(
        "id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at, payment_provider"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);

    if (orderError) {
      console.error("[payhook] Error fetching pending orders:", orderError.message);
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      );
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log("[payhook] No pending orders found");
      return NextResponse.json({
        success: true,
        matched: false,
        message: "Tidak ada order pending untuk dicocokkan",
      });
    }

    // Match by total_amount (which includes unique_code — unique per order)
    const matchedOrder = pendingOrders.find((order) => {
      const orderTotal = Math.round(Number(order.total_amount || 0));
      const gatewayTotal = Math.round(Number(order.gateway_total_payment || 0));
      return orderTotal === amount || gatewayTotal === amount;
    });

    if (!matchedOrder) {
      console.log(`[payhook] No matching order for amount=${amount}. Pending orders: ${pendingOrders.map(o => o.total_amount).join(", ")}`);
      return NextResponse.json({
        success: true,
        matched: false,
        message: `Tidak ada order dengan amount ${amount}`,
        amount,
      });
    }

    // --- Prevent double-processing ---
    if (matchedOrder.status !== "pending") {
      console.log(`[payhook] Order ${matchedOrder.order_code} already processed (status=${matchedOrder.status})`);
      return NextResponse.json({
        success: true,
        matched: true,
        alreadyProcessed: true,
        order_code: matchedOrder.order_code,
      });
    }

    console.log(`[payhook] Matched order ${matchedOrder.order_code} (amount=${amount}, unique_code=${matchedOrder.unique_code})`);

    // --- Update order to paid ---
    const { data: updatedOrder, error: updateError } = await serviceSupabase
      .from("orders")
      .update({
        status: "paid",
        payment_provider: "payhook",
        payment_method: sourceApp,
        gateway_status: "completed",
        gateway_completed_at: new Date().toISOString(),
        gateway_payload: {
          ...body,
          _payhook_received_at: new Date().toISOString(),
          _payhook_source: "payhook_webhook",
          _matched_amount: amount,
          _processing_ms: Date.now() - startTime,
        },
      })
      .eq("id", matchedOrder.id)
      .eq("status", "pending") // Optimistic concurrency: only update if still pending
      .select(
        "id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at"
      )
      .single();

    if (updateError || !updatedOrder) {
      // Race condition: order was updated by another process
      console.warn(`[payhook] Order ${matchedOrder.order_code} could not be updated (possibly already processed)`);
      return NextResponse.json({
        success: true,
        matched: true,
        alreadyProcessed: true,
        order_code: matchedOrder.order_code,
      });
    }

    // --- Trigger paid transition (email, WhatsApp, license activation) ---
    const origin = resolveRequestOrigin({
      headers: request.headers,
      nextUrlOrigin: request.nextUrl.origin,
    });

    try {
      const transitionResult = await processOrderPaidTransition({
        serviceSupabase,
        origin,
        previousStatus: "pending",
        updatedOrder,
        licenseRegistration: null,
      });

      console.log(`[payhook] Order ${updatedOrder.order_code} marked as paid. Email: ${transitionResult.email.skipped ? "skipped" : transitionResult.email.error ? "error" : "sent"}, WhatsApp: ${transitionResult.whatsapp.skipped ? "skipped" : transitionResult.whatsapp.error ? "error" : "sent"}, License: ${transitionResult.license.skipped ? "skipped" : `${transitionResult.license.created || 0} created`}`);

      return NextResponse.json({
        success: true,
        matched: true,
        order_code: updatedOrder.order_code,
        amount,
        source_app: sourceApp,
        processing_ms: Date.now() - startTime,
      });
    } catch (transitionError) {
      console.error(`[payhook] Order ${updatedOrder.order_code} paid but transition failed:`, transitionError);
      // Order is already marked as paid — transition failure is non-fatal
      return NextResponse.json({
        success: true,
        matched: true,
        order_code: updatedOrder.order_code,
        amount,
        warning: "Order marked as paid but post-processing encountered an error",
      });
    }
  } catch (error) {
    console.error("[payhook] Webhook error:", error);
    return NextResponse.json(
      { success: false, error: "PayHook webhook gagal diproses" },
      { status: 500 }
    );
  }
}

/**
 * Extract numeric amount from PayHook payload.
 * PayHook may send amount in various field names depending on app version.
 * Also handles string amounts like "Rp 50.000" or "50000".
 */
function extractAmount(body: PayHookPayload): number | null {
  // Try direct numeric fields
  const directFields = ["amount", "nominal", "value", "payment_amount", "transfer_amount"];
  for (const field of directFields) {
    const val = body[field];
    if (typeof val === "number" && val > 0) {
      return Math.round(val);
    }
    if (typeof val === "string") {
      const parsed = parseRupiahString(val);
      if (parsed && parsed > 0) return parsed;
    }
  }

  // Try string fields that may contain amount
  const stringFields = ["amount_raw", "nominal_text", "text", "notification_text", "title", "notification_title"];
  for (const field of stringFields) {
    const val = body[field];
    if (typeof val === "string") {
      const parsed = parseRupiahString(val);
      if (parsed && parsed > 0) return parsed;
    }
  }

  // Last resort: scan all values in the payload
  for (const key of Object.keys(body)) {
    if (key.startsWith("_")) continue;
    const val = body[key];
    if (typeof val === "string") {
      const parsed = parseRupiahString(val);
      if (parsed && parsed > 100) return parsed; // Min 100 to avoid false positives
    }
  }

  return null;
}

/**
 * Parse Indonesian Rupiah string to number.
 * Handles: "Rp 50.000", "50000", "Rp50.000,00", "50.000", etc.
 */
function parseRupiahString(text: string): number | null {
  if (!text) return null;

  // Remove "Rp", "IDR", spaces
  let cleaned = text.replace(/rp\.?\s*/gi, "").replace(/idr\s*/gi, "").trim();

  // If contains comma (Indonesian decimal), remove decimal part
  // "50.000,00" → "50.000"
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/,\d+$/, "");
  }

  // Remove dots (thousand separator in Indonesian format)
  cleaned = cleaned.replace(/\./g, "");

  // Extract first number sequence
  const match = cleaned.match(/\d+/);
  if (!match) return null;

  const num = parseInt(match[0], 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * GET endpoint — health check / webhook info
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "payhook",
    status: "active",
    auth_required: Boolean(process.env.PAYHOOK_WEBHOOK_SECRET?.trim()),
    timestamp: new Date().toISOString(),
  });
}
