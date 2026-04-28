import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePageSeoSuggestions } from "@/lib/article-ai";

type PageSeoSuggestionPayload = {
  title?: string;
  slug?: string;
  contentHtml?: string;
  productTitle?: string;
};

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as PageSeoSuggestionPayload;
    const siteSettings = await loadSiteSettings();
    const suggestions = await generatePageSeoSuggestions({
      title: body.title?.trim() || "",
      slug: body.slug?.trim() || "",
      contentHtml: body.contentHtml || "",
      productTitle: body.productTitle?.trim() || "",
      siteName: siteSettings.siteName,
      siteDescription: siteSettings.siteDescription,
    });

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Page SEO suggestion generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal membuat saran SEO halaman dengan AI.",
      },
      { status: 500 }
    );
  }
}

async function loadSiteSettings() {
  try {
    const sessionSupabase = await createServerSupabaseClient();
    const { data } = await sessionSupabase
      .from("site_settings")
      .select("site_name, description")
      .limit(1)
      .single();

    return {
      siteName: data?.site_name?.trim() || "AzkazamDigital",
      siteDescription:
        data?.description?.trim() ||
        "Platform produk digital premium untuk kebutuhan bisnis online.",
    };
  } catch {
    return {
      siteName: "AzkazamDigital",
      siteDescription:
        "Platform produk digital premium untuk kebutuhan bisnis online.",
    };
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
    .select("id, user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
  };
}
