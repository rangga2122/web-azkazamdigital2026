import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referral_code, product_slug, landing_path } = body;

    if (!referral_code) {
      return NextResponse.json({ error: "Missing referral code" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    let productId = null;
    if (product_slug) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("slug", product_slug)
        .single();
      if (product) productId = product.id;
    }

    const { data: link } = await supabase
      .from("affiliate_links")
      .select("id, affiliate_id, clicks_count, affiliate:affiliates!affiliate_links_affiliate_id_fkey(status)")
      .eq("referral_code", referral_code)
      .eq("product_id", productId)
      .maybeSingle();

    const affiliate = Array.isArray(link?.affiliate)
      ? link.affiliate[0]
      : link?.affiliate;

    if (!link?.affiliate_id || affiliate?.status !== "approved") {
      return NextResponse.json({ error: "Invalid referral link" }, { status: 404 });
    }

    await supabase.from("affiliate_clicks").insert({
      affiliate_id: link.affiliate_id,
      product_id: productId,
      referral_code: referral_code,
      landing_path: landing_path || null,
      ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
      user_agent: request.headers.get("user-agent") || null,
    });

    if (link) {
      await supabase
        .from("affiliate_links")
        .update({ clicks_count: (link.clicks_count || 0) + 1 })
        .eq("id", link.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Track click error:", error);
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }
}
