import { NextRequest, NextResponse } from "next/server";
import type {
  ProductRecommendationLinkTarget,
  ProductRecommendationSource,
  ProductRecommendationStyle,
} from "@/lib/article-product-recommendations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateAndStoreArticle } from "@/lib/article-automation";

type GenerateArticlePayload = {
  topic?: string;
  focusKeyword?: string;
  status?: "draft" | "published";
  productSelectionMode?: "ai" | "manual";
  selectedProducts?: Array<{
    slug: string;
    caption?: string;
    style?: ProductRecommendationStyle;
    linkTarget?: ProductRecommendationLinkTarget;
    contactLabel?: string;
    contactUrl?: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as GenerateArticlePayload;
    const topic = body.topic?.trim() || "";
    const focusKeyword = body.focusKeyword?.trim() || "";
    const recommendedProductsOverride =
      body.productSelectionMode === "manual"
        ? await loadSelectedProducts(body.selectedProducts || [])
        : null;

    const article = await generateAndStoreArticle({
      topic,
      focusKeyword,
      status:
        body.status === "published" || body.status === "draft"
          ? body.status
          : undefined,
      recommendedProductsOverride,
    });

    return NextResponse.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error("AI article generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal membuat artikel dengan AI.",
      },
      { status: 500 }
    );
  }
}

async function loadSelectedProducts(
  selectedProducts: GenerateArticlePayload["selectedProducts"]
) {
  const normalizedSelections = (selectedProducts || [])
    .map((item) => ({
      slug: item.slug?.trim() || "",
      preferred_caption: item.caption?.trim() || null,
      preferred_style: item.style || null,
      preferred_link_target: item.linkTarget || null,
      contact_label: item.contactLabel?.trim() || null,
      contact_url: item.contactUrl?.trim() || null,
    }))
    .filter((item) => Boolean(item.slug));

  if (normalizedSelections.length === 0) {
    return [] as ProductRecommendationSource[];
  }

  const sessionSupabase = await createServerSupabaseClient();
  const { data, error } = await sessionSupabase
    .from("products")
    .select(`
      title,
      slug,
      thumbnail_url,
      short_description,
      click_target_type,
      is_active,
      click_target_page:pages!products_click_target_page_id_fkey (
        slug
      )
    `)
    .in(
      "slug",
      normalizedSelections.map((item) => item.slug)
    )
    .eq("is_active", true);

  if (error || !data) {
    return [] as ProductRecommendationSource[];
  }

  const selectionsBySlug = normalizedSelections.reduce<
    Record<string, (typeof normalizedSelections)[number]>
  >((accumulator, item) => {
    accumulator[item.slug] = item;
    return accumulator;
  }, {});

  return (data as Array<{
    title: string;
    slug: string;
    thumbnail_url: string | null;
    short_description: string | null;
    click_target_type: "cms_page" | "checkout";
    click_target_page?: { slug: string } | Array<{ slug: string }> | null;
  }>)
    .map((product) => {
      const selection = selectionsBySlug[product.slug];

      return {
        title: product.title,
        slug: product.slug,
        thumbnail_url: product.thumbnail_url,
        short_description: product.short_description,
        click_target_type: product.click_target_type,
        click_target_page_slug: getRelatedPageSlug(product.click_target_page),
        preferred_caption: selection?.preferred_caption || null,
        preferred_style: selection?.preferred_style || null,
        preferred_link_target: selection?.preferred_link_target || null,
        contact_label: selection?.contact_label || null,
        contact_url: selection?.contact_url || null,
      };
    })
    .sort(
      (left, right) =>
        normalizedSelections.findIndex((item) => item.slug === left.slug) -
        normalizedSelections.findIndex((item) => item.slug === right.slug)
    );
}

function getRelatedPageSlug(
  relation: { slug: string } | Array<{ slug: string }> | null | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.slug || null;
  }

  return relation?.slug || null;
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
