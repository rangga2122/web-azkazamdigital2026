import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticleAutomationSettings } from "@/types";
import { generateArticleDraft } from "@/lib/article-ai";
import {
  DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
  parseTopicQueue,
} from "@/lib/article-config";
import type { ProductRecommendationSource } from "@/lib/article-product-recommendations";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createSlug } from "@/lib/utils";

type ServiceSupabase = SupabaseClient;

type SiteIdentity = {
  siteName: string;
  description: string;
};

export async function loadArticleAutomationSettings(
  supabase?: ServiceSupabase
) {
  const serviceSupabase = supabase || (await createServiceRoleClient());
  const { data } = await serviceSupabase
    .from("article_automation_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  return {
    ...DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
    ...(data || {}),
  } as Partial<ArticleAutomationSettings> &
    typeof DEFAULT_ARTICLE_AUTOMATION_SETTINGS;
}

export async function generateAndStoreArticle(options: {
  topic?: string | null;
  focusKeyword?: string | null;
  status?: "draft" | "published";
  supabase?: ServiceSupabase;
  recommendedProductsOverride?: ProductRecommendationSource[] | null;
  titleVariantSeed?: string | null;
}) {
  const serviceSupabase = options.supabase || (await createServiceRoleClient());
  const settings = await loadArticleAutomationSettings(serviceSupabase);
  const siteIdentity = await loadSiteIdentity(serviceSupabase);
  const queuedTopics = parseTopicQueue(settings.topic_queue);
  const effectiveTopic = options.topic?.trim() || queuedTopics[0] || null;
  const recommendedProducts =
    options.recommendedProductsOverride &&
    options.recommendedProductsOverride.length > 0
      ? options.recommendedProductsOverride
      : await loadRecommendedProducts(
          serviceSupabase,
          effectiveTopic,
          options.focusKeyword,
          settings.target_keywords
        );
  const draft = await generateArticleDraft({
    topic: effectiveTopic,
    focusKeyword: options.focusKeyword,
    siteName: siteIdentity.siteName,
    siteDescription: siteIdentity.description,
    settings,
    recommendedProducts,
    titleVariantSeed:
      options.titleVariantSeed || `${new Date().toISOString()}|${effectiveTopic || "-"}`,
  });

  const slug = await ensureUniqueArticleSlug(serviceSupabase, draft.slug);
  const status =
    options.status || (settings.auto_publish ? "published" : "draft");
  const now = new Date().toISOString();

  const { data, error } = await serviceSupabase
    .from("articles")
    .insert({
      title: draft.title,
      slug,
      excerpt: draft.excerpt,
      content_html: draft.contentHtml,
      cover_image: null,
      status,
      seo_title: draft.seoTitle,
      seo_description: draft.seoDescription,
      focus_keyword: draft.focusKeyword,
      author_name: draft.authorName,
      canonical_url: null,
      tags: draft.tags,
      published_at: status === "published" ? now : null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Gagal menyimpan artikel AI.");
  }

  return data as Article;
}

export async function processScheduledArticleGeneration() {
  const supabase = await createServiceRoleClient();
  const settings = await loadArticleAutomationSettings(supabase);

  if (!settings.id) {
    return {
      success: true,
      skipped: true,
      reason: "settings_missing",
      message: "Pengaturan automasi artikel belum dibuat.",
      generatedCount: 0,
      articles: [] as Article[],
    };
  }

  if (!settings.automation_enabled) {
    return {
      success: true,
      skipped: true,
      reason: "disabled",
      message: "Automasi artikel sedang nonaktif.",
      generatedCount: 0,
      articles: [] as Article[],
    };
  }

  if (!isGenerationDue(settings.last_run_at, settings.schedule_interval_hours)) {
    return {
      success: true,
      skipped: true,
      reason: "not_due",
      message: "Jadwal generate artikel belum jatuh tempo.",
      generatedCount: 0,
      articles: [] as Article[],
    };
  }

  const requestedCount = Math.max(1, Number(settings.articles_per_run || 1));
  const queuedTopics = parseTopicQueue(settings.topic_queue);
  const selectedTopics =
    queuedTopics.length > 0
      ? pickTopicsFromQueue(
          queuedTopics,
          requestedCount,
          Number(settings.queue_cursor || 0)
        )
      : {
          topics: Array.from({ length: requestedCount }, (_, index) =>
            buildFallbackTopic(settings.target_keywords, index)
          ),
          nextCursor: 0,
        };

  const articles: Article[] = [];
  for (const [index, topic] of selectedTopics.topics.entries()) {
    const article = await generateAndStoreArticle({
      topic,
      status: settings.auto_publish ? "published" : "draft",
      supabase,
      titleVariantSeed: `${new Date().toISOString()}|${topic}|${selectedTopics.nextCursor}|${index}`,
    });
    articles.push(article);
  }

  await supabase
    .from("article_automation_settings")
    .update({
      queue_cursor: selectedTopics.nextCursor,
      last_run_at: new Date().toISOString(),
    })
    .eq("id", settings.id);

  return {
    success: true,
    skipped: false,
    generatedCount: articles.length,
    topics: selectedTopics.topics,
    articles,
  };
}

async function loadSiteIdentity(supabase: ServiceSupabase): Promise<SiteIdentity> {
  const { data } = await supabase
    .from("site_settings")
    .select("site_name, description")
    .limit(1)
    .maybeSingle();

  return {
    siteName: data?.site_name || "AzkazamDigital",
    description:
      data?.description ||
      "Platform produk digital premium untuk kebutuhan bisnis online.",
  };
}

async function ensureUniqueArticleSlug(
  supabase: ServiceSupabase,
  baseSlug: string
) {
  const normalizedBase = createSlug(baseSlug) || "artikel-baru";
  let candidate = normalizedBase;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }

    counter += 1;
    candidate = `${normalizedBase}-${counter}`;
  }
}

