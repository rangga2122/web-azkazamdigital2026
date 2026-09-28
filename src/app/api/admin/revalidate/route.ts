import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { verifyLmAdmin } from "@/lib/lm-admin";

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
  const admin = await verifyLmAdmin();

  if (!admin.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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
