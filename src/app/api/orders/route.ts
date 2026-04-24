import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { sendOrderInvoiceEmail } from "@/lib/email";
import { generateOrderCode } from "@/lib/utils";
import {
  ensureWhatsappAutomationLoop,
  syncOrderWhatsappFollowups,
} from "@/lib/whatsapp-automation";
import {
  buildWhatsappOrderContext,
  getWhatsappNotificationConfig,
  productImageFromProduct,
  sendOrderCreatedWhatsappNotifications,
} from "@/lib/whatsapp-notifications";

type CreateOrderPayload = {
  product_id?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_whatsapp?: string;
  coupon_code?: string | null;
  unique_code?: number | null;
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
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();
    const body = (await request.json()) as CreateOrderPayload;
    const {
      product_id,
      buyer_name,
      buyer_email,
      buyer_whatsapp,
      coupon_code,
      unique_code,
    } = body;

    if (!product_id || !buyer_name || !buyer_email || !buyer_whatsapp) {
      return NextResponse.json(
        { error: "Data pesanan belum lengkap." },
        { status: 400 }
      );
    }

    const normalizedBuyerEmail = buyer_email.trim().toLowerCase();
    const matchedUserId =
      user?.email?.trim().toLowerCase() === normalizedBuyerEmail ? user.id : null;

    const supabase = await createServiceRoleClient();

    const { data: settings } = await supabase
      .from("site_settings")
      .select(
        "checkout_coupon_enabled, site_name, email, payment_bank_name, payment_account_number, payment_account_name, payment_qris_url, whatsapp_number, social_links"
      )
      .limit(1)
      .single();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, title, price, affiliate_commission_rate, is_active, thumbnail_url")
      .eq("id", product_id)
      .single();

    if (productError || !product || !product.is_active) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan atau tidak aktif." },
        { status: 404 }
      );
    }

    const cookieRef = request.cookies.get("az_ref")?.value?.trim() || null;
    const submittedCode = settings?.checkout_coupon_enabled === false
      ? null
      : coupon_code?.trim().toUpperCase() || null;
    let coupon: CouponRow | null = null;
    let discountAmount = 0;

    if (submittedCode) {
      const { data: couponData } = await supabase
        .from("coupon_codes")
        .select("id, code, discount_type, discount_value, usage_limit, usage_count, starts_at, ends_at")
        .eq("code", submittedCode)
        .eq("is_active", true)
        .maybeSingle();

      if (couponData && isCouponUsable(couponData as CouponRow)) {
        coupon = couponData as CouponRow;
        discountAmount = calculateDiscount(Number(product.price), coupon);
      }
    }

    const manualRef = submittedCode && !coupon ? submittedCode : null;
    const referralCode = manualRef || cookieRef;

    let affiliate:
      | {
          id: string;
          referral_code: string;
        }
      | null = null;

    if (referralCode) {
      const { data } = await supabase
        .from("affiliate_links")
        .select(`
          referral_code,
          affiliate:affiliates!affiliate_links_affiliate_id_fkey (
            id,
            status
          )
        `)
        .eq("referral_code", referralCode)
        .eq("product_id", product.id)
        .maybeSingle();

      const affiliateRow = Array.isArray(data?.affiliate)
        ? data.affiliate[0]
        : data?.affiliate;

      if (data?.referral_code && affiliateRow?.id && affiliateRow.status === "approved") {
        affiliate = {
          id: affiliateRow.id,
          referral_code: data.referral_code,
        };
      }
    }

    if (submittedCode && !coupon && !affiliate) {
      return NextResponse.json(
        { error: "Kode kupon atau referral tidak valid." },
        { status: 400 }
      );
    }

    const orderCode = generateOrderCode();
    const subtotal = Number(product.price);
    const uniqueCode = normalizeUniquePaymentCode(unique_code);
    const totalAmount = Math.max(subtotal - discountAmount, 0) + uniqueCode;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        user_id: matchedUserId,
        product_id: product.id,
        affiliate_id: affiliate?.id || null,
        buyer_name,
        buyer_email,
        buyer_whatsapp,
        product_name: product.title,
        price: totalAmount,
        subtotal,
        discount_amount: discountAmount,
        unique_code: uniqueCode,
        total_amount: totalAmount,
        notes: null,
        coupon_code: coupon?.code || null,
        referral_code: affiliate?.referral_code || null,
        status: "pending",
        tracking_payload: {
          coupon_code: coupon?.code || null,
          discount_amount: discountAmount,
          unique_code: uniqueCode,
          subtotal,
          total_amount: totalAmount,
          referral_source: manualRef ? "manual" : cookieRef ? "cookie" : null,
          referral_code: affiliate?.referral_code || null,
        },
      })
      .select("id, order_code, created_at, status")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message || "Pesanan gagal dibuat." },
        { status: 400 }
      );
    }

    if (coupon) {
      await supabase
        .from("coupon_codes")
        .update({ usage_count: Number(coupon.usage_count || 0) + 1 })
        .eq("id", coupon.id);
    }

    let emailResult: { messageId?: string; skipped?: boolean; error?: string } = {
      skipped: true,
    };
    let whatsappResult: {
      adminSent?: boolean;
      customerSent?: boolean;
      skipped?: boolean;
      error?: string;
    } = { skipped: true };

    const origin =
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL;
    const thankYouUrl = new URL(`/thank-you/${order.order_code}`, origin).toString();
    const whatsappConfirmationUrl = buildWhatsappUrl(
      settings?.whatsapp_number || null,
      order.order_code
    );

    try {
      const info = await sendOrderInvoiceEmail({
        buyerName: buyer_name,
        buyerEmail: normalizedBuyerEmail,
        productName: product.title,
        orderCode: order.order_code,
        totalAmount,
        subtotal,
        discountAmount,
        uniqueCode,
        thankYouUrl,
        whatsappConfirmationUrl,
        siteName: settings?.site_name || "AzkazamDigital",
        supportEmail: settings?.email || null,
        payment: {
          bankName: settings?.payment_bank_name || "BCA",
          accountNumber: settings?.payment_account_number || "7891502145",
          accountName: settings?.payment_account_name || "ASNIDAR NUR",
          qrisUrl: settings?.payment_qris_url || "/qris.webp",
        },
      });

      emailResult = {
        messageId: info.messageId,
        skipped: false,
      };
    } catch (error) {
      console.error("Send order invoice email error:", error);
      emailResult = {
        skipped: false,
        error: error instanceof Error ? error.message : "Failed to send email.",
      };
    }

    try {
      const whatsappConfig = getWhatsappNotificationConfig(
        settings?.social_links as Record<string, unknown> | null,
        settings?.whatsapp_number || null
      );
      const origin =
        request.nextUrl.origin ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

      const result = await sendOrderCreatedWhatsappNotifications({
        config: whatsappConfig,
        order: buildWhatsappOrderContext({
          id: order.id,
          orderCode: order.order_code,
          buyerName: buyer_name,
          buyerEmail: normalizedBuyerEmail,
          buyerWhatsapp: buyer_whatsapp,
          productName: product.title,
          totalAmount,
          status: order.status,
          createdAt: order.created_at,
          siteName: settings?.site_name || "AzkazamDigital",
          productImageUrl: productImageFromProduct(product),
        }),
        origin,
      });

      whatsappResult = {
        ...result,
        skipped: false,
      };
    } catch (error) {
      console.error("Send order WhatsApp notification error:", error);
      whatsappResult = {
        skipped: false,
        error:
          error instanceof Error ? error.message : "Failed to send WhatsApp notification.",
      };
    }

    try {
      const whatsappConfig = getWhatsappNotificationConfig(
        settings?.social_links as Record<string, unknown> | null,
        settings?.whatsapp_number || null
      );

      await syncOrderWhatsappFollowups({
        config: whatsappConfig,
        supabase,
        order: {
          id: order.id,
          order_code: order.order_code,
          buyer_name,
          buyer_email: normalizedBuyerEmail,
          buyer_whatsapp,
          product_name: product.title,
          product_id: product.id,
          total_amount: totalAmount,
          status: order.status,
          created_at: order.created_at,
        },
      });
      ensureWhatsappAutomationLoop();
    } catch (error) {
      console.error("Schedule WhatsApp followups error:", error);
    }

    return NextResponse.json({
      success: true,
      order_code: order.order_code,
      total_amount: totalAmount,
      email: emailResult,
      whatsapp: whatsappResult,
    });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat membuat pesanan." },
      { status: 500 }
    );
  }
}

function generateUniquePaymentCode() {
  return Math.floor(Math.random() * 51) + 50;
}

function normalizeUniquePaymentCode(value?: number | null) {
  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 50 && numericValue <= 100) {
    return numericValue;
  }

  return generateUniquePaymentCode();
}

function isCouponUsable(coupon: CouponRow) {
  const now = Date.now();
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now) return false;
  if (coupon.ends_at && Date.parse(coupon.ends_at) < now) return false;
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) return false;
  return true;
}

function calculateDiscount(subtotal: number, coupon: CouponRow) {
  const rawDiscount =
    coupon.discount_type === "percent"
      ? (subtotal * Number(coupon.discount_value || 0)) / 100
      : Number(coupon.discount_value || 0);

  return Math.min(Math.max(Math.round(rawDiscount), 0), subtotal);
}

function buildWhatsappUrl(phone: string | null, orderCode: string) {
  const cleanPhone = (phone || "6281234567890").replace(/\D/g, "");
  const message = encodeURIComponent(
    `Halo, saya ingin konfirmasi pembayaran untuk pesanan ${orderCode}.`
  );

  return `https://wa.me/${cleanPhone}?text=${message}`;
}
