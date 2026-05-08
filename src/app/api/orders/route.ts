import { after, NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { sendOrderInvoiceEmail } from "@/lib/email";
import {
  createPakasirQrisTransaction,
  isPakasirConfigured,
  resolvePakasirConfig,
} from "@/lib/pakasir";
import {
  generateOrderCode,
  normalizeUniquePaymentCode,
} from "@/lib/utils";
import { resolveRequestOrigin } from "@/lib/site-url";
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

type PostOrderSideEffectsInput = {
  origin: string;
  thankYouUrl: string;
  dynamicQrisUrl: string;
  whatsappConfirmationUrl: string;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  subtotal: number;
  discountAmount: number;
  uniqueCode: number;
  totalAmount: number;
  gatewayFee: number;
  gatewayTotalPayment: number;
  paymentProvider: "manual" | "pakasir";
  settings: {
    site_name: string | null;
    email: string | null;
    payment_bank_name: string | null;
    payment_account_number: string | null;
    payment_account_name: string | null;
    payment_qris_url: string | null;
    whatsapp_number: string | null;
    social_links: Record<string, unknown> | null;
  };
  product: {
    id: string;
    title: string;
    thumbnail_url: string | null;
  };
  order: {
    id: string;
    order_code: string;
    created_at: string;
    status: string;
  };
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

    const [settingsRes, productRes] = await Promise.all([
      supabase
        .from("site_settings")
        .select(
          "checkout_coupon_enabled, site_name, email, payment_bank_name, payment_account_number, payment_account_name, payment_qris_url, whatsapp_number, social_links, pakasir_enabled, pakasir_mode, pakasir_project_slug, pakasir_api_key, pakasir_webhook_url"
        )
        .limit(1)
        .single(),
      supabase
        .from("products")
        .select("id, title, price, affiliate_commission_rate, is_active, thumbnail_url")
        .eq("id", product_id)
        .single(),
    ]);
    const settings = settingsRes.data;
    const { data: product, error: productError } = productRes;

    if (productError || !product || !product.is_active) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan atau tidak aktif." },
        { status: 404 }
      );
    }

    const pakasirConfig = resolvePakasirConfig(settings || {});
    const pakasirEnabled = Boolean(pakasirConfig.enabled);
    if (pakasirEnabled && !isPakasirConfigured(pakasirConfig)) {
      return NextResponse.json(
        { error: "Konfigurasi QRIS otomatis belum lengkap." },
        { status: 500 }
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
    const { data: createdOrder, error: orderError } = await supabase
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

    if (orderError || !createdOrder) {
      return NextResponse.json(
        { error: orderError?.message || "Pesanan gagal dibuat." },
        { status: 400 }
      );
    }

    let order = createdOrder;

    if (coupon) {
      await supabase
        .from("coupon_codes")
        .update({ usage_count: Number(coupon.usage_count || 0) + 1 })
        .eq("id", coupon.id);
    }

    let paymentProvider: "manual" | "pakasir" = "manual";
    let gatewayFee = 0;
    let gatewayTotalPayment = totalAmount;

    if (pakasirEnabled) {
      try {
        const pakasirPayment = await createPakasirQrisTransaction({
          projectSlug: pakasirConfig.projectSlug!,
          apiKey: pakasirConfig.apiKey!,
          orderId: order.order_code,
          amount: totalAmount,
        });

        gatewayFee = Math.max(Number(pakasirPayment.fee || 0), 0);
        gatewayTotalPayment = Number(
          pakasirPayment.total_payment || totalAmount + gatewayFee
        );
        paymentProvider = "pakasir";

        const { data: updatedGatewayOrder, error: gatewayUpdateError } = await supabase
          .from("orders")
          .update({
            payment_provider: "pakasir",
            payment_method: "qris",
            gateway_status: "pending",
            gateway_order_id: pakasirPayment.order_id || order.order_code,
            gateway_amount: Number(pakasirPayment.amount || totalAmount),
            gateway_fee: gatewayFee,
            gateway_total_payment: gatewayTotalPayment,
            gateway_payment_number: pakasirPayment.payment_number,
            gateway_expired_at: pakasirPayment.expired_at,
            gateway_payload: pakasirPayment,
          })
          .eq("id", order.id)
          .select("id, order_code, created_at, status")
          .single();

        if (gatewayUpdateError || !updatedGatewayOrder) {
          throw new Error(
            gatewayUpdateError?.message || "Gagal menyimpan transaksi QRIS otomatis."
          );
        }

        order = updatedGatewayOrder;
      } catch (gatewayError) {
        await supabase
          .from("orders")
          .update({
            payment_provider: "pakasir",
            payment_method: "qris",
            gateway_status: "failed",
          })
          .eq("id", order.id);

        throw gatewayError;
      }
    }

    const origin = getRequestOrigin(request);
    const thankYouUrl = new URL(`/thank-you/${order.order_code}`, origin).toString();
    const dynamicQrisUrl = new URL(
      `/api/qris/order/${order.order_code}`,
      origin
    ).toString();
    const whatsappConfirmationUrl = buildWhatsappUrl(
      settings?.whatsapp_number || null,
      order.order_code
    );

    after(async () => {
      try {
        await runPostOrderSideEffects({
          origin,
          thankYouUrl,
          dynamicQrisUrl,
          whatsappConfirmationUrl,
          buyerName: buyer_name,
          buyerEmail: normalizedBuyerEmail,
          buyerWhatsapp: buyer_whatsapp,
          subtotal,
          discountAmount,
          uniqueCode,
          totalAmount,
          gatewayFee,
          gatewayTotalPayment,
          paymentProvider,
          settings: {
            site_name: settings?.site_name || null,
            email: settings?.email || null,
            payment_bank_name: settings?.payment_bank_name || null,
            payment_account_number: settings?.payment_account_number || null,
            payment_account_name: settings?.payment_account_name || null,
            payment_qris_url: settings?.payment_qris_url || null,
            whatsapp_number: settings?.whatsapp_number || null,
            social_links:
              (settings?.social_links as Record<string, unknown> | null) || null,
          },
          product: {
            id: product.id,
            title: product.title,
            thumbnail_url: product.thumbnail_url || null,
          },
          order: {
            id: order.id,
            order_code: order.order_code,
            created_at: order.created_at,
            status: order.status,
          },
        });
      } catch (error) {
        console.error("Run post-order side effects error:", error);
      }
    });

    return NextResponse.json({
      success: true,
      order_code: order.order_code,
      total_amount: totalAmount,
      gateway_total_payment: gatewayTotalPayment,
      thank_you_url: thankYouUrl,
      background_jobs: "scheduled",
    });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat membuat pesanan." },
      { status: 500 }
    );
  }
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

