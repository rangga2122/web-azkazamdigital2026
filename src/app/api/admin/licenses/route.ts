import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addLicenseUsers,
  createLicenseNotification,
  createLicenseProduct,
  createLicenseUsersFromOrder,
  deleteLicenseNotification,
  deleteLicenseOrderLead,
  deleteLicenseProduct,
  deleteLicenseUser,
  kickAllLicenseSessions,
  kickLicenseSession,
  loadLicenseBootstrap,
  updateLicenseNotification,
  updateLicenseProduct,
  updateLicenseUser,
} from "@/lib/license-manager";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const data = await loadLicenseBootstrap();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("License bootstrap error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data lisensi." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      payload?: Record<string, unknown>;
    };

    const action = body.action;
    const payload = body.payload || {};

    if (!action) {
      return NextResponse.json({ error: "Action wajib diisi." }, { status: 400 });
    }

    const data = await handleAction(action, payload);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("License admin action error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal memproses aksi lisensi.",
      },
      { status: 500 }
    );
  }
}

async function handleAction(action: string, payload: Record<string, unknown>) {
  switch (action) {
    case "add-users":
      return addLicenseUsers({
        email: String(payload.email || "").trim(),
        role: normalizeRole(payload.role),
        allowedFeatures: normalizeStringArray(payload.allowedFeatures),
        productEntries: normalizeProductEntries(payload.productEntries),
      });
    case "update-user":
      return {
        data: await updateLicenseUser({
          id: String(payload.id || ""),
          role: payload.role === undefined ? undefined : normalizeRole(payload.role),
          productName:
            payload.productName === undefined
              ? undefined
              : normalizeNullableString(payload.productName),
          expiryDate:
            payload.expiryDate === undefined
              ? undefined
              : normalizeNullableString(payload.expiryDate),
          allowedFeatures:
            payload.allowedFeatures === undefined
              ? undefined
              : normalizeStringArray(payload.allowedFeatures),
          maxSessions:
            payload.maxSessions === undefined
              ? undefined
              : Number(payload.maxSessions || 1),
          isActive:
            payload.isActive === undefined ? undefined : Boolean(payload.isActive),
        }),
      };
    case "delete-user":
      return { data: await deleteLicenseUser(String(payload.id || "")) };
    case "create-users-from-order":
      return createLicenseUsersFromOrder({
        orderLeadId: String(payload.orderLeadId || ""),
        role: normalizeRole(payload.role),
        allowedFeatures: normalizeStringArray(payload.allowedFeatures),
        productEntries: normalizeProductEntries(payload.productEntries),
      });
    case "delete-order-lead":
      return { data: await deleteLicenseOrderLead(String(payload.id || "")) };
    case "create-product":
      return {
        data: await createLicenseProduct({
          name: String(payload.name || "").trim(),
          description: normalizeNullableString(payload.description),
          defaultFeatures: normalizeStringArray(payload.defaultFeatures),
          defaultExpiryDays: normalizeNullableNumber(payload.defaultExpiryDays),
          matchedCatalogProductId: normalizeNullableString(payload.matchedCatalogProductId),
        }),
      };
    case "update-product":
      return {
        data: await updateLicenseProduct({
          id: Number(payload.id),
          name: payload.name === undefined ? undefined : String(payload.name || "").trim(),
          description:
            payload.description === undefined
              ? undefined
              : normalizeNullableString(payload.description),
          defaultFeatures:
            payload.defaultFeatures === undefined
              ? undefined
              : normalizeStringArray(payload.defaultFeatures),
          defaultExpiryDays:
            payload.defaultExpiryDays === undefined
              ? undefined
              : normalizeNullableNumber(payload.defaultExpiryDays),
          matchedCatalogProductId:
            payload.matchedCatalogProductId === undefined
              ? undefined
              : normalizeNullableString(payload.matchedCatalogProductId),
          isActive:
            payload.isActive === undefined ? undefined : Boolean(payload.isActive),
        }),
      };
    case "delete-product":
      return { data: await deleteLicenseProduct(Number(payload.id)) };
    case "create-notification":
      return {
        data: await createLicenseNotification({
          productName: String(payload.productName || "").trim(),
          title: String(payload.title || "").trim(),
          message: String(payload.message || "").trim(),
          type: normalizeNotificationType(payload.type),
          isActive: Boolean(payload.isActive),
        }),
      };
    case "update-notification":
      return {
        data: await updateLicenseNotification({
          id: Number(payload.id),
          productName:
            payload.productName === undefined
              ? undefined
              : String(payload.productName || "").trim(),
          title: payload.title === undefined ? undefined : String(payload.title || "").trim(),
          message:
            payload.message === undefined
              ? undefined
              : String(payload.message || "").trim(),
          type:
            payload.type === undefined
              ? undefined
              : normalizeNotificationType(payload.type),
          isActive:
            payload.isActive === undefined ? undefined : Boolean(payload.isActive),
        }),
      };
    case "delete-notification":
      return { data: await deleteLicenseNotification(Number(payload.id)) };
    case "kick-session":
      return { data: await kickLicenseSession(String(payload.token || "")) };
    case "kick-all-sessions":
      return { data: await kickAllLicenseSessions(String(payload.userId || "")) };
    default:
      throw new Error(`Action lisensi tidak dikenali: ${action}`);
  }
}

async function requireAdmin() {
  const sessionSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: admin } = await sessionSupabase
    .from("admins")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

function normalizeRole(value: unknown) {
  return value === "admin" ? "admin" : "user";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeProductEntries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        productName: String(row.productName || "").trim(),
        expiryDate: normalizeNullableString(row.expiryDate),
        maxSessions: normalizeNullableNumber(row.maxSessions),
      };
    })
    .filter((item) => item.productName);
}

function normalizeNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeNullableNumber(value: unknown) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}

function normalizeNotificationType(value: unknown) {
  const allowed = new Set(["info", "success", "warning", "danger", "light"]);
  const text = String(value || "info").trim();
  return allowed.has(text) ? (text as "info" | "success" | "warning" | "danger" | "light") : "info";
}
