import "server-only";

type PakasirConfig = {
  enabled: boolean;
  mode: "sandbox" | "live";
  projectSlug: string | null;
  apiKey: string | null;
  webhookUrl: string | null;
};

type PakasirCreateTransactionResponse = {
  payment: {
    project: string;
    order_id: string;
    amount: number;
    fee: number;
    total_payment: number;
    payment_method: "qris";
    payment_number: string;
    expired_at: string;
  };
};

type PakasirTransactionDetailResponse = {
  transaction: {
    amount: number;
    order_id: string;
    project: string;
    status: string;
    payment_method: string;
    completed_at: string | null;
  };
};

export function resolvePakasirConfig(input: {
  pakasir_enabled?: boolean | null;
  pakasir_mode?: string | null;
  pakasir_project_slug?: string | null;
  pakasir_api_key?: string | null;
  pakasir_webhook_url?: string | null;
}): PakasirConfig {
  return {
    enabled: Boolean(input.pakasir_enabled),
    mode: input.pakasir_mode === "live" ? "live" : "sandbox",
    projectSlug: normalizeNullableString(input.pakasir_project_slug),
    apiKey: normalizeNullableString(input.pakasir_api_key),
    webhookUrl: normalizeNullableString(input.pakasir_webhook_url),
  };
}

export function isPakasirConfigured(config: PakasirConfig) {
  return Boolean(config.enabled && config.projectSlug && config.apiKey);
}

export async function createPakasirQrisTransaction(input: {
  projectSlug: string;
  apiKey: string;
  orderId: string;
  amount: number;
}) {
  const payload = {
    project: input.projectSlug,
    order_id: input.orderId,
    amount: Math.round(Number(input.amount || 0)),
    api_key: input.apiKey,
  };

  const response = await fetch(
    "https://app.pakasir.com/api/transactioncreate/qris",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const data = (await response.json().catch(() => null)) as
    | PakasirCreateTransactionResponse
    | { message?: string; error?: string }
    | null;

  if (!response.ok || !data || !("payment" in data) || !data.payment?.payment_number) {
    throw new Error(
      extractPakasirError(data) || "Gagal membuat transaksi Pakasir."
    );
  }

  return data.payment;
}

export async function fetchPakasirTransactionDetail(input: {
  projectSlug: string;
  apiKey: string;
  orderId: string;
  amount: number;
}) {
  const query = new URLSearchParams({
    project: input.projectSlug,
    amount: String(Math.round(Number(input.amount || 0))),
    order_id: input.orderId,
    api_key: input.apiKey,
  });

  const response = await fetch(
    `https://app.pakasir.com/api/transactiondetail?${query.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const data = (await response.json().catch(() => null)) as
    | PakasirTransactionDetailResponse
    | { message?: string; error?: string }
    | null;

  if (!response.ok || !data || !("transaction" in data) || !data.transaction?.order_id) {
    throw new Error(
      extractPakasirError(data) || "Gagal memeriksa status transaksi Pakasir."
    );
  }

  return data.transaction;
}

export async function simulatePakasirPayment(input: {
  projectSlug: string;
  apiKey: string;
  orderId: string;
  amount: number;
}) {
  const payload = {
    project: input.projectSlug,
    order_id: input.orderId,
    amount: Math.round(Number(input.amount || 0)),
    api_key: input.apiKey,
  };

  const response = await fetch("https://app.pakasir.com/api/paymentsimulation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    throw new Error(data?.message || data?.error || "Simulasi pembayaran Pakasir gagal.");
  }
}

function normalizeNullableString(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || null;
}

function extractPakasirError(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  const message = String(row.message || row.error || "").trim();
  return message || null;
}
