import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { sendPaidOrderEmail } from "@/lib/email";
import { ensureAffiliateAuthAccount } from "@/lib/affiliate-auth";
import { addLicenseUsers } from "@/lib/license-manager";
import {
  ensureWhatsappAutomationLoop,
  syncOrderWhatsappFollowups,
} from "@/lib/whatsapp-automation";
import {
  buildWhatsappOrderContext,
  getWhatsappNotificationConfig,
  resolvePaidAccessEntry,
  resolvePaidAccessTemplate,
  sendOrderStatusWhatsappNotification,
} from "@/lib/whatsapp-notifications";

const VALID_ORDER_STATUSES = ["pending", "paid", "failed", "cancelled"] as const;

type OrderStatus = (typeof VALID_ORDER_STATUSES)[number];

type LicenseRegistrationPayload = {
  enabled: boolean;
  role: "admin" | "user";
  allowedFeatures: string[];
  productEntries: Array<{
    productName: string;
    expiryDate?: string | null;
    maxSessions?: number | null;
  }>;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: admin } = await sessionSupabase
      .from("admins")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      status?: string;
      licenseRegistration?: unknown;
    };
    const nextStatus = body.status as OrderStatus | undefined;

    if (!nextStatus || !VALID_ORDER_STATUSES.includes(nextStatus)) {
      return NextResponse.json(
        { error: "Status order tidak valid." },
        { status: 400 }
      );
    }

    const serviceSupabase = await createServiceRoleClient();
    const { data: existingOrder, error: existingOrderError } = await serviceSupabase
      .from("orders")
      .select("id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, created_at")
      .eq("id", id)
      .single();

    if (existingOrderError || !existingOrder) {
      return NextResponse.json(
        { error: "Order tidak ditemukan." },
        { status: 404 }
      );
    }

    const { data: updatedOrder, error: updateError } = await serviceSupabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", id)
      .select("id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, created_at")
      .single();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        { error: updateError?.message || "Gagal mengubah status order." },
        { status: 400 }
      );
    }

    let emailResult: { messageId?: string; skipped?: boolean; error?: string } = {
      skipped: true,
    };
    let whatsappResult: { customerSent?: boolean; skipped?: boolean; error?: string } = {
      skipped: true,
    };
    let licenseResult: {
      skipped?: boolean;
      created?: number;
      duplicate?: number;
      failed?: number;
      error?: string;
    } = {
      skipped: true,
    };
    let paidAccessEmailMessage: string | null = null;
    let paidAccessWhatsappMessage: string | null = null;
    let paidAccessEmailSubject: string | null = null;

    const [{ data: settings }, { data: affiliate }, { data: product }] = await Promise.all([
      serviceSupabase
        .from("site_settings")
        .select("site_name, email, whatsapp_number, social_links")
        .limit(1)
        .single(),
      serviceSupabase
        .from("affiliates")
        .select("referral_code, user_id")
        .eq("email", updatedOrder.buyer_email)
        .maybeSingle(),
      updatedOrder.product_id
        ? serviceSupabase
            .from("products")
            .select("id, title, slug, thumbnail_url, digital_file_url, demo_url, purchase_url")
            .eq("id", updatedOrder.product_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const origin =
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const loginUrl = new URL("/affiliate/login", origin).toString();
    const registerUrl = new URL("/affiliate/register", origin).toString();
    const dashboardUrl = new URL("/dashboard", origin).toString();
    const whatsappConfig = getWhatsappNotificationConfig(
      settings?.social_links as Record<string, unknown> | null,
      settings?.whatsapp_number || null
    );

    if (existingOrder.status !== "paid" && updatedOrder.status === "paid") {
      const licenseRegistration = normalizeLicenseRegistration(body.licenseRegistration);

      if (licenseRegistration.enabled && licenseRegistration.productEntries.length > 0) {
        try {
          const licenseData = await addLicenseUsers({
            email: updatedOrder.buyer_email,
            role: licenseRegistration.role,
            allowedFeatures: licenseRegistration.allowedFeatures,
            productEntries: licenseRegistration.productEntries,
          });
          const results = licenseData.results || [];
          licenseResult = {
            skipped: false,
            created: results.filter((item) => item.status === "success").length,
            duplicate: results.filter((item) => item.status === "duplicate").length,
            failed: results.filter((item) => item.status === "error").length,
          };
        } catch (error) {
          console.error("Auto register license users from order error:", error);
          licenseResult = {
            skipped: false,
            error:
              error instanceof Error
                ? error.message
                : "Registrasi lisensi otomatis gagal.",
          };
        }
      }

      let authAccount = {
        userId: null as string | null,
        createdAutomatically: false,
        defaultPassword: null as string | null,
      };

      try {
        authAccount = await ensureAffiliateAuthAccount({
          supabase: serviceSupabase,
          email: updatedOrder.buyer_email,
          fullName: updatedOrder.buyer_name,
        });
      } catch (error) {
        console.error("Auto create affiliate auth account error:", error);
      }

      const accessEntry = resolvePaidAccessEntry(whatsappConfig, {
        id: updatedOrder.product_id,
        title: product?.title || updatedOrder.product_name,
      });
      const accessContext = {
        customerName: updatedOrder.buyer_name,
        customerEmail: updatedOrder.buyer_email,
        customerPhone: updatedOrder.buyer_whatsapp,
        productName: product?.title || updatedOrder.product_name,
        siteTitle: settings?.site_name || "AzkazamDigital",
        orderCode: updatedOrder.order_code,
        orderTotal: new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(Number(updatedOrder.total_amount || 0)),
        loginEmail: updatedOrder.buyer_email,
        loginPassword: authAccount.defaultPassword || "",
        loginUrl,
        dashboardUrl,
        registerUrl,
        affiliateCode: affiliate?.referral_code || "",
        productDownloadUrl: product?.digital_file_url || "",
        productDemoUrl: product?.demo_url || "",
        productPurchaseUrl: product?.purchase_url || "",
      };
      paidAccessEmailMessage = accessEntry?.emailMessage
        ? resolvePaidAccessTemplate(accessEntry.emailMessage, accessContext)
        : accessEntry?.whatsappMessage
        ? resolvePaidAccessTemplate(accessEntry.whatsappMessage, accessContext)
        : "";
      paidAccessEmailSubject = accessEntry?.emailSubject
        ? resolvePaidAccessTemplate(accessEntry.emailSubject, accessContext)
        : null;
      paidAccessWhatsappMessage = accessEntry?.whatsappMessage
        ? resolvePaidAccessTemplate(accessEntry.whatsappMessage, accessContext)
        : accessEntry?.emailMessage
        ? resolvePaidAccessTemplate(accessEntry.emailMessage, accessContext)
        : "";

      try {
        const info = await sendPaidOrderEmail({
          buyerName: updatedOrder.buyer_name,
          buyerEmail: updatedOrder.buyer_email,
          productName: updatedOrder.product_name,
          totalAmount: Number(updatedOrder.total_amount || 0),
          orderCode: updatedOrder.order_code,
          siteName: settings?.site_name || "AzkazamDigital",
          supportEmail: settings?.email || null,
          loginUrl,
          registerUrl,
          dashboardUrl,
          affiliateCode: affiliate?.referral_code || null,
          loginEmail: updatedOrder.buyer_email,
          defaultPassword: authAccount.defaultPassword,
          accessSubject: paidAccessEmailSubject,
          accountCreatedAutomatically: authAccount.createdAutomatically,
          accessMessage: paidAccessEmailMessage || null,
        });

        emailResult = {
          messageId: info.messageId,
          skipped: false,
        };
      } catch (error) {
        console.error("Send paid order email error:", error);
        emailResult = {
          skipped: false,
          error: error instanceof Error ? error.message : "Failed to send email.",
        };
      }
    }

    try {
      const result = await sendOrderStatusWhatsappNotification({
        config: whatsappConfig,
        order: buildWhatsappOrderContext({
          id: updatedOrder.id,
          orderCode: updatedOrder.order_code,
          buyerName: updatedOrder.buyer_name,
          buyerEmail: updatedOrder.buyer_email,
          buyerWhatsapp: updatedOrder.buyer_whatsapp,
          productName: updatedOrder.product_name,
          totalAmount: Number(updatedOrder.total_amount || 0),
          status: updatedOrder.status,
          previousStatus: existingOrder.status,
          createdAt: updatedOrder.created_at,
          siteName: settings?.site_name || "AzkazamDigital",
          productImageUrl: product?.thumbnail_url || null,
        }),
        origin,
        accessMessage:
          updatedOrder.status === "paid" ? paidAccessWhatsappMessage : null,
      });

      whatsappResult = {
        ...result,
        skipped: false,
      };
    } catch (error) {
      console.error("Send order status WhatsApp error:", error);
      whatsappResult = {
        skipped: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp status notification.",
      };
    }

    try {
      await syncOrderWhatsappFollowups({
        config: whatsappConfig,
        supabase: serviceSupabase,
        order: {
          id: updatedOrder.id,
          order_code: updatedOrder.order_code,
          buyer_name: updatedOrder.buyer_name,
          buyer_email: updatedOrder.buyer_email,
          buyer_whatsapp: updatedOrder.buyer_whatsapp,
          product_name: updatedOrder.product_name,
          product_id: updatedOrder.product_id,
          total_amount: Number(updatedOrder.total_amount || 0),
          status: updatedOrder.status,
          created_at: updatedOrder.created_at,
        },
      });
      ensureWhatsappAutomationLoop();
    } catch (followupError) {
      console.error("Sync WhatsApp followups on status change error:", followupError);
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      email: emailResult,
      whatsapp: whatsappResult,
      license: licenseResult,
    });
  } catch (error) {
    console.error("Admin order status route error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses status order." },
      { status: 500 }
    );
  }
}

function normalizeLicenseRegistration(value: unknown): LicenseRegistrationPayload {
  const row = isObject(value) ? value : {};
  const productEntries = Array.isArray(row.productEntries)
    ? row.productEntries
        .map((item) => {
          const productRow = isObject(item) ? item : {};
          const productName = String(productRow.productName || "").trim();
          if (!productName) {
            return null;
          }

          return {
            productName,
            expiryDate: normalizeNullableString(productRow.expiryDate),
            maxSessions: normalizeNullableNumber(productRow.maxSessions),
          };
        })
        .filter((item) => item !== null)
    : [];

  return {
    enabled: row.enabled !== false,
    role: row.role === "admin" ? "admin" : "user",
    allowedFeatures: Array.isArray(row.allowedFeatures)
      ? row.allowedFeatures
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [],
    productEntries,
  };
}

function normalizeNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeNullableNumber(value: unknown) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
