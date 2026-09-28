import { cookies } from "next/headers";

const BACKEND =
  process.env.LICENSE_SUPABASE_URL || "https://lisensi.azkazamdigital.com";

export const LM_ADMIN_COOKIE = "lm_admin_token";

export async function verifyLmAdmin(): Promise<{
  ok: boolean;
  email?: string;
}> {
  const token = (await cookies()).get(LM_ADMIN_COOKIE)?.value;
  if (!token) return { ok: false };

  try {
    const res = await fetch(`${BACKEND}/api/me`, {
      headers: { "X-Admin-Key": token },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, email: data.email };
  } catch {
    return { ok: false };
  }
}
