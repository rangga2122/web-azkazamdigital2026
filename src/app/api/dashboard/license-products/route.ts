import { NextResponse } from "next/server";
import { resolveLicensedCatalogProductIds } from "@/lib/license-product-sync";
import { loadActiveLicenseUsersByEmail } from "@/lib/license-manager";
import { createServiceRoleClient, createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = await createServiceRoleClient();
    const normalizedEmail = user.email.trim().toLowerCase();

    const [{ data: userOrders }, { data: emailOrders }, licenseUsers] = await Promise.all([
      serviceSupabase
        .from("orders")
        .select("product_id")
        .eq("status", "paid")
        .eq("user_id", user.id),
      serviceSupabase
        .from("orders")
        .select("product_id")
        .eq("status", "paid")
        .ilike("buyer_email", normalizedEmail),
      loadActiveLicenseUsersByEmail(normalizedEmail),
    ]);

    const purchasedProductIds = Array.from(
      new Set(
        [...(userOrders || []), ...(emailOrders || [])]
          .map((order) => order.product_id)
          .filter(Boolean)
      )
    ) as string[];

    if (purchasedProductIds.length === 0 || licenseUsers.length === 0) {
      return NextResponse.json({
        success: true,
        data: { licensedProductIds: [] as string[] },
      });
    }

    const { data: catalogProducts, error: catalogError } = await serviceSupabase
      .from("products")
      .select("id, title, slug, badge, is_active")
      .in("id", purchasedProductIds);

    if (catalogError) {
      throw catalogError;
    }

    const licensedProductIds = resolveLicensedCatalogProductIds(
      licenseUsers,
      (catalogProducts || []) as Array<{
        id: string;
        title: string;
        slug: string;
        badge: string | null;
        is_active: boolean;
      }>
    );

    return NextResponse.json({
      success: true,
      data: { licensedProductIds },
    });
  } catch (error) {
    console.error("Dashboard license products error:", error);
    return NextResponse.json(
      { error: "Gagal memuat sinkronisasi lisensi." },
      { status: 500 }
    );
  }
}
