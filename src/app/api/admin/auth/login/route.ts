import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.LICENSE_SUPABASE_URL || "https://lisensi.azkazamdigital.com";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendRes = await fetch(`${BACKEND}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, device: "www-admin" }),
    });
    const data = await backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || "Email/password salah" },
        { status: backendRes.status }
      );
    }

    const res = NextResponse.json({
      ok: true,
      email: data.email,
      role: data.role,
    });
    res.cookies.set("lm_admin_token", data.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Gagal terhubung ke server lisensi" },
      { status: 502 }
    );
  }
}
