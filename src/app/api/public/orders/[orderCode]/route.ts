import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderCode: string }> }
) {
  try {
    const { orderCode } = await context.params;
    const normalizedOrderCode = String(orderCode || "").trim();

    if (!normalizedOrderCode) {
      return NextResponse.json(
        { error: "Kode order tidak valid." },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, order_code, user_id, product_id, affiliate_id, buyer_name, buyer_email, buyer_whatsapp, product_name, price, subtotal, discount_amount, unique_code, total_amount, notes, coupon_code, referral_code, status, payment_provider, payment_method, gateway_status, gateway_order_id, gateway_amount, gateway_fee, gateway_total_payment, gateway_payment_number, gateway_expired_at, gateway_completed_at, gateway_payload, tracking_payload, created_at, updated_at"
      )
      .eq("order_code", normalizedOrderCode)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json(
        { error: "Order tidak ditemukan." },
        { status: 404 }
      );
    }

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    console.error("Public order status fetch error:", error);
    return NextResponse.json(
      { error: "Gagal memuat status order." },
      { status: 500 }
    );
  }
}
