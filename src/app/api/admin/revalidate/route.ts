import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as {
      paths?: string[];
      tags?: string[];
    };
    const paths = sanitizeStrings(body.paths);
    const tags = sanitizeStrings(body.tags);

    for (const tag of tags) {
      revalidateTag(tag, "max");
    }

    for (const path of paths) {
      revalidatePath(path);
    }

    return NextResponse.json({
      success: true,
      revalidated: {
        paths,
        tags,
      },
    });
  } catch (error) {
    console.error("Admin revalidate error:", error);
    return NextResponse.json(
      { error: "Gagal menyegarkan cache publik." },
      { status: 500 }
    );
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

function sanitizeStrings(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}
