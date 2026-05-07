import { NextResponse } from "next/server";
import { provisionAffiliateAccessForLicensedEmail } from "@/lib/license-affiliate-access";
import {
  loadCatalogProducts,
  loadLicenseProductsWithCatalogMatches,
  resolveLicensedCatalogProductIdsFromMappings,
} from "@/lib/license-product-sync";
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

    const licenseUsers = await loadActiveLicenseUsersByEmail(normalizedEmail);

    if (licenseUsers.length === 0) {
      return NextResponse.json({
        success: true,
        data: { licensedProductIds: [] as string[] },
      });
    }

    const [catalogProducts, licenseProducts] = await Promise.all([
      loadCatalogProducts(),
      loadLicenseProductsWithCatalogMatches(),
    ]);

    await provisionAffiliateAccessForLicensedEmail({
      email: normalizedEmail,
      licenseUsers,
      supabase: serviceSupabase,
      catalogProducts,
      licenseProducts,
    });

    const licensedProductIds = resolveLicensedCatalogProductIdsFromMappings(
      licenseUsers,
      licenseProducts
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
