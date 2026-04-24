import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

type ValidateCouponPayload = {
  product_id?: string;
  coupon_code?: string | null;
};

type CouponRow = {
  id: string;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: number;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string | null;
  ends_at: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ValidateCouponPayload;
    const productId = body.product_id?.trim();
    const submittedCode = body.coupon_code?.trim().toUpperCase();

    if (!productId || !submittedCode) {
      return NextResponse.json(
        { error: "Kode kupon belum diisi." },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();

    const { data: settings } = await supabase
      .from("site_settings")
      .select("checkout_coupon_enabled")
      .limit(1)
      .single();

    if (settings?.checkout_coupon_enabled === false) {
      return NextResponse.json(
        { error: "Kode kupon sedang dinonaktifkan." },
        { status: 400 }
      );
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, price, is_active")
      .eq("id", productId)
      .single();

    if (productError || !product || !product.is_active) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan atau tidak aktif." },
        { status: 404 }
      );
    }

    const { data: couponData } = await supabase
      .from("coupon_codes")
      .select(
        "id, code, discount_type, discount_value, usage_limit, usage_count, starts_at, ends_at"
      )
      .eq("code", submittedCode)
      .eq("is_active", true)
      .maybeSingle();

    if (couponData && isCouponUsable(couponData as CouponRow)) {
      const coupon = couponData as CouponRow;
      const discountAmount = calculateDiscount(Number(product.price), coupon);

      return NextResponse.json({
        success: true,
        kind: "coupon",
        code: coupon.code,
        discount_amount: discountAmount,
        message: `Kupon ${coupon.code} berhasil dipakai.`,
      });
    }

    const { data: affiliateLink } = await supabase
      .from("affiliate_links")
      .select("referral_code, affiliate:affiliates!affiliate_links_affiliate_id_fkey(status)")
      .eq("referral_code", submittedCode)
      .eq("product_id", productId)
      .maybeSingle();

    const affiliate = Array.isArray(affiliateLink?.affiliate)
      ? affiliateLink.affiliate[0]
      : affiliateLink?.affiliate;

    if (affiliateLink?.referral_code && affiliate?.status === "approved") {
      return NextResponse.json({
        success: true,
        kind: "referral",
        code: affiliateLink.referral_code,
        discount_amount: 0,
        message: `Referral ${affiliateLink.referral_code} berhasil dipakai.`,
      });
    }

    return NextResponse.json(
      { error: "Kode kupon atau referral tidak valid." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Validate coupon error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat validasi kode." },
      { status: 500 }
    );
  }
}

function isCouponUsable(coupon: CouponRow) {
  const now = Date.now();
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now) return false;
  if (coupon.ends_at && Date.parse(coupon.ends_at) < now) return false;
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    return false;
  }
  return true;
}

function calculateDiscount(subtotal: number, coupon: CouponRow) {
  const rawDiscount =
    coupon.discount_type === "percent"
      ? (subtotal * Number(coupon.discount_value || 0)) / 100
      : Number(coupon.discount_value || 0);

  return Math.min(Math.max(Math.round(rawDiscount), 0), subtotal);
}
