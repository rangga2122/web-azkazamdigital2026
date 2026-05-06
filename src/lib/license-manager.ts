import "server-only";

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { provisionAffiliateAccessForLicensedEmail } from "@/lib/license-affiliate-access";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { enrichLicenseProductsWithCatalogMatches } from "@/lib/license-product-sync";
import type {
  LicenseBootstrap,
  LicenseCatalogProduct,
  LicenseNotification,
  LicenseOrderLead,
  LicenseProduct,
  LicenseSession,
  LicenseUser,
} from "@/types/license-manager";

type LicenseConfig = {
  url: string;
  serviceKey: string;
};

const SESSION_TIMEOUT_MS = 120 * 60 * 1000;

export function resolveLicenseManagerConfig(): LicenseConfig | null {
  const envUrl = process.env.LICENSE_SUPABASE_URL?.trim() || "";
  const envKey = process.env.LICENSE_SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (envUrl && envKey) {
    return { url: envUrl, serviceKey: envKey };
  }

  const htmlPath = path.resolve(process.cwd(), "..", "lisensi.html");
  if (!fs.existsSync(htmlPath)) {
    return null;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const url = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1] || "";
  const serviceKey = html.match(/const SERVICE_KEY = '([^']+)'/)?.[1] || "";

  if (!url || !serviceKey) {
    return null;
  }

  return { url, serviceKey };
}

export function createLicenseManagerClient(): SupabaseClient | null {
  const config = resolveLicenseManagerConfig();
  if (!config) return null;

  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadLicenseBootstrap(): Promise<LicenseBootstrap> {
  const client = createLicenseManagerClient();
  if (!client) {
    return emptyBootstrap(false);
  }

  const [users, products, sessions, notifications, orderLeads, catalogProducts] = await Promise.all([
    loadUsers(client),
    loadProducts(client),
    loadSessions(client),
    loadNotifications(client),
    loadOrderLeads(client),
    loadCatalogProducts(),
  ]);

  return {
    configured: true,
    users,
    products: enrichLicenseProductsWithCatalogMatches(products, catalogProducts),
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
  const results: Array<{ productName: string; status: "success" | "duplicate" | "error" }> =
    [];
  const requestedProductNames = input.productEntries
    .map((entry) => entry.productName)
    .filter(Boolean);
  const { data: productDefaults } = requestedProductNames.length
    ? await client
        .from("products")
        .select("name, default_features")
        .in("name", requestedProductNames)
    : { data: [] as Array<{ name: string; default_features: string[] | null }> };
  const defaultFeaturesByProduct = new Map(
    (productDefaults || []).map((product) => [
      product.name,
      Array.isArray(product.default_features) ? product.default_features : [],
    ])
  );

  for (const entry of input.productEntries) {
    const existing = await client
      .from("users")
      .select("id")
      .eq("email", input.email.toLowerCase())
      .eq("product_name", entry.productName)
      .maybeSingle();

    if (existing.data?.id) {
      results.push({ productName: entry.productName, status: "duplicate" });
      continue;
    }

    const { error } = await client.from("users").insert({
      id: crypto.randomUUID(),
      email: input.email.toLowerCase(),
      role: input.role,
      expiry_date: entry.expiryDate || null,
      allowed_features:
        input.allowedFeatures.length > 0
          ? input.allowedFeatures
          : defaultFeaturesByProduct.get(entry.productName)?.length
          ? defaultFeaturesByProduct.get(entry.productName)
          : null,
      max_sessions: Math.max(Number(entry.maxSessions || 1), 1),
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
}) {
  const client = requireLicenseClient();
  const { error } = await client.from("products").insert({
    name: input.name,
    description: input.description || null,
    default_features: input.defaultFeatures?.length ? input.defaultFeatures : [],
    default_expiry_days: input.defaultExpiryDays || null,
    is_active: true,
  });
  if (error) throw error;
  return loadLicenseBootstrap();
}

export async function updateLicenseProduct(input: {
  id: number;
  name?: string;
  description?: string | null;
  defaultFeatures?: string[];
  defaultExpiryDays?: number | null;
  isActive?: boolean;
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

async function loadCatalogProducts() {
  try {
    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, title, slug, badge, is_active")
      .order("title", { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []) as LicenseCatalogProduct[];
  } catch (error) {
    console.error("Load catalog products for license sync error:", error);
    return [] as LicenseCatalogProduct[];
  }
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
