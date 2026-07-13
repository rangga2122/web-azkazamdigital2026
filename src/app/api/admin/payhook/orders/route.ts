import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
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

    const serviceSupabase = await createServiceRoleClient();

    // Fetch orders paid via PayHook (last 50)
    const { data: orders, error } = await serviceSupabase
      .from("orders")
      .select(
        "id, order_code, buyer_name, buyer_email, buyer_whatsapp, product_name, total_amount, unique_code, status, payment_provider, payment_method, gateway_completed_at, created_at"
      )
      .eq("payment_provider", "payhook")
      .order("gateway_completed_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orders: orders || [],
      total: orders?.length || 0,
    });
  } catch (error) {
    console.error("Admin payhook orders error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}
