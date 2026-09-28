import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.LICENSE_SUPABASE_URL || "https://lisensi.azkazamdigital.com";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("lm_admin_token")?.value;
  if (token) {
    try {
      await fetch(`${BACKEND}/api/logout`, {
        method: "POST",
        headers: { "X-Admin-Key": token },
      });
    } catch {
      // best effort — cookie dihapus tetap
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("lm_admin_token", "", { path: "/", maxAge: 0 });
  return res;
}
