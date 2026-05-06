import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET() {
  try {
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: affiliate } = await sessionSupabase
      .from("affiliates")
      .select("id")
      .maybeSingle();

    if (!affiliate?.id) {
      return NextResponse.json({
        success: true,
        data: { orders: [] as Array<Record<string, unknown>> },
      });
    }

    const serviceSupabase = await createServiceRoleClient();
    const { data: orders, error } = await serviceSupabase
      .from("orders")
      .select(
        "id, order_code, buyer_name, product_name, total_amount, status, created_at"
      )
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: {
        orders: orders || [],
      },
    });
  } catch (error) {
    console.error("Dashboard affiliate orders error:", error);
    return NextResponse.json(
      { error: "Gagal memuat riwayat transaksi affiliate." },
      { status: 500 }
    );
  }
}
