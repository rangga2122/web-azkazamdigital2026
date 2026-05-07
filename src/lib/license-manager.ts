import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionAffiliateAccessForLicensedEmail } from "@/lib/license-affiliate-access";
import { createLicenseManagerClient } from "@/lib/license-client";
import {
  enrichLicenseProductsWithCatalogMatches,
  loadCatalogProducts,
  loadLicenseProductCatalogSyncs,
  upsertLicenseProductCatalogSync,
} from "@/lib/license-product-sync";
import type {
  LicenseBootstrap,
  LicenseNotification,
  LicenseOrderLead,
  LicenseProduct,
  LicenseProvisionResultStatus,
  LicenseSession,
  LicenseUser,
} from "@/types/license-manager";

const SESSION_TIMEOUT_MS = 120 * 60 * 1000;

export async function loadLicenseBootstrap(): Promise<LicenseBootstrap> {
  const client = createLicenseManagerClient();
  if (!client) {
    return emptyBootstrap(false);
  }

  const [users, products, sessions, notifications, orderLeads, catalogProducts, syncRows] = await Promise.all([
    loadUsers(client),
    loadProducts(client),
    loadSessions(client),
    loadNotifications(client),
    loadOrderLeads(client),
    loadCatalogProducts(),
    loadLicenseProductCatalogSyncs(),
  ]);

  return {
    configured: true,
    users,
    products: enrichLicenseProductsWithCatalogMatches(
      products,
      catalogProducts,
      syncRows
    ),
    catalogProducts,
    sessions,
    notifications,
    orderLeads,
  };
}

export async function loadActiveLicenseUsersByEmail(email: string) {
  const client = createLicenseManagerClient();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!client || !normalizedEmail) {
    return [] as LicenseUser[];
  }

  const { data, error } = await client
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as LicenseUser[]).filter(isCurrentlyActiveLicenseUser);
}

export async function loadAllActiveLicenseUsersGroupedByEmail() {
  const client = createLicenseManagerClient();
  if (!client) {
    return new Map<string, LicenseUser[]>();
  }

  const { data, error } = await client
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

export async function addLicenseUsers(input: {
  email: string;
  role: "admin" | "user";
  allowedFeatures: string[];
  productEntries: Array<{
    productName: string;
    expiryDate?: string | null;
    maxSessions?: number | null;
  }>;
}) {
  const client = requireLicenseClient();
  const results: Array<{
    productName: string;
    status: LicenseProvisionResultStatus;
  }> = [];
  const normalizedEmail = input.email.toLowerCase();
  const requestedProductNames = input.productEntries
    .map((entry) => entry.productName)
    .filter(Boolean);
  const { data: productDefaults } = requestedProductNames.length
    ? await client
        .from("products")
        .select("name, default_features, default_expiry_days")
        .in("name", requestedProductNames)
    : {
        data: [] as Array<{
          name: string;
          default_features: string[] | null;
          default_expiry_days: number | null;
        }>,
      };
  const productDefaultsByName = new Map(
    (productDefaults || []).map((product) => [
      product.name,
      {
        defaultFeatures: Array.isArray(product.default_features)
          ? product.default_features
          : [],
        defaultExpiryDays:
          Number(product.default_expiry_days || 0) > 0
            ? Number(product.default_expiry_days)
            : null,
      },
    ])
  );

  for (const entry of input.productEntries) {
    const productDefaults = productDefaultsByName.get(entry.productName);
    const nextAllowedFeatures = resolveAllowedFeatures({
      requestedFeatures: input.allowedFeatures,
      defaultFeatures: productDefaults?.defaultFeatures || [],
    });
    const nextMaxSessions = Math.max(Number(entry.maxSessions || 1), 1);
    const existing = await client
      .from("users")
      .select("id, expiry_date, is_active, allowed_features, max_sessions, created_at")
      .eq("email", normalizedEmail)
      .eq("product_name", entry.productName)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing.error) {
      throw existing.error;
    }

    const existingLicense = existing.data?.[0];

    if (existingLicense?.id) {
      const nextExpiryDate = resolveRenewedExpiryDate({
        currentExpiryDate: existingLicense.expiry_date,
        requestedExpiryDate: entry.expiryDate || null,
        defaultExpiryDays: productDefaults?.defaultExpiryDays || null,
        isCurrentlyActive:
          Boolean(existingLicense.is_active) &&
          isFutureOrToday(existingLicense.expiry_date),
      });
      const { error } = await client
        .from("users")
        .update({
          role: input.role,
          expiry_date: nextExpiryDate,
          allowed_features:
            nextAllowedFeatures.length > 0
              ? nextAllowedFeatures
              : existingLicense.allowed_features,
          max_sessions: Math.max(
            Number(existingLicense.max_sessions || 1),
            nextMaxSessions
          ),
          is_active: true,
        })
        .eq("id", existingLicense.id);

      results.push({
        productName: entry.productName,
        status: error
          ? "error"
          : Boolean(existingLicense.is_active) &&
            isFutureOrToday(existingLicense.expiry_date)
          ? "extended"
          : "reactivated",
      });
      continue;
    }

    const { error } = await client.from("users").insert({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      role: input.role,
      expiry_date: entry.expiryDate || null,
      allowed_features: nextAllowedFeatures.length > 0 ? nextAllowedFeatures : null,
      max_sessions: nextMaxSessions,
      product_name: entry.productName,
      is_active: true,
    });

    results.push({
      productName: entry.productName,
      status: error ? "error" : "success",
    });
  }

  const activeLicenseUsers = await loadActiveLicenseUsersByEmail(input.email);
  if (activeLicenseUsers.length > 0) {
    await provisionAffiliateAccessForLicensedEmail({
      email: input.email,
      licenseUsers: activeLicenseUsers,
    });
  }

  return {
    results,
    data: await loadLicenseBootstrap(),
  };
}

