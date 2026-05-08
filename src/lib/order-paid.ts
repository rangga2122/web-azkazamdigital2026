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
import type { LicenseProvisionResultStatus } from "@/types/license-manager";

type ServiceSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createServiceRoleClient>
>;

type PaidTransitionOrder = {
  id: string;
  order_code: string;
  status: string;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  product_name: string;
  product_id: string | null;
  subtotal: number | null;
  unique_code: number | null;
  total_amount: number | null;
  gateway_total_payment: number | null;
  created_at: string;
};

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

type PaidTransitionResult = {
  email: { messageId?: string; skipped?: boolean; error?: string };
  whatsapp: { customerSent?: boolean; skipped?: boolean; error?: string };
  license: {
    skipped?: boolean;
    created?: number;
    extended?: number;
    reactivated?: number;
    failed?: number;
    error?: string;
  };
};

export async function processOrderPaidTransition(input: {
  serviceSupabase: ServiceSupabase;
  origin: string;
  previousStatus: string;
  updatedOrder: PaidTransitionOrder;
  licenseRegistration?: LicenseRegistrationPayload | null;
}) : Promise<PaidTransitionResult> {
  let emailResult: { messageId?: string; skipped?: boolean; error?: string } = {
    skipped: true,
  };
  let whatsappResult: { customerSent?: boolean; skipped?: boolean; error?: string } = {
    skipped: true,
  };
  let licenseResult: {
    skipped?: boolean;
    created?: number;
    extended?: number;
    reactivated?: number;
    failed?: number;
    error?: string;
  } = {
    skipped: true,
  };
  let paidAccessEmailMessage: string | null = null;
  let paidAccessWhatsappMessage: string | null = null;
  let paidAccessEmailSubject: string | null = null;

  const [{ data: settings }, { data: affiliate }, { data: product }] = await Promise.all([
    input.serviceSupabase
      .from("site_settings")
      .select("site_name, email, whatsapp_number, social_links")
      .limit(1)
      .single(),
    input.serviceSupabase
      .from("affiliates")
      .select("referral_code, user_id")
      .eq("email", input.updatedOrder.buyer_email)
      .maybeSingle(),
    input.updatedOrder.product_id
      ? input.serviceSupabase
          .from("products")
          .select("id, title, slug, thumbnail_url, digital_file_url, demo_url, purchase_url")
          .eq("id", input.updatedOrder.product_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const loginUrl = new URL("/affiliate/login", input.origin).toString();
  const registerUrl = new URL("/affiliate/register", input.origin).toString();
  const dashboardUrl = new URL("/dashboard", input.origin).toString();
  const whatsappConfig = getWhatsappNotificationConfig(
    settings?.social_links as Record<string, unknown> | null,
    settings?.whatsapp_number || null
  );

  if (input.previousStatus !== "paid" && input.updatedOrder.status === "paid") {
    const licenseRegistration = input.licenseRegistration;

    if (licenseRegistration?.enabled && licenseRegistration.productEntries.length > 0) {
      try {
        const licenseData = await addLicenseUsers({
          email: input.updatedOrder.buyer_email,
          role: licenseRegistration.role,
          allowedFeatures: licenseRegistration.allowedFeatures,
          productEntries: licenseRegistration.productEntries,
        });
        const results = licenseData.results || [];
        licenseResult = {
          skipped: false,
          created: countLicenseStatuses(results, "success"),
          extended: countLicenseStatuses(results, "extended"),
          reactivated: countLicenseStatuses(results, "reactivated"),
          failed: countLicenseStatuses(results, "error"),
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
        supabase: input.serviceSupabase,
        email: input.updatedOrder.buyer_email,
        fullName: input.updatedOrder.buyer_name,
      });
    } catch (error) {
      console.error("Auto create affiliate auth account error:", error);
    }

    const accessEntry = resolvePaidAccessEntry(whatsappConfig, {
      id: input.updatedOrder.product_id,
      title: product?.title || input.updatedOrder.product_name,
    });
    const accessContext = {
      customerName: input.updatedOrder.buyer_name,
      customerEmail: input.updatedOrder.buyer_email,
      customerPhone: input.updatedOrder.buyer_whatsapp,
      productName: product?.title || input.updatedOrder.product_name,
      siteTitle: settings?.site_name || "AzkazamDigital",
      orderCode: input.updatedOrder.order_code,
      orderTotal: new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(
        Number(
          input.updatedOrder.gateway_total_payment || input.updatedOrder.total_amount || 0
        )
      ),
      invoiceUrl: new URL(`/thank-you/${input.updatedOrder.order_code}`, input.origin).toString(),
      loginEmail: input.updatedOrder.buyer_email,
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
        buyerName: input.updatedOrder.buyer_name,
        buyerEmail: input.updatedOrder.buyer_email,
        productName: input.updatedOrder.product_name,
        totalAmount: Number(
          input.updatedOrder.gateway_total_payment || input.updatedOrder.total_amount || 0
        ),
        orderCode: input.updatedOrder.order_code,
        siteName: settings?.site_name || "AzkazamDigital",
        supportEmail: settings?.email || null,
        loginUrl,
        registerUrl,
        dashboardUrl,
        invoiceUrl: new URL(`/thank-you/${input.updatedOrder.order_code}`, input.origin).toString(),
        affiliateCode: affiliate?.referral_code || null,
        loginEmail: input.updatedOrder.buyer_email,
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
        id: input.updatedOrder.id,
        orderCode: input.updatedOrder.order_code,
        buyerName: input.updatedOrder.buyer_name,
        buyerEmail: input.updatedOrder.buyer_email,
        buyerWhatsapp: input.updatedOrder.buyer_whatsapp,
        productName: input.updatedOrder.product_name,
        totalAmount: Number(
          input.updatedOrder.gateway_total_payment || input.updatedOrder.total_amount || 0
        ),
        status: input.updatedOrder.status,
        previousStatus: input.previousStatus,
        createdAt: input.updatedOrder.created_at,
        siteName: settings?.site_name || "AzkazamDigital",
        origin: input.origin,
        productImageUrl: product?.thumbnail_url || null,
      }),
      origin: input.origin,
      accessMessage:
        input.updatedOrder.status === "paid" ? paidAccessWhatsappMessage : null,
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
      supabase: input.serviceSupabase,
      order: {
        id: input.updatedOrder.id,
        order_code: input.updatedOrder.order_code,
        buyer_name: input.updatedOrder.buyer_name,
        buyer_email: input.updatedOrder.buyer_email,
        buyer_whatsapp: input.updatedOrder.buyer_whatsapp,
        product_name: input.updatedOrder.product_name,
        product_id: input.updatedOrder.product_id,
        total_amount: Number(
          input.updatedOrder.gateway_total_payment || input.updatedOrder.total_amount || 0
        ),
        status: input.updatedOrder.status,
        created_at: input.updatedOrder.created_at,
      },
    });
    ensureWhatsappAutomationLoop();
  } catch (followupError) {
    console.error("Sync WhatsApp followups on status change error:", followupError);
  }

  return {
    email: emailResult,
    whatsapp: whatsappResult,
    license: licenseResult,
  };
}

function countLicenseStatuses(
  results: Array<{ status: LicenseProvisionResultStatus }>,
  status: LicenseProvisionResultStatus
) {
  return results.filter((item) => item.status === status).length;
}
