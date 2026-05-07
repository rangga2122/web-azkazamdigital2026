import "server-only";

import {
  ensureAffiliateAuthAccount,
  findAuthUserByEmail,
} from "@/lib/affiliate-auth";
import { DEFAULT_AFFILIATE_LOGIN_PASSWORD } from "@/lib/affiliate-password";
import {
  findMatchedCatalogProductForLicenseName,
  loadCatalogProducts,
  loadLicenseProductsWithCatalogMatches,
} from "@/lib/license-product-sync";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  LicenseCatalogProduct,
  LicenseProduct,
  LicenseUser,
} from "@/types/license-manager";

type ServiceSupabase = Awaited<ReturnType<typeof createServiceRoleClient>>;

type AuthUserLookup = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null;

type AffiliateRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  whatsapp: string | null;
  referral_code: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  approved_at: string | null;
  qualifying_order_id: string | null;
};

type OrderSeedRow = {
  id: string;
  buyer_name: string;
  buyer_whatsapp: string;
};

export type ProvisionLicenseAffiliateAccessResult = {
  email: string;
  userId: string;
  affiliateId: string;
  authCreated: boolean;
  affiliateCreated: boolean;
  defaultPassword: string | null;
  matchedProductIds: string[];
  unmatchedProductNames: string[];
};

export async function loadAffiliateCatalogProducts(
  supabase?: ServiceSupabase
) {
  const serviceSupabase = supabase || (await createServiceRoleClient());
  const { data, error } = await serviceSupabase
    .from("products")
    .select("id, title, slug, badge, is_active")
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as LicenseCatalogProduct[];
}

