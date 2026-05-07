import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_AFFILIATE_LOGIN_PASSWORD } from "../src/lib/affiliate-password";
import { loadLicenseProductsWithCatalogMatches } from "../src/lib/license-product-sync";
import type { LicenseCatalogProduct, LicenseProduct, LicenseUser } from "../src/types/license-manager";

type MainSupabase = ReturnType<typeof createMainSupabaseClient>;
type LicenseSupabase = ReturnType<typeof createLicenseSupabaseClient>;

type AuthUserRow = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
};

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

async function main() {
  loadEnvConfig(process.cwd());

  const mainSupabase = createMainSupabaseClient();
  const licenseSupabase = createLicenseSupabaseClient();
  const [groupedLicenseUsers, catalogProducts, licenseProducts, authUsersByEmail] = await Promise.all([
    loadAllActiveLicenseUsersGroupedByEmail(licenseSupabase),
    loadAffiliateCatalogProducts(mainSupabase),
    loadLicenseProductsWithCatalogMatches(),
    loadAuthUsersByEmail(mainSupabase),
  ]);

  const emails = Array.from(groupedLicenseUsers.keys()).sort((left, right) =>
    left.localeCompare(right)
  );
  const summary = {
    totalEmails: emails.length,
    processed: 0,
    authCreated: 0,
    affiliateCreated: 0,
    matchedProducts: 0,
    unmatchedProducts: 0,
    failed: 0,
  };
  const failures: Array<{ email: string; error: string }> = [];

  for (const email of emails) {
    const licenseUsers = groupedLicenseUsers.get(email) || [];

    try {
      const result = await provisionAffiliateAccessForLicensedEmail({
        mainSupabase,
        email,
        licenseUsers,
        catalogProducts,
        licenseProducts,
        existingAuthUser: authUsersByEmail.get(email) || null,
      });

      if (!result) {
        continue;
      }

      summary.processed += 1;
      summary.authCreated += result.authCreated ? 1 : 0;
      summary.affiliateCreated += result.affiliateCreated ? 1 : 0;
      summary.matchedProducts += result.matchedProductIds.length;
      summary.unmatchedProducts += result.unmatchedProductNames.length;

      if (result.authCreated) {
        authUsersByEmail.set(email, {
          id: result.userId,
          email,
          user_metadata: {
            full_name: result.fullName,
            role: "affiliate",
          },
        });
      }

      console.log(
        `[OK] ${email} | auth:${result.authCreated ? "baru" : "ada"} | affiliate:${
          result.affiliateCreated ? "baru" : "update"
        } | produk:${result.matchedProductIds.length} | unmatched:${
          result.unmatchedProductNames.length
        }`
      );
    } catch (error) {
      summary.failed += 1;
      const message =
        error instanceof Error ? error.message : "Unknown backfill failure.";
      failures.push({ email, error: message });
      console.error(`[FAIL] ${email} | ${message}`);
    }
  }

  console.log("");
  console.log("Backfill selesai.");
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    console.log("");
    console.log("Daftar gagal:");
    for (const failure of failures) {
      console.log(`- ${failure.email}: ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

function createMainSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error("SUPABASE main production belum terkonfigurasi di environment.");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createLicenseSupabaseClient() {
  const config = resolveLicenseConfig();
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function resolveLicenseConfig() {
  const envUrl = process.env.LICENSE_SUPABASE_URL?.trim() || "";
  const envKey = process.env.LICENSE_SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (envUrl && envKey) {
    return { url: envUrl, serviceKey: envKey };
  }

  const htmlPath = path.resolve(process.cwd(), "..", "lisensi.html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error("Konfigurasi database lisensi tidak ditemukan.");
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const url = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1] || "";
  const serviceKey = html.match(/const SERVICE_KEY = '([^']+)'/)?.[1] || "";

  if (!url || !serviceKey) {
    throw new Error("Konfigurasi database lisensi tidak lengkap.");
  }

  return { url, serviceKey };
}

async function loadAllActiveLicenseUsersGroupedByEmail(supabase: LicenseSupabase) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const grouped = new Map<string, LicenseUser[]>();
  for (const user of ((data || []) as LicenseUser[]).filter(isCurrentlyActiveLicenseUser)) {
    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    if (!normalizedEmail) continue;

    const currentRows = grouped.get(normalizedEmail) || [];
    currentRows.push(user);
    grouped.set(normalizedEmail, currentRows);
  }

  return grouped;
}

async function loadAffiliateCatalogProducts(supabase: MainSupabase) {
  const { data, error } = await supabase
    .from("products")
    .select("id, title, slug, badge, is_active")
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as LicenseCatalogProduct[];
}

async function loadAuthUsersByEmail(supabase: MainSupabase) {
  const usersByEmail = new Map<string, AuthUserRow>();
  let page = 1;

  while (page <= 100) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    for (const user of data.users) {
      const normalizedEmail = String(user.email || "").trim().toLowerCase();
      if (!normalizedEmail) continue;

      usersByEmail.set(normalizedEmail, {
        id: user.id,
        email: user.email,
        user_metadata:
          user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null,
      });
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return usersByEmail;
}

async function provisionAffiliateAccessForLicensedEmail({
  mainSupabase,
  email,
  licenseUsers,
  catalogProducts,
  licenseProducts,
  existingAuthUser,
}: {
  mainSupabase: MainSupabase;
  email: string;
  licenseUsers: LicenseUser[];
  catalogProducts: LicenseCatalogProduct[];
  licenseProducts: LicenseProduct[];
  existingAuthUser: AuthUserRow | null;
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const activeLicenseUsers = licenseUsers.filter(
    (licenseUser) => String(licenseUser.email || "").trim().toLowerCase() === normalizedEmail
  );

  if (!normalizedEmail || activeLicenseUsers.length === 0) {
    return null;
  }

  const [{ data: existingAffiliate }, latestPaidOrder, latestAnyOrder] = await Promise.all([
    mainSupabase
      .from("affiliates")
      .select(
        "id, user_id, full_name, email, whatsapp, referral_code, status, approved_at, qualifying_order_id"
      )
      .eq("email", normalizedEmail)
      .maybeSingle(),
    loadLatestOrderByEmail(mainSupabase, normalizedEmail, true),
    loadLatestOrderByEmail(mainSupabase, normalizedEmail, false),
  ]);

  const fullName = resolveAffiliateFullName(
    normalizedEmail,
    (existingAffiliate || null) as AffiliateRow | null,
    latestPaidOrder,
    latestAnyOrder,
    existingAuthUser
  );
  const whatsapp = resolveAffiliateWhatsapp(
    (existingAffiliate || null) as AffiliateRow | null,
    latestPaidOrder,
    latestAnyOrder
  );

  const authAccount = await ensureAffiliateAuthAccount({
    supabase: mainSupabase,
    email: normalizedEmail,
    fullName,
    existingUser: existingAuthUser,
  });

  await syncUserProfile({
    supabase: mainSupabase,
    userId: authAccount.userId,
    fullName,
    whatsapp,
  });

  const existingAffiliateRow = (existingAffiliate || null) as AffiliateRow | null;
  const referralCode =
    existingAffiliateRow?.referral_code ||
    (await generateAffiliateReferralCode(mainSupabase, fullName, normalizedEmail));
  const affiliateStatus =
    existingAffiliateRow?.status === "suspended" ? "suspended" : "approved";
  const approvedAt =
    existingAffiliateRow?.status === "suspended"
      ? existingAffiliateRow.approved_at
      : existingAffiliateRow?.approved_at || new Date().toISOString();
  const qualifyingOrderId =
    existingAffiliateRow?.qualifying_order_id || latestPaidOrder?.id || null;

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

  const affiliateResult = existingAffiliateRow?.id
    ? await mainSupabase
        .from("affiliates")
        .update(affiliatePayload)
        .eq("id", existingAffiliateRow.id)
        .select("id")
        .single()
    : await mainSupabase
        .from("affiliates")
        .insert(affiliatePayload)
        .select("id")
        .single();

  if (affiliateResult.error || !affiliateResult.data?.id) {
    throw new Error(
      affiliateResult.error?.message || "Gagal menyimpan akun afiliasi lisensi."
    );
  }

  const matchedProducts = activeLicenseUsers
    .map((licenseUser) =>
      catalogProducts.find(
        (catalogProduct) =>
          catalogProduct.id ===
          licenseProducts.find(
            (licenseProduct) =>
              String(licenseProduct.name || "").trim().toLowerCase() ===
              String(licenseUser.product_name || "").trim().toLowerCase()
          )?.matched_catalog_product_id
      ) || null
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
            !licenseProducts.find(
              (licenseProduct) =>
                String(licenseProduct.name || "").trim().toLowerCase() ===
                  String(licenseUser.product_name || "").trim().toLowerCase() &&
                Boolean(licenseProduct.matched_catalog_product_id)
            )
        )
        .map((licenseUser) => String(licenseUser.product_name || "").trim())
        .filter(Boolean)
    )
  );

  if (matchedProductIds.length > 0) {
    await syncLicensedAffiliateLinks({
      supabase: mainSupabase,
      affiliateId: affiliateResult.data.id,
      referralCode,
      products: Array.from(matchedProductMap.values()),
    });
  }

  return {
    userId: authAccount.userId,
    fullName,
    authCreated: authAccount.createdAutomatically,
    affiliateCreated: !existingAffiliateRow?.id,
    matchedProductIds,
    unmatchedProductNames,
  };
}

async function ensureAffiliateAuthAccount({
  supabase,
  email,
  fullName,
  existingUser,
}: {
  supabase: MainSupabase;
  email: string;
  fullName: string;
  existingUser: AuthUserRow | null;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const resolvedExistingUser =
    existingUser?.email?.toLowerCase() === normalizedEmail
      ? existingUser
      : await findAuthUserByEmail(supabase, normalizedEmail);

  let userId = resolvedExistingUser?.id || null;
  let createdAutomatically = false;

  if (!userId) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: DEFAULT_AFFILIATE_LOGIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "affiliate",
      },
    });

    if (authError || !authData.user?.id) {
      throw new Error(authError?.message || "Akun login affiliate gagal dibuat.");
    }

    userId = authData.user.id;
    createdAutomatically = true;
  } else {
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(resolvedExistingUser?.user_metadata || {}),
        full_name: fullName,
        role: "affiliate",
      },
    });
  }

  return {
    userId,
    createdAutomatically,
  };
}

async function findAuthUserByEmail(supabase: MainSupabase, email: string) {
  let page = 1;

  while (page <= 100) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) return null;

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase()
    );

    if (user) {
      return {
        id: user.id,
        email: user.email,
        user_metadata:
          user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null,
      };
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }

  return null;
}

async function loadLatestOrderByEmail(
  supabase: MainSupabase,
  email: string,
  paidOnly: boolean
) {
  let query = supabase
    .from("orders")
    .select("id, buyer_name, buyer_whatsapp")
    .eq("buyer_email", email)
    .order("created_at", { ascending: false })
    .limit(1);

  if (paidOnly) {
    query = query.eq("status", "paid");
  }

  const { data, error } = await query.maybeSingle();
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
  supabase: MainSupabase;
  userId: string;
  fullName: string;
  whatsapp: string | null;
}) {
  const { data: existingProfile, error: profileError } = await supabase
    .from("users_profiles")
    .select("id, full_name, phone")
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
  supabase: MainSupabase,
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
  supabase: MainSupabase;
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
  authUser: AuthUserRow | null
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

  return (
    email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Member Affiliate"
  );
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

function isCurrentlyActiveLicenseUser(user: LicenseUser) {
  if (!user.is_active) return false;
  if (!user.expiry_date) return true;
  return new Date(user.expiry_date) >= new Date(new Date().toDateString());
}

void main();
