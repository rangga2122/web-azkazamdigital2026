import type { LicenseProduct, LicenseUser } from "@/types/license-manager";

type SyncCatalogProduct = {
  id: string;
  title: string;
  slug: string;
  badge?: string | null;
  is_active?: boolean;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactText(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, "");
}

function getWordTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function getProductSyncKeyword(product: Pick<SyncCatalogProduct, "slug" | "title">) {
  const slugCompact = compactText(product.slug);
  if (slugCompact) return slugCompact;
  return compactText(product.title);
}

function scoreCandidateMatch(
  licenseName: string,
  product: SyncCatalogProduct
) {
  const licenseNorm = normalizeText(licenseName);
  const licenseCompact = compactText(licenseName);
  const slugNorm = normalizeText(product.slug);
  const slugCompact = compactText(product.slug);
  const titleNorm = normalizeText(product.title);
  const titleCompact = compactText(product.title);
  const badgeNorm = normalizeText(product.badge);
  const badgeCompact = compactText(product.badge);

  const directAliases = [
    slugNorm,
    slugCompact,
    titleNorm,
    titleCompact,
    badgeNorm,
    badgeCompact,
  ].filter(Boolean);

  if (directAliases.includes(licenseNorm)) return 120;
  if (directAliases.includes(licenseCompact)) return 115;

  const compactAliases = [slugCompact, titleCompact, badgeCompact].filter(Boolean);
  for (const alias of compactAliases) {
    if (alias.length >= 4 && licenseCompact.includes(alias)) return 100;
    if (licenseCompact.length >= 4 && alias.includes(licenseCompact)) return 96;
  }

  const licenseTokens = new Set(getWordTokens(licenseName));
  const titleTokens = getWordTokens(product.title);
  const slugTokens = getWordTokens(product.slug);
  const badgeTokens = getWordTokens(product.badge);
  const tokenGroups = [titleTokens, slugTokens, badgeTokens].filter(
    (group) => group.length > 0
  );

  let bestTokenScore = 0;
  for (const group of tokenGroups) {
    const allMatch = group.every((token) => licenseTokens.has(token));
    if (allMatch) {
      bestTokenScore = Math.max(bestTokenScore, 80 + group.length);
    }
  }

  return bestTokenScore;
}

export function findCatalogProductForLicenseName(
  licenseName: string | null | undefined,
  products: SyncCatalogProduct[]
) {
  const name = String(licenseName || "").trim();
  if (!name) return null;

  const ranked = products
    .map((product) => ({
      product,
      score: scoreCandidateMatch(name, product),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.product || null;
}

export function enrichLicenseProductsWithCatalogMatches(
  licenseProducts: LicenseProduct[],
  catalogProducts: SyncCatalogProduct[]
) {
  return licenseProducts.map((product) => {
    const matched = findCatalogProductForLicenseName(product.name, catalogProducts);
    return {
      ...product,
      matched_catalog_product_id: matched?.id || null,
      matched_catalog_product_title: matched?.title || null,
      matched_catalog_product_slug: matched?.slug || null,
      sync_keyword: matched ? getProductSyncKeyword(matched) : compactText(product.name),
    };
  });
}

export function resolveLicensedCatalogProductIds(
  licenseUsers: LicenseUser[],
  catalogProducts: SyncCatalogProduct[]
) {
  const ids = new Set<string>();

  for (const user of licenseUsers) {
    const matched = findCatalogProductForLicenseName(user.product_name, catalogProducts);
    if (matched?.id) {
      ids.add(matched.id);
    }
  }

  return Array.from(ids);
}