export async function provisionAffiliateAccessForLicensedEmail({
  email,
  licenseUsers,
  supabase,
  catalogProducts,
  licenseProducts,
  existingAuthUser,
}: {
  email: string;
  licenseUsers: LicenseUser[];
  supabase?: ServiceSupabase;
  catalogProducts?: LicenseCatalogProduct[];
  licenseProducts?: LicenseProduct[];
  existingAuthUser?: AuthUserLookup;
}): Promise<ProvisionLicenseAffiliateAccessResult | null> {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const activeLicenseUsers = licenseUsers.filter(
    (licenseUser) => String(licenseUser.email || "").trim().toLowerCase() === normalizedEmail
  );

  if (!normalizedEmail || activeLicenseUsers.length === 0) {
    return null;
  }

  const serviceSupabase = supabase || (await createServiceRoleClient());
  const authUser =
    existingAuthUser?.email?.toLowerCase() === normalizedEmail
      ? existingAuthUser
      : await findAuthUserByEmail(serviceSupabase, normalizedEmail);

  const [
    { data: existingAffiliate },
    latestPaidOrder,
    latestAnyOrder,
    resolvedCatalogProducts,
    resolvedLicenseProducts,
  ] =
    await Promise.all([
      serviceSupabase
        .from("affiliates")
        .select(
          "id, user_id, full_name, email, whatsapp, referral_code, status, approved_at, qualifying_order_id"
        )
        .eq("email", normalizedEmail)
        .maybeSingle(),
      loadLatestOrderByEmail(serviceSupabase, normalizedEmail, true),
      loadLatestOrderByEmail(serviceSupabase, normalizedEmail, false),
      catalogProducts
        ? Promise.resolve(catalogProducts)
        : loadCatalogProducts(),
      licenseProducts
        ? Promise.resolve(licenseProducts)
        : loadLicenseProductsWithCatalogMatches(),
    ]);

  const fullName = resolveAffiliateFullName(
    normalizedEmail,
    existingAffiliate,
    latestPaidOrder,
    latestAnyOrder,
    authUser
  );
  const whatsapp = resolveAffiliateWhatsapp(
    existingAffiliate,
    latestPaidOrder,
    latestAnyOrder
  );

  const authAccount = await ensureAffiliateAuthAccount({
    supabase: serviceSupabase,
    email: normalizedEmail,
    fullName,
    existingUser: authUser,
  });

  await syncUserProfile({
    supabase: serviceSupabase,
    userId: authAccount.userId,
    fullName,
    whatsapp,
  });

  const referralCode =
    existingAffiliate?.referral_code ||
    (await generateAffiliateReferralCode(serviceSupabase, fullName, normalizedEmail));
  const approvedAt =
    existingAffiliate?.status === "suspended"
      ? existingAffiliate.approved_at
      : existingAffiliate?.approved_at || new Date().toISOString();
  const affiliateStatus =
    existingAffiliate?.status === "suspended" ? "suspended" : "approved";
  const qualifyingOrderId =
    existingAffiliate?.qualifying_order_id || latestPaidOrder?.id || null;

  const affiliatePayload = {
    user_id: authAccount.userId,
    full_name: fullName,
    email: normalizedEmail,
    whatsapp,
    referral_code: referralCode,
    status: affiliateStatus,
    approved_at: approvedAt,
    qualifying_order_id: qualifyingOrderId,
  };

  const affiliateResult = existingAffiliate?.id
    ? await serviceSupabase
        .from("affiliates")
        .update(affiliatePayload)
        .eq("id", existingAffiliate.id)
        .select("id, user_id, full_name, email, whatsapp, referral_code, status, approved_at, qualifying_order_id")
        .single()
    : await serviceSupabase
        .from("affiliates")
        .insert(affiliatePayload)
        .select("id, user_id, full_name, email, whatsapp, referral_code, status, approved_at, qualifying_order_id")
        .single();

  if (affiliateResult.error || !affiliateResult.data) {
    throw new Error(
      affiliateResult.error?.message || "Gagal menyimpan akun afiliasi lisensi."
    );
  }

  const matchedProducts = activeLicenseUsers
    .map((licenseUser) =>
      findMatchedCatalogProductForLicenseName(
        licenseUser.product_name,
        resolvedLicenseProducts,
        resolvedCatalogProducts
      )
    )
    .filter((product): product is LicenseCatalogProduct => Boolean(product));

  const matchedProductMap = new Map(
    matchedProducts.map((product) => [product.id, product])
  );
  const matchedProductIds = Array.from(matchedProductMap.keys());
  const unmatchedProductNames = Array.from(
    new Set(
      activeLicenseUsers
        .filter(
          (licenseUser) =>
            !findMatchedCatalogProductForLicenseName(
              licenseUser.product_name,
              resolvedLicenseProducts,
              resolvedCatalogProducts
            )
        )
        .map((licenseUser) => String(licenseUser.product_name || "").trim())
        .filter(Boolean)
    )
  );

  if (matchedProductIds.length > 0) {
    await syncLicensedAffiliateLinks({
      supabase: serviceSupabase,
      affiliateId: affiliateResult.data.id,
      referralCode,
      products: Array.from(matchedProductMap.values()),
    });
  }

  return {
    email: normalizedEmail,
    userId: authAccount.userId,
    affiliateId: affiliateResult.data.id,
    authCreated: authAccount.createdAutomatically,
    affiliateCreated: !existingAffiliate?.id,
    defaultPassword: authAccount.createdAutomatically
      ? DEFAULT_AFFILIATE_LOGIN_PASSWORD
      : null,
    matchedProductIds,
    unmatchedProductNames,
  };
}

async function loadLatestOrderByEmail(
  supabase: ServiceSupabase,
  email: string,
  paidOnly: boolean
) {
  const query = supabase
    .from("orders")
    .select("id, buyer_name, buyer_whatsapp")
    .eq("buyer_email", email)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data, error } = paidOnly ? await query.eq("status", "paid").maybeSingle() : await query.maybeSingle();

  if (error) {
    throw error;
  }

  return (data || null) as OrderSeedRow | null;
}

