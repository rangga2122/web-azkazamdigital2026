import { createHash } from "crypto";

const LICENSE_MANAGER_SUPABASE_URL =
  process.env.LICENSE_MANAGER_SUPABASE_URL ||
  "https://szkyrhmjzduydluqyuby.supabase.co";

const LICENSE_MANAGER_SUPABASE_SERVICE_KEY =
  process.env.LICENSE_MANAGER_SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6a3lyaG1qemR1eWRsdXF5dWJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjU4NDgwOSwiZXhwIjoyMDc4MTYwODA5fQ.DU8TQvogmJO-CdFwsVrwfhvXcxa7UVqI5S1m4vN9VFM";

type SyncLicenseOrderLeadInput = {
  orderId: string;
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  productName: string;
  subtotalAmount: number;
  uniqueCode: number;
  totalAmount: number;
  status: string;
};

type LicenseOrderLeadPayload = {
  wp_order_id: number;
  nama: string;
  email: string;
  no_hp: string;
  produk: string;
  harga: number;
  kode_unik: number;
  total: number;
  quantity: number;
  status: string;
  source: string;
};

function buildExternalOrderLeadId(orderId: string, orderCode: string) {
  const digest = createHash("sha256")
    .update(`${orderId}:${orderCode}`)
    .digest("hex");
  let hash = 0;

  for (let index = 0; index < digest.length; index += 1) {
    hash = (hash * 33 + digest.charCodeAt(index)) % 9_000_000_000_000;
  }

  return hash + 1_000_000_000_000;
}

function normalizeWhatsapp(phone: string) {
  return String(phone || "").trim();
}

function buildPayload(input: SyncLicenseOrderLeadInput): LicenseOrderLeadPayload {
  return {
    wp_order_id: buildExternalOrderLeadId(input.orderId, input.orderCode),
    nama: input.buyerName,
    email: input.buyerEmail.trim().toLowerCase(),
    no_hp: normalizeWhatsapp(input.buyerWhatsapp),
    produk: input.productName,
    harga: Number(input.subtotalAmount || 0),
    kode_unik: Number(input.uniqueCode || 0),
    total: Number(input.totalAmount || 0),
    quantity: 1,
    status: input.status,
    source: "azkazamdigital_web_app",
  };
}

export async function syncOrderLeadToLicenseManager(
  input: SyncLicenseOrderLeadInput
) {
  const endpoint = `${LICENSE_MANAGER_SUPABASE_URL}/rest/v1/order_leads?on_conflict=wp_order_id`;
  const payload = buildPayload(input);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: LICENSE_MANAGER_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${LICENSE_MANAGER_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `License Manager sync failed (${response.status}): ${errorText || response.statusText}`
    );
  }

  return {
    ok: true,
    wpOrderId: payload.wp_order_id,
  };
}