function resolveAllowedFeatures(input: {
  requestedFeatures: string[];
  defaultFeatures: string[];
}) {
  if (input.requestedFeatures.length > 0) {
    return input.requestedFeatures;
  }

  if (input.defaultFeatures.length > 0) {
    return input.defaultFeatures;
  }

  return [];
}

function resolveRenewedExpiryDate(input: {
  currentExpiryDate: string | null;
  requestedExpiryDate: string | null;
  defaultExpiryDays: number | null;
  isCurrentlyActive: boolean;
}) {
  const durationDays = resolveLicenseDurationDays({
    requestedExpiryDate: input.requestedExpiryDate,
    defaultExpiryDays: input.defaultExpiryDays,
  });

  if (durationDays === null) {
    return input.currentExpiryDate;
  }

  const anchorDate = input.isCurrentlyActive
    ? parseDateOnly(input.currentExpiryDate) || startOfToday()
    : startOfToday();

  return formatDateOnly(addDays(anchorDate, durationDays));
}

function resolveLicenseDurationDays(input: {
  requestedExpiryDate: string | null;
  defaultExpiryDays: number | null;
}) {
  const requestedDays = getDaysUntil(input.requestedExpiryDate);
  if (requestedDays !== null && requestedDays > 0) {
    return requestedDays;
  }

  const fallbackDays =
    Number.isFinite(Number(input.defaultExpiryDays)) &&
    Number(input.defaultExpiryDays) > 0
      ? Number(input.defaultExpiryDays)
      : null;
  if (fallbackDays !== null) {
    return fallbackDays;
  }

  return requestedDays;
}

function isFutureOrToday(value: string | null) {
  if (!value) return true;
  const parsed = parseDateOnly(value);
  if (!parsed) return false;
  return parsed.getTime() >= startOfToday().getTime();
}