async function syncUserProfile({
  supabase,
  userId,
  fullName,
  whatsapp,
}: {
  supabase: ServiceSupabase;
  userId: string;
  fullName: string;
  whatsapp: string | null;
}) {
  const { data: existingProfile, error: profileError } = await supabase
    .from("users_profiles")
    .select("id, role, full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!existingProfile?.id) {
    const { error } = await supabase.from("users_profiles").insert({
      id: userId,
      full_name: fullName || null,
      phone: whatsapp,
      role: "affiliate",
    });

    if (error) {
      throw error;
    }

    return;
  }

  const nextProfilePatch: Record<string, unknown> = {};
  if (!existingProfile.full_name && fullName) {
    nextProfilePatch.full_name = fullName;
  }
  if (!existingProfile.phone && whatsapp) {
    nextProfilePatch.phone = whatsapp;
  }

  if (Object.keys(nextProfilePatch).length === 0) {
    return;
  }

  const { error } = await supabase
    .from("users_profiles")
    .update(nextProfilePatch)
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

async function generateAffiliateReferralCode(
  supabase: ServiceSupabase,
  fullName: string,
  email: string
) {
  const { data, error } = await supabase.rpc("generate_affiliate_referral_code", {
    p_name: fullName,
    p_email: email,
  });

  if (error || !data) {
    throw new Error(error?.message || "Kode referral afiliasi gagal dibuat.");
  }

  return String(data);
}

async function syncLicensedAffiliateLinks({
  supabase,
  affiliateId,
  referralCode,
  products,
}: {
  supabase: ServiceSupabase;
  affiliateId: string;
  referralCode: string;
  products: LicenseCatalogProduct[];
}) {
  const productIds = products.map((product) => product.id);
  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("affiliate_links")
    .select("id, product_id, referral_code, target_url")
    .eq("affiliate_id", affiliateId)
    .in("product_id", productIds);

  if (existingLinksError) {
    throw existingLinksError;
  }

  const existingLinksByProductId = new Map(
    (existingLinks || [])
      .filter((link) => Boolean(link.product_id))
      .map((link) => [String(link.product_id), link])
  );

  for (const product of products) {
    const targetUrl = `/produk/${product.slug}?ref=${referralCode}`;
    const existingLink = existingLinksByProductId.get(product.id);

    if (existingLink?.id) {
      if (
        existingLink.referral_code === referralCode &&
        existingLink.target_url === targetUrl
      ) {
        continue;
      }

      const { error } = await supabase
        .from("affiliate_links")
        .update({
          referral_code: referralCode,
          target_url: targetUrl,
        })
        .eq("id", existingLink.id);

      if (error) {
        throw error;
      }

      continue;
    }

    const { error } = await supabase.from("affiliate_links").insert({
      affiliate_id: affiliateId,
      product_id: product.id,
      referral_code: referralCode,
      target_url: targetUrl,
      clicks_count: 0,
      conversions_count: 0,
    });

    if (error) {
      throw error;
    }
  }
}

function resolveAffiliateFullName(
  email: string,
  existingAffiliate: AffiliateRow | null,
  latestPaidOrder: OrderSeedRow | null,
  latestAnyOrder: OrderSeedRow | null,
  authUser: AuthUserLookup
) {
  const authFullName =
    typeof authUser?.user_metadata?.full_name === "string"
      ? authUser.user_metadata.full_name.trim()
      : "";
  const candidate =
    existingAffiliate?.full_name?.trim() ||
    latestPaidOrder?.buyer_name?.trim() ||
    latestAnyOrder?.buyer_name?.trim() ||
    authFullName;

  if (candidate) {
    return candidate;
  }

  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Member Affiliate";
}

function resolveAffiliateWhatsapp(
  existingAffiliate: AffiliateRow | null,
  latestPaidOrder: OrderSeedRow | null,
  latestAnyOrder: OrderSeedRow | null
) {
  return (
    existingAffiliate?.whatsapp?.trim() ||
    latestPaidOrder?.buyer_whatsapp?.trim() ||
    latestAnyOrder?.buyer_whatsapp?.trim() ||
    null
  );
}
