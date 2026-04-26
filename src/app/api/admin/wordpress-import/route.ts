import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  discoverWordPressImportTargets,
  importWordPressPage,
} from "@/lib/wordpress-import";
import type { Product } from "@/types";

type DiscoverBody = {
  action: "discover";
  baseUrl?: string;
};

type ImportBody = {
  action: "import";
  urls?: string[];
  status?: "draft" | "published";
  overwrite?: boolean;
};

type RequestBody = DiscoverBody | ImportBody;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: admin } = await sessionSupabase
      .from("admins")
      .select("id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    if (body.action === "discover") {
      const baseUrl = sanitizeBaseUrl(body.baseUrl);
      if (!baseUrl) {
        return NextResponse.json(
          { error: "URL WordPress wajib diisi." },
          { status: 400 }
        );
      }

      const targets = await discoverWordPressImportTargets(baseUrl);
      return NextResponse.json({ success: true, targets });
    }

    if (body.action === "import") {
      const urls = (body.urls || []).filter(Boolean);
      if (urls.length === 0) {
        return NextResponse.json(
          { error: "Pilih minimal satu URL untuk diimport." },
          { status: 400 }
        );
      }

      const status = body.status === "published" ? "published" : "draft";
      const overwrite = Boolean(body.overwrite);
      const serviceSupabase = await createServiceRoleClient();
      const { data: products, error: productsError } = await serviceSupabase
        .from("products")
        .select("id, title, slug")
        .eq("is_active", true)
        .order("title");

      if (productsError) {
        return NextResponse.json(
          { error: productsError.message },
          { status: 400 }
        );
      }

      const results: Array<Record<string, unknown>> = [];

      for (const url of urls) {
        try {
          const importedPage = await importWordPressPage({
            url,
            products: (products || []) as Pick<Product, "id" | "title" | "slug">[],
          });

          const { data: existingPage } = await serviceSupabase
            .from("pages")
            .select("id, slug")
            .eq("slug", importedPage.slug)
            .maybeSingle();

          if (existingPage && !overwrite) {
            results.push({
              url,
              slug: importedPage.slug,
              status: "skipped",
              reason: "exists",
            });
            continue;
          }

          const payload = {
            title: importedPage.title,
            slug: importedPage.slug,
            content_html: importedPage.contentHtml,
            status,
            product_id: importedPage.productId,
            hide_header_footer: true,
            seo_title: importedPage.seoTitle,
            seo_description: importedPage.seoDescription,
            featured_image: importedPage.featuredImage,
          };

          const mutation = existingPage
            ? serviceSupabase
                .from("pages")
                .update(payload)
                .eq("id", existingPage.id)
                .select("id, slug")
                .single()
            : serviceSupabase
                .from("pages")
                .insert(payload)
                .select("id, slug")
                .single();

          const { data: savedPage, error: saveError } = await mutation;

          if (saveError || !savedPage) {
            results.push({
              url,
              slug: importedPage.slug,
              status: "failed",
              error: saveError?.message || "Gagal menyimpan halaman.",
            });
            continue;
          }

          results.push({
            url,
            slug: importedPage.slug,
            pageId: savedPage.id,
            title: importedPage.title,
            status: existingPage ? "updated" : "created",
            imageCount: importedPage.imageCount,
            productId: importedPage.productId,
          });
        } catch (error) {
          results.push({
            url,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Terjadi kesalahan saat import.",
          });
        }
      }

      return NextResponse.json({
        success: true,
        results,
      });
    }

    return NextResponse.json(
      { error: "Aksi import tidak dikenal." },
      { status: 400 }
    );
  } catch (error) {
    console.error("WordPress import route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat import WordPress.",
      },
      { status: 500 }
    );
  }
}

function sanitizeBaseUrl(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}
