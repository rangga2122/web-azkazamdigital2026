import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { findAuthUserByEmail } from "@/lib/affiliate-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      full_name,
      email,
      password,
      whatsapp,
      payout_method,
      payout_account_number,
      payout_account,
      referral_code,
    } = body as {
      full_name?: string;
      email?: string;
      password?: string;
      whatsapp?: string | null;
      payout_method?: string | null;
      payout_account_number?: string | null;
      payout_account?: string | null;
      referral_code?: string;
    };

    if (!full_name || !email || !password || !referral_code) {
      return NextResponse.json(
        { error: "Data pendaftaran tidak lengkap." },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();

    const { data: qualifyingOrderByEmail } = await supabase
      .from("orders")
      .select("id")
      .eq("buyer_email", email)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .maybeSingle();

    let qualifyingOrderId = qualifyingOrderByEmail?.id || null;

    if (!qualifyingOrderId && whatsapp) {
      const { data: qualifyingOrderByWhatsapp } = await supabase
        .from("orders")
        .select("id")
        .eq("buyer_whatsapp", whatsapp)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .maybeSingle();

      qualifyingOrderId = qualifyingOrderByWhatsapp?.id || null;
    }

    if (!qualifyingOrderId) {
      return NextResponse.json(
        {
          error:
            "Pendaftaran afiliasi hanya untuk pelanggan yang sudah membeli dan pesanan berstatus dibayar.",
        },
        { status: 400 }
      );
    }

    const { data: existingAffiliate } = await supabase
      .from("affiliates")
      .select("id, user_id, status, referral_code")
      .eq("email", email)
      .maybeSingle();

    let userId: string | null = null;
    let createdUserId: string | null = null;
    const existingUser = await findAuthUserByEmail(supabase, email);

    if (existingUser?.id) {
      userId = existingUser.id;
      await supabase.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          ...(existingUser.user_metadata || {}),
          full_name,
          role: "affiliate",
        },
      });
    } else {
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name,
            role: "affiliate",
          },
        });

      if (authError || !authData.user?.id) {
        return NextResponse.json(
          { error: authError?.message || "User afiliasi gagal dibuat." },
          { status: 400 }
        );
      }

      userId = authData.user.id;
      createdUserId = authData.user.id;
    }

    const affiliateMutation = existingAffiliate
      ? supabase
          .from("affiliates")
          .update({
            user_id: userId,
            full_name,
            whatsapp: whatsapp || null,
            payout_method: payout_method?.trim() || null,
            payout_account_number: payout_account_number?.trim() || null,
            payout_account: payout_account?.trim() || null,
            referral_code: referral_code || existingAffiliate.referral_code,
            qualifying_order_id: qualifyingOrderId,
            status:
              existingAffiliate.status === "suspended"
                ? "suspended"
                : "approved",
            approved_at:
              existingAffiliate.status === "suspended"
                ? null
                : new Date().toISOString(),
          })
          .eq("id", existingAffiliate.id)
          .select("id")
          .single()
      : supabase
          .from("affiliates")
          .insert({
            user_id: userId,
            full_name,
            email,
            whatsapp: whatsapp || null,
            payout_method: payout_method?.trim() || null,
            payout_account_number: payout_account_number?.trim() || null,
            payout_account: payout_account?.trim() || null,
            referral_code,
            qualifying_order_id: qualifyingOrderId,
            status: "approved",
            approved_at: new Date().toISOString(),
          })
          .select("id")
          .single();

    const { data: affiliate, error } = await affiliateMutation;

    if (error) {
      if (createdUserId) {
        await supabase.auth.admin.deleteUser(createdUserId);
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (affiliate?.id) {
      await supabase.rpc("sync_affiliate_links_for_affiliate", {
        p_affiliate_id: affiliate.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Affiliate register error:", error);
    return NextResponse.json(
      { error: "Gagal memproses pendaftaran afiliasi." },
      { status: 500 }
    );
  }
}
