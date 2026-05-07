import { createServiceRoleClient } from "@/lib/supabase/server";
import { createLicenseManagerClient } from "@/lib/license-client";
import type {
  LicenseCatalogProduct,
  LicenseProduct,
  LicenseProductCatalogSync,
  LicenseUser,
} from "@/types/license-manager";

type SyncCatalogProduct = {
  id: string;
  title: string;
  slug: string;
  badge?: string | null;
  is_active?: boolean;
};

export function enrichLicenseProductsWithCatalogMatches(
  licenseProducts: LicenseProduct[],
  catalogProducts: SyncCatalogProduct[],
  syncRows: LicenseProductCatalogSync[]
) {
  const syncMap = new Map(
    syncRows.map((row) => [row.license_product_id, row.catalog_product_id || null])
  );
  const catalogMap = new Map(
    catalogProducts.map((product) => [product.id, product])
  );

  return licenseProducts.map((product) => {
    const matchedCatalogProductId = syncMap.get(product.id) || null;
    const matched = matchedCatalogProductId
      ? catalogMap.get(matchedCatalogProductId) || null
      : null;

    return {
      ...product,
      matched_catalog_product_id: matched?.id || null,
      matched_catalog_product_title: matched?.title || null,
      matched_catalog_product_slug: matched?.slug || null,
    };
  });
}

export function resolveLicensedCatalogProductIdsFromMappings(
  licenseUsers: LicenseUser[],
  licenseProducts: LicenseProduct[]
) {
  const productMap = new Map(
    licenseProducts.map((product) => [normalizeLicenseProductName(product.name), product])
  );
  const ids = new Set<string>();

  for (const user of licenseUsers) {
    const matchedCatalogProductId =
      productMap.get(normalizeLicenseProductName(user.product_name))
        ?.matched_catalog_product_id || null;
    if (matchedCatalogProductId) {
      ids.add(matchedCatalogProductId);
    }
  }

  return Array.from(ids);
}

export function findMatchedCatalogProductForLicenseName(
  licenseName: string | null | undefined,
  licenseProducts: LicenseProduct[],
  catalogProducts: SyncCatalogProduct[]
) {
  const normalizedName = normalizeLicenseProductName(licenseName);
  if (!normalizedName) return null;

  const matchedCatalogProductId =
    licenseProducts.find(
      (product) => normalizeLicenseProductName(product.name) === normalizedName
    )?.matched_catalog_product_id || null;

  if (!matchedCatalogProductId) {
    return null;
  }

  return (
    catalogProducts.find((product) => product.id === matchedCatalogProductId) || null
  );
}

export async function loadCatalogProducts() {
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, title, slug, badge, is_active")
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as LicenseCatalogProduct[];
}

export async function loadLicenseProductCatalogSyncs() {
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase
    .from("license_product_catalog_syncs")
    .select("license_product_id, catalog_product_id");

  if (error) {
    throw error;
  }

  return (data || []) as LicenseProductCatalogSync[];
}

export async function upsertLicenseProductCatalogSync(input: {
  licenseProductId: number;
  licenseProductName: string;
  catalogProductId?: string | null;
}) {
  const supabase = await createServiceRoleClient();
  const normalizedCatalogProductId = String(input.catalogProductId || "").trim() || null;

  if (!normalizedCatalogProductId) {
    const { error } = await supabase
      .from("license_product_catalog_syncs")
      .delete()
      .eq("license_product_id", input.licenseProductId);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("license_product_catalog_syncs")
    .upsert(
      {
        license_product_id: input.licenseProductId,
        license_product_name: input.licenseProductName,
        catalog_product_id: normalizedCatalogProductId,
      },
      {
        onConflict: "license_product_id",
      }
    );

  if (error) {
    throw error;
  }
}

export async function loadLicenseProductsWithCatalogMatches() {
  const client = createLicenseManagerClient();
  if (!client) {
    return [] as LicenseProduct[];
  }

  const [{ data: licenseProducts, error: licenseProductsError }, catalogProducts, syncRows] =
    await Promise.all([
      client.from("products").select("*").order("created_at", { ascending: false }),
      loadCatalogProducts(),
      loadLicenseProductCatalogSyncs(),
    ]);

  if (licenseProductsError) {
    throw licenseProductsError;
  }

  return enrichLicenseProductsWithCatalogMatches(
    (licenseProducts || []) as LicenseProduct[],
    catalogProducts,
    syncRows
  );
}

function normalizeLicenseProductName(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}