function getRequestOrigin(request: NextRequest) {
  return resolveRequestOrigin({
    headers: request.headers,
    nextUrlOrigin: request.nextUrl.origin,
  });
}

async function runPostOrderSideEffects(input: PostOrderSideEffectsInput) {
  const whatsappConfig = getWhatsappNotificationConfig(
    input.settings.social_links,
    input.settings.whatsapp_number
  );
  const followupSupabase = await createServiceRoleClient();

  const tasks = await Promise.allSettled([
    sendOrderInvoiceEmail({
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      productName: input.product.title,
      orderCode: input.order.order_code,
      totalAmount: input.totalAmount,
      subtotal: input.subtotal,
      discountAmount: input.discountAmount,
      uniqueCode: input.uniqueCode,
      thankYouUrl: input.thankYouUrl,
      whatsappConfirmationUrl: input.whatsappConfirmationUrl,
      siteName: input.settings.site_name || "AzkazamDigital",
      supportEmail: input.settings.email || null,
      payment: {
        provider: input.paymentProvider,
        bankName:
          input.paymentProvider === "pakasir"
            ? null
            : input.settings.payment_bank_name || "BCA",
        accountNumber:
          input.paymentProvider === "pakasir"
            ? null
            : input.settings.payment_account_number || "7891502145",
        accountName:
          input.paymentProvider === "pakasir"
            ? null
            : input.settings.payment_account_name || "ASNIDAR NUR",
        qrisUrl: input.dynamicQrisUrl,
        qrisSourceUrl:
          input.paymentProvider === "pakasir"
            ? null
            : input.settings.payment_qris_url || "/qris.webp",
        qrisAmount: input.paymentProvider === "pakasir" ? null : input.totalAmount,
        gatewayFee: input.gatewayFee,
        totalPayAmount: input.gatewayTotalPayment,
      },
    }),
    sendOrderCreatedWhatsappNotifications({
      config: whatsappConfig,
      order: buildWhatsappOrderContext({
        id: input.order.id,
        orderCode: input.order.order_code,
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail,
        buyerWhatsapp: input.buyerWhatsapp,
        productName: input.product.title,
        totalAmount: input.gatewayTotalPayment,
        status: input.order.status,
        createdAt: input.order.created_at,
        siteName: input.settings.site_name || "AzkazamDigital",
        origin: input.origin,
        productImageUrl: productImageFromProduct(input.product),
      }),
      origin: input.origin,
    }),
    syncOrderWhatsappFollowups({
      config: whatsappConfig,
      supabase: followupSupabase,
      order: {
        id: input.order.id,
        order_code: input.order.order_code,
        buyer_name: input.buyerName,
        buyer_email: input.buyerEmail,
        buyer_whatsapp: input.buyerWhatsapp,
        product_name: input.product.title,
        product_id: input.product.id,
        total_amount: input.gatewayTotalPayment,
        status: input.order.status,
        created_at: input.order.created_at,
      },
    }).then(() => {
      ensureWhatsappAutomationLoop();
    }),
  ]);

  const labels = [
    "Send order invoice email",
    "Send order WhatsApp notification",
    "Schedule WhatsApp followups",
  ];

  tasks.forEach((task, index) => {
    if (task.status === "rejected") {
      console.error(`${labels[index]} error:`, task.reason);
    }
  });
}