function isGenerationDue(
  lastRunAt: string | null | undefined,
  scheduleIntervalHours: number | null | undefined
) {
  const intervalHours = Math.max(1, Number(scheduleIntervalHours || 24));
  if (!lastRunAt) return true;

  const lastRunMs = new Date(lastRunAt).getTime();
  if (Number.isNaN(lastRunMs)) return true;

  return Date.now() - lastRunMs >= intervalHours * 60 * 60 * 1000;
}

function buildFallbackTopic(
  targetKeywords: string | null | undefined,
  index: number
) {
  const firstKeyword =
    (targetKeywords || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0] || "produk digital";

  if (index === 0) {
    return `Panduan ${firstKeyword} untuk pemula`;
  }

  return `Strategi ${firstKeyword} untuk meningkatkan penjualan online`;
}

function pickTopicsFromQueue(
  topics: string[],
  requestedCount: number,
  queueCursor: number
) {
  const safeTopics = topics.filter(Boolean);

  if (safeTopics.length === 0) {
    return {
      topics: [] as string[],
      nextCursor: 0,
    };
  }

  const normalizedCursor =
    ((Math.max(0, queueCursor) % safeTopics.length) + safeTopics.length) %
    safeTopics.length;
  const selectedTopics: string[] = [];

  for (let index = 0; index < requestedCount; index += 1) {
    selectedTopics.push(
      safeTopics[(normalizedCursor + index) % safeTopics.length]
    );
  }

  return {
    topics: selectedTopics,
    nextCursor: (normalizedCursor + requestedCount) % safeTopics.length,
  };
}

async function loadRecommendedProducts(
  supabase: ServiceSupabase,
  topic: string | null | undefined,
  focusKeyword: string | null | undefined,
  targetKeywords: string | null | undefined
) {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      title,
      slug,
      thumbnail_url,
      short_description,
      click_target_type,
      is_active,
      is_featured,
      click_target_page:pages!products_click_target_page_id_fkey (
        slug
      )
    `
    )
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error || !data) {
    return [] as ProductRecommendationSource[];
  }

  const rankedProducts = (data as Array<{
    title: string;
    slug: string;
    thumbnail_url: string | null;
    short_description: string | null;
    click_target_type: "cms_page" | "checkout" | "custom_url";
    is_featured: boolean;
    click_target_page?: { slug: string } | Array<{ slug: string }> | null;
  }>).map((product) => ({
    title: product.title,
    slug: product.slug,
    thumbnail_url: product.thumbnail_url,
    short_description: product.short_description,
    click_target_type: product.click_target_type,
    click_target_page_slug: getRelatedPageSlug(product.click_target_page),
    score: scoreProductRecommendation(product, topic, focusKeyword, targetKeywords),
  }));

  return rankedProducts
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((product) => ({
      title: product.title,
      slug: product.slug,
      thumbnail_url: product.thumbnail_url,
      short_description: product.short_description,
      click_target_type: product.click_target_type,
      click_target_page_slug: product.click_target_page_slug,
    }));
}

function scoreProductRecommendation(
  product: {
    title: string;
    short_description: string | null;
    is_featured: boolean;
  },
  topic: string | null | undefined,
  focusKeyword: string | null | undefined,
  targetKeywords: string | null | undefined
) {
  const productText = normalizeSearchText(
    `${product.title} ${product.short_description || ""}`
  );
  const topicTokens = tokenizeSearchText(topic);
  const focusTokens = tokenizeSearchText(focusKeyword);
  const siteKeywordTokens = tokenizeSearchText(targetKeywords);

  let score = product.is_featured ? 3 : 0;

  for (const token of topicTokens) {
    if (productText.includes(token)) score += 4;
  }

  for (const token of focusTokens) {
    if (productText.includes(token)) score += 5;
  }

  for (const token of siteKeywordTokens) {
    if (productText.includes(token)) score += 1;
  }

  if (score === 0) {
    score = product.is_featured ? 2 : 1;
  }

  return score;
}

function tokenizeSearchText(value: string | null | undefined) {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(" ")
        .filter((token) => token.length >= 3)
    )
  );
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRelatedPageSlug(
  relation: { slug: string } | Array<{ slug: string }> | null | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.slug || null;
  }

  return relation?.slug || null;
}