function getDaysUntil(value: string | null) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const diffMs = parsed.getTime() - startOfToday().getTime();
  return Math.max(Math.round(diffMs / (24 * 60 * 60 * 1000)), 0);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parseDateOnly(value: string | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const [year, month, day] = text.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function updateLicenseUser(input: {
  id: string;
  role?: "admin" | "user";
  productName?: string | null;
  expiryDate?: string | null;
  allowedFeatures?: string[] | null;
  maxSessions?: number | null;
  isActive?: boolean;
}) {
  const client = requireLicenseClient();
  const patch: Record<string, unknown> = {};

  if (input.role !== undefined) patch.role = input.role;
  if (input.productName !== undefined) patch.product_name = input.productName || null;
  if (input.expiryDate !== undefined) patch.expiry_date = input.expiryDate || null;
  if (input.allowedFeatures !== undefined) {
    patch.allowed_features = input.allowedFeatures?.length
      ? input.allowedFeatures
      : null;
  }
  if (input.maxSessions !== undefined) {
    patch.max_sessions = Math.max(Number(input.maxSessions || 1), 1);
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { error } = await client.from("users").update(patch).eq("id", input.id);
  if (error) throw error;

  const { data: updatedUser, error: updatedUserError } = await client
    .from("users")
    .select("email")
    .eq("id", input.id)
    .maybeSingle();

  if (updatedUserError) {
    throw updatedUserError;
  }

  if (input.isActive === false) {
    await kickAllLicenseSessions(input.id);
  }

  const normalizedEmail = String(updatedUser?.email || "").trim().toLowerCase();
  if (normalizedEmail) {
    const activeLicenseUsers = await loadActiveLicenseUsersByEmail(normalizedEmail);
    if (activeLicenseUsers.length > 0) {
      await provisionAffiliateAccessForLicensedEmail({
        email: normalizedEmail,
        licenseUsers: activeLicenseUsers,
      });
    }
  }

  return loadLicenseBootstrap();
}

export async function deleteLicenseUser(id: string) {
  const client = requireLicenseClient();
  const { error } = await client.from("users").delete().eq("id", id);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function createLicenseUsersFromOrder(input: {
  orderLeadId: string;
  role: "admin" | "user";
  allowedFeatures: string[];
  productEntries: Array<{
    productName: string;
    expiryDate?: string | null;
    maxSessions?: number | null;
  }>;
}) {
  const client = requireLicenseClient();
  const { data: order, error } = await client
    .from("order_leads")
    .select("*")
    .eq("id", input.orderLeadId)
    .single();

  if (error || !order?.email) {
    throw new Error("Data order tidak ditemukan atau email kosong.");
  }

  return addLicenseUsers({
    email: order.email,
    role: input.role,
    allowedFeatures: input.allowedFeatures,
    productEntries: input.productEntries,
  });
}

export async function deleteLicenseOrderLead(id: string) {
  const client = requireLicenseClient();
  const { error } = await client.from("order_leads").delete().eq("id", id);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function createLicenseProduct(input: {
  name: string;
  description?: string | null;
  defaultFeatures?: string[];
  defaultExpiryDays?: number | null;
  matchedCatalogProductId?: string | null;
}) {
  const client = requireLicenseClient();
  const { data, error } = await client
    .from("products")
    .insert({
      name: input.name,
      description: input.description || null,
      default_features: input.defaultFeatures?.length ? input.defaultFeatures : [],
      default_expiry_days: input.defaultExpiryDays || null,
      is_active: true,
    })
    .select("id, name")
    .single();
  if (error || !data) throw error || new Error("Produk lisensi gagal dibuat.");

  await upsertLicenseProductCatalogSync({
    licenseProductId: Number(data.id),
    licenseProductName: String(data.name || input.name),
    catalogProductId: input.matchedCatalogProductId || null,
  });

  return loadLicenseBootstrap();
}

export async function updateLicenseProduct(input: {
  id: number;
  name?: string;
  description?: string | null;
  defaultFeatures?: string[];
  defaultExpiryDays?: number | null;
  isActive?: boolean;
  matchedCatalogProductId?: string | null;
}) {
  const client = requireLicenseClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.defaultFeatures !== undefined) {
    patch.default_features = input.defaultFeatures;
  }
  if (input.defaultExpiryDays !== undefined) {
    patch.default_expiry_days = input.defaultExpiryDays || null;
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const { error } = await client.from("products").update(patch).eq("id", input.id);
  if (error) throw error;

  if (input.matchedCatalogProductId !== undefined) {
    const { data: updatedProduct, error: updatedProductError } = await client
      .from("products")
      .select("id, name")
      .eq("id", input.id)
      .single();

    if (updatedProductError || !updatedProduct) {
      throw updatedProductError || new Error("Produk lisensi tidak ditemukan.");
    }

    await upsertLicenseProductCatalogSync({
      licenseProductId: Number(updatedProduct.id),
      licenseProductName: String(updatedProduct.name || input.name || ""),
      catalogProductId: input.matchedCatalogProductId,
    });
  }

  return loadLicenseBootstrap();
}

export async function deleteLicenseProduct(id: number) {
  const client = requireLicenseClient();
  const { error } = await client.from("products").delete().eq("id", id);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function createLicenseNotification(input: {
  productName: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "danger" | "light";
  isActive: boolean;
}) {
  const client = requireLicenseClient();

  if (input.isActive) {
    await client
      .from("notifications")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("product_name", input.productName)
      .eq("is_active", true);
  }

  const { error } = await client.from("notifications").insert({
    product_name: input.productName,
    title: input.title,
    message: input.message,
    type: input.type,
    is_active: input.isActive,
  });
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function updateLicenseNotification(input: {
  id: number;
  productName?: string;
  title?: string;
  message?: string;
  type?: "info" | "success" | "warning" | "danger" | "light";
  isActive?: boolean;
}) {
  const client = requireLicenseClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.productName !== undefined) patch.product_name = input.productName;
  if (input.title !== undefined) patch.title = input.title;
  if (input.message !== undefined) patch.message = input.message;
  if (input.type !== undefined) patch.type = input.type;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (input.isActive && input.productName) {
    await client
      .from("notifications")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("product_name", input.productName)
      .eq("is_active", true)
      .neq("id", input.id);
  }

  const { error } = await client.from("notifications").update(patch).eq("id", input.id);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function deleteLicenseNotification(id: number) {
  const client = requireLicenseClient();
  const { error } = await client.from("notifications").delete().eq("id", id);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function kickLicenseSession(token: string) {
  const client = requireLicenseClient();
  const { error } = await client
    .from("user_sessions")
    .update({ is_active: false })
    .eq("session_token", token);
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function kickAllLicenseSessions(userId: string) {
  const client = requireLicenseClient();
  const { error } = await client
    .from("user_sessions")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return loadLicenseBootstrap();
}

function emptyBootstrap(configured: boolean): LicenseBootstrap {
  return {
    configured,
    users: [],
    products: [],
    catalogProducts: [],
    sessions: [],
    notifications: [],
    orderLeads: [],
  };
}

function requireLicenseClient() {
  const client = createLicenseManagerClient();
  if (!client) {
    throw new Error("Konfigurasi database lisensi belum tersedia.");
  }

  return client;
}

async function loadUsers(client: SupabaseClient) {
  const { data, error } = await client
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as LicenseUser[];
}

async function loadProducts(client: SupabaseClient) {
  const { data, error } = await client
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as LicenseProduct[];
}

async function loadNotifications(client: SupabaseClient) {
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data || []) as LicenseNotification[];
}

async function loadOrderLeads(client: SupabaseClient) {
  const { data, error } = await client
    .from("order_leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data || []) as LicenseOrderLead[];
}

async function loadSessions(client: SupabaseClient) {
  const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

  await client
    .from("user_sessions")
    .update({ is_active: false })
    .eq("is_active", true)
    .lt("last_heartbeat", cutoff);

  const { data, error } = await client
    .from("user_sessions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data || []) as LicenseSession[];
}

function isCurrentlyActiveLicenseUser(user: LicenseUser) {
  if (!user.is_active) return false;
  if (!user.expiry_date) return true;
  return new Date(user.expiry_date) >= new Date(new Date().toDateString());
}
