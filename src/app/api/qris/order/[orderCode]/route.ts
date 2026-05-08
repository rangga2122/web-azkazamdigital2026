import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createDynamicQrisSvgFromSource, createQrisSvgFromPayload } from "@/lib/qris";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderCode: string }> }
) {
  try {
    const { orderCode } = await context.params;
    const supabase = await createServiceRoleClient();

    const [orderRes, settingsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("order_code, total_amount, price, payment_provider, gateway_payment_number")
        .eq("order_code", orderCode)
        .single(),
      supabase
        .from("site_settings")
        .select("payment_qris_url")
        .limit(1)
        .single(),
    ]);

    if (!orderRes.data) {
      return new NextResponse("Order tidak ditemukan.", { status: 404 });
    }

    if (
      orderRes.data.payment_provider === "pakasir" &&
      orderRes.data.gateway_payment_number
    ) {
      const svg = await createQrisSvgFromPayload(orderRes.data.gateway_payment_number);

      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const totalAmount = Number(
      orderRes.data.total_amount || orderRes.data.price || 0
    );
    const qrisSource = settingsRes.data?.payment_qris_url || "/qris.webp";
    const svg = await createDynamicQrisSvgFromSource(qrisSource, totalAmount);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Dynamic QRIS generation error:", error);
    return new NextResponse("Gagal membuat QRIS dinamis.", { status: 500 });
  }
}
