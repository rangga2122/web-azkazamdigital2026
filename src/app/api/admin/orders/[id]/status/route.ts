import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { sendPaidOrderEmail } from "@/lib/email";
import { ensureAffiliateAuthAccount } from "@/lib/affiliate-auth";

const VALID_ORDER_STATUSES = ["pending", "paid", "failed", "cancelled"] as const;

type OrderStatus = (typeof VALID_ORDER_STATUSES)[number];

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

    const body = (await request.json()) as { status?: string };
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
      .select("id, order_code, status, buyer_name, buyer_email, product_name, total_amount")
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
      .select("id, order_code, status, buyer_name, buyer_email, product_name, total_amount")
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

    if (existingOrder.status !== "paid" && updatedOrder.status === "paid") {
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

      const [{ data: settings }, { data: affiliate }] = await Promise.all([
        serviceSupabase
          .from("site_settings")
          .select("site_name, email")
          .limit(1)
          .single(),
        serviceSupabase
          .from("affiliates")
          .select("referral_code, user_id")
          .eq("email", updatedOrder.buyer_email)
          .maybeSingle(),
      ]);

      const origin =
        request.nextUrl.origin ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL;
      const loginUrl = new URL("/affiliate/login", origin).toString();
      const registerUrl = new URL("/affiliate/register", origin).toString();
      const dashboardUrl = new URL("/dashboard", origin).toString();

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
          accountCreatedAutomatically: authAccount.createdAutomatically,
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

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      email: emailResult,
    });
  } catch (error) {
    console.error("Admin order status route error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses status order." },
      { status: 500 }
    );
  }
}
