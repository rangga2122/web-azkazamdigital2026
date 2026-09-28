/**
 * Provisioning user FBMP (fbmp.azkazamdigital.com) saat order FBMP PRO paid.
 *
 * Dipanggil dari processOrderPaidTransition. Endpoint FBMP:
 *   POST {FBMP_PROVISION_URL}/api/v1/provision/user
 *   Header: X-Provision-Key: <internal>
 *   Body:   { email, product: "fbmp-pro"|"fbmp-pro-3bln"|"fbmp-pro-1bln", full_name }
 *
 * - Email belum terdaftar -> user dibuat, initialPassword dikembalikan SEKALI
 *   (dipakai di email/WA "akses akun" ke pembeli).
 * - Email sudah terdaftar -> perpanjangan (expiry dari sisa), initialPassword = null.
 *
 * ENV (di .env container azkazam-web):
 *   FBMP_PROVISION_URL=https://fbmp.azkazamdigital.com
 *   FBMP_PROVISION_KEY=<internal secret>
 */

export type FbmpProvisionResult = {
  attempted: boolean;
  ok: boolean;
  mode: "created" | "extended" | null;
  initialPassword: string | null;
  loginUrl: string | null;
  error?: string;
};

const FBMP_PRODUCT_SLUGS = new Set(["fbmp-pro", "fbmp-pro-3bln", "fbmp-pro-1bln"]);

export function isFbmpProductSlug(slug: string | null | undefined): boolean {
  return !!slug && FBMP_PRODUCT_SLUGS.has(slug.trim().toLowerCase());
}

export async function provisionFbmpUser(input: {
  buyerEmail: string;
  buyerName: string;
  productSlug: string;
}): Promise<FbmpProvisionResult> {
  const baseUrl = (process.env.FBMP_PROVISION_URL || "").replace(/\/+$/, "");
  const key = process.env.FBMP_PROVISION_KEY || "";
  const loginUrl = "https://fbmp.azkazamdigital.com/";

  if (!baseUrl || !key) {
    return {
      attempted: false,
      ok: false,
      mode: null,
      initialPassword: null,
      loginUrl: null,
      error: "FBMP_PROVISION_URL/FBMP_PROVISION_KEY belum dikonfigurasi.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/provision/user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Provision-Key": key,
      },
      body: JSON.stringify({
        email: input.buyerEmail.trim().toLowerCase(),
        product: input.productSlug.trim().toLowerCase(),
        full_name: input.buyerName || "",
      }),
      // Provisioning boleh lambat sedikit, tapi jangan menggantung webhook PayHook.
      signal: AbortSignal.timeout(15000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      mode?: "created" | "extended";
      initialPassword?: string | null;
      error?: string;
    };

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `FBMP provisioning HTTP ${response.status}`);
    }

    return {
      attempted: true,
      ok: true,
      mode: payload.mode || null,
      initialPassword: payload.initialPassword || null,
      loginUrl,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      mode: null,
      initialPassword: null,
      loginUrl: null,
      error: error instanceof Error ? error.message : "FBMP provisioning gagal.",
    };
  }
}
