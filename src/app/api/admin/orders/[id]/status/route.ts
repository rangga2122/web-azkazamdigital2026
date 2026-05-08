import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { processOrderPaidTransition } from "@/lib/order-paid";
import { resolveRequestOrigin } from "@/lib/site-url";

const VALID_ORDER_STATUSES = ["pending", "paid", "failed", "cancelled"] as const;

type OrderStatus = (typeof VALID_ORDER_STATUSES)[number];

type LicenseRegistrationPayload = {
  enabled: boolean;
  role: "admin" | "user";
  allowedFeatures: string[];
  productEntries: Array<{
    productName: string;
    expiryDate?: string | null;
    maxSessions?: number | null;
  }>;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: admin } = await sessionSupabase
      .from("admins")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      status?: string;
      licenseRegistration?: unknown;
    };
    const nextStatus = body.status as OrderStatus | undefined;

    if (!nextStatus || !VALID_ORDER_STATUSES.includes(nextStatus)) {
      return NextResponse.json(
        { error: "Status order tidak valid." },
        { status: 400 }
      );
    }

    const serviceSupabase = await createServiceRoleClient();
    const { data: existingOrder, error: existingOrderError } = await serviceSupabase
      .from("orders")
      .select("id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at")
      .eq("id", id)
      .single();

    if (existingOrderError || !existingOrder) {
      return NextResponse.json(
        { error: "Order tidak ditemukan." },
        { status: 404 }
      );
    }

    const { data: updatedOrder, error: updateError } = await serviceSupabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", id)
      .select("id, order_code, status, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, subtotal, unique_code, total_amount, gateway_total_payment, created_at")
      .single();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        { error: updateError?.message || "Gagal mengubah status order." },
        { status: 400 }
      );
    }

    const origin = resolveRequestOrigin({
      headers: request.headers,
      nextUrlOrigin: request.nextUrl.origin,
    });
    const licenseRegistration = normalizeLicenseRegistration(body.licenseRegistration);
    const transitionResult = await processOrderPaidTransition({
      serviceSupabase,
      origin,
      previousStatus: existingOrder.status,
      updatedOrder,
      licenseRegistration,
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      email: transitionResult.email,
      whatsapp: transitionResult.whatsapp,
      license: transitionResult.license,
    });
  } catch (error) {
    console.error("Admin order status route error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses status order." },
      { status: 500 }
    );
  }
}

function normalizeLicenseRegistration(value: unknown): LicenseRegistrationPayload {
  const row = isObject(value) ? value : {};
  const productEntries = Array.isArray(row.productEntries)
    ? row.productEntries
        .map((item) => {
          const productRow = isObject(item) ? item : {};
          const productName = String(productRow.productName || "").trim();
          if (!productName) {
            return null;
          }

          return {
            productName,
            expiryDate: normalizeNullableString(productRow.expiryDate),
            maxSessions: normalizeNullableNumber(productRow.maxSessions),
          };
        })
        .filter((item) => item !== null)
    : [];

  return {
    enabled: row.enabled !== false,
    role: row.role === "admin" ? "admin" : "user",
    allowedFeatures: Array.isArray(row.allowedFeatures)
      ? row.allowedFeatures
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [],
    productEntries,
  };
}

function normalizeNullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeNullableNumber(value: unknown) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
