"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
} from "@/lib/article-config";
import {
  buildProductRecommendationShortcode,
  PRODUCT_RECOMMENDATION_LINK_OPTIONS,
  PRODUCT_RECOMMENDATION_SHORTCODE_EXAMPLE,
  PRODUCT_RECOMMENDATION_STYLE_OPTIONS,
  type ProductRecommendationLinkTarget,
  type ProductRecommendationStyle,
} from "@/lib/article-product-recommendations";
import { createSlug, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import type { Article, ArticleAutomationSettings, Page, Product } from "@/types";
import {
  FaMagic,
  FaNewspaper,
  FaRobot,
  FaSave,
  FaTimes,
  FaTrash,
  FaEdit,
  FaExternalLinkAlt,
  FaGift,
} from "react-icons/fa";
import toast from "react-hot-toast";

type ArticleFormState = {
  title: string;
  slug: string;
  excerpt: string;
  content_html: string;
  cover_image: string;
  status: "draft" | "published";
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  author_name: string;
  canonical_url: string;
  tags_input: string;
  published_at: string;
};

const EMPTY_ARTICLE_FORM: ArticleFormState = {
  title: "",
  slug: "",
  excerpt: "",
  content_html: "",
  cover_image: "",
  status: "draft",
  seo_title: "",
  seo_description: "",
  focus_keyword: "",
  author_name: DEFAULT_ARTICLE_AUTOMATION_SETTINGS.default_author_name,
  canonical_url: "",
  tags_input: "",
  published_at: "",
};

type AutomationSettingsState = Partial<ArticleAutomationSettings> &
  {
    automation_enabled: boolean;
    auto_publish: boolean;
    schedule_interval_hours: number;
    articles_per_run: number;
    queue_cursor: number;
    default_author_name: string;
    site_context: string;
    prompt_template: string;
    topic_queue: string;
    target_keywords: string;
    avoid_topics: string;
    internal_link_url: string;
    internal_link_anchor: string;
  };

const DEFAULT_AUTOMATION_SETTINGS_STATE: AutomationSettingsState = {
  ...DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
};

const DEFAULT_AI_FORM = {
  topic: "",
  focusKeyword: "",
  status: "draft" as "draft" | "published",
  productSelectionMode: "ai" as "ai" | "manual",
  selectedProducts: [] as AiSelectedProductState[],
};

type AiSelectedProductState = {
  slug: string;
  caption: string;
  style: ProductRecommendationStyle;
  linkTarget: ProductRecommendationLinkTarget;
  contactLabel: string;
  contactUrl: string;
};

type ProductRecommendationOption = Pick<
  Product,
  | "id"
  | "title"
  | "slug"
  | "thumbnail_url"
  | "short_description"
  | "click_target_type"
> & {
  click_target_page?: Pick<Page, "slug" | "title"> | Array<Pick<Page, "slug" | "title">> | null;
};

const DEFAULT_RECOMMENDATION_FORM = {
  productSlug: "",
  caption: "",
  style: "spotlight" as ProductRecommendationStyle,
  linkTarget: "product" as ProductRecommendationLinkTarget,
};

function createAiSelectedProductState(
  product: ProductRecommendationOption
): AiSelectedProductState {
  return {
    slug: product.slug,
    caption: product.short_description || "",
    style: "spotlight",
    linkTarget: inferRecommendationLinkTarget(product),
    contactLabel: "Hubungi Admin",
    contactUrl: "",
  };
}

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [products, setProducts] = useState<ProductRecommendationOption[]>([]);
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettingsState>(DEFAULT_AUTOMATION_SETTINGS_STATE);
  const [articleForm, setArticleForm] =
    useState<ArticleFormState>(EMPTY_ARTICLE_FORM);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [creatingArticle, setCreatingArticle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingArticle, setSavingArticle] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingAutomationSuggestions, setGeneratingAutomationSuggestions] =
    useState(false);
  const [aiForm, setAiForm] = useState(DEFAULT_AI_FORM);
  const [recommendationForm, setRecommendationForm] = useState(
    DEFAULT_RECOMMENDATION_FORM
  );
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const [
        { data: articlesData, error: articlesError },
        { data: settingsData, error: settingsError },
        { data: productsData, error: productsError },
      ] =
        await Promise.all([
          supabase
            .from("articles")
            .select("*")
            .order("published_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("article_automation_settings")
            .select("*")
            .limit(1)
            .maybeSingle(),
          supabase
            .from("products")
            .select(`
              id,
              title,
              slug,
              thumbnail_url,
              short_description,
              click_target_type,
              click_target_page:pages!products_click_target_page_id_fkey (
                title,
                slug
              )
            `)
            .eq("is_active", true)
            .order("title"),
        ]);

      if (articlesError) throw new Error(articlesError.message);
      if (settingsError) throw new Error(settingsError.message);
      if (productsError) throw new Error(productsError.message);

      setArticles((articlesData || []) as Article[]);
      setProducts((productsData || []) as ProductRecommendationOption[]);
      setAutomationSettings({
        ...DEFAULT_AUTOMATION_SETTINGS_STATE,
        ...((settingsData || {}) as Partial<ArticleAutomationSettings>),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat data artikel."
      );
    } finally {
      setLoading(false);
    }
  }

  function startEdit(article: Article) {
    setEditingArticle(article);
    setCreatingArticle(false);
    setRecommendationForm(DEFAULT_RECOMMENDATION_FORM);
    setArticleForm(mapArticleToForm(article));
  }

  function cancelEditor() {
    setEditingArticle(null);
    setCreatingArticle(false);
    setRecommendationForm(DEFAULT_RECOMMENDATION_FORM);
    setArticleForm(EMPTY_ARTICLE_FORM);
  }

  async function handleSaveArticle() {
    if (!articleForm.title.trim()) {
      toast.error("Judul artikel wajib diisi.");
      return;
    }

    const supabase = createClient();
    const slug = createSlug(articleForm.slug || articleForm.title);
    const publishedAt =
      articleForm.status === "published"
        ? toIsoDate(articleForm.published_at) || new Date().toISOString()
        : null;
    const payload = {
      title: articleForm.title.trim(),
      slug,
      excerpt: articleForm.excerpt.trim(),
      content_html: articleForm.content_html.trim(),
      cover_image: articleForm.cover_image.trim() || null,
      status: articleForm.status,
      seo_title: articleForm.seo_title.trim() || null,
      seo_description: articleForm.seo_description.trim() || null,
      focus_keyword: articleForm.focus_keyword.trim() || null,
      author_name: articleForm.author_name.trim() || null,
      canonical_url: articleForm.canonical_url.trim() || null,
      tags: articleForm.tags_input
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      published_at: publishedAt,
    };

    setSavingArticle(true);
    try {
      if (creatingArticle) {
        const { error } = await supabase.from("articles").insert(payload);
        if (error) throw new Error(error.message);
        toast.success("Artikel berhasil dibuat.");
      } else if (editingArticle) {
        const { error } = await supabase
          .from("articles")
          .update(payload)
          .eq("id", editingArticle.id);
        if (error) throw new Error(error.message);
        toast.success("Artikel berhasil diperbarui.");
      }

      cancelEditor();
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyimpan artikel."
      );
    } finally {
      setSavingArticle(false);
    }
  }

  async function handleDeleteArticle(articleId: string) {
    if (!confirm("Hapus artikel ini?")) return;

    const supabase = createClient();
    const { error } = await supabase.from("articles").delete().eq("id", articleId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Artikel berhasil dihapus.");
    await loadData();
  }

  async function handleSaveAutomationSettings() {
    const supabase = createClient();
    const payload = {
      automation_enabled: Boolean(automationSettings.automation_enabled),
      auto_publish: Boolean(automationSettings.auto_publish),
      schedule_interval_hours: Math.max(
        1,
        Number(automationSettings.schedule_interval_hours || 24)
      ),
      articles_per_run: Math.max(
        1,
        Number(automationSettings.articles_per_run || 1)
      ),
      default_author_name:
        automationSettings.default_author_name?.trim() ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.default_author_name,
      site_context:
        automationSettings.site_context?.trim() ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.site_context,
      prompt_template:
        automationSettings.prompt_template?.trim() ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.prompt_template,
      topic_queue: automationSettings.topic_queue || "",
      target_keywords:
        automationSettings.target_keywords ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.target_keywords,
      avoid_topics: automationSettings.avoid_topics || "",
      internal_link_url:
        automationSettings.internal_link_url ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.internal_link_url,
      internal_link_anchor:
        automationSettings.internal_link_anchor ||
        DEFAULT_ARTICLE_AUTOMATION_SETTINGS.internal_link_anchor,
    };

    setSavingAutomation(true);
    try {
      if (automationSettings.id) {
        const { error } = await supabase
          .from("article_automation_settings")
          .update(payload)
          .eq("id", automationSettings.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("article_automation_settings")
          .insert(payload);
        if (error) throw new Error(error.message);
      }

      toast.success("Pengaturan automasi artikel berhasil disimpan.");
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan pengaturan automasi."
      );
    } finally {
      setSavingAutomation(false);
    }
  }

  async function handleGenerateWithAI() {
    if (
      aiForm.productSelectionMode === "manual" &&
      aiForm.selectedProducts.length === 0
    ) {
      toast.error("Pilih minimal 1 produk jika mode rekomendasi manual aktif.");
      return;
    }

    const topicForGeneration =
      aiForm.topic.trim() || getFirstTopicFromQueue(automationSettings.topic_queue);

    if (!topicForGeneration) {
      toast.error("Isi Topik Artikel atau minimal satu baris di Topik Queue.");
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch("/api/admin/articles/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topicForGeneration,
          focusKeyword: aiForm.focusKeyword,
          status: aiForm.status,
          productSelectionMode: aiForm.productSelectionMode,
          selectedProducts:
            aiForm.productSelectionMode === "manual"
              ? aiForm.selectedProducts
              : [],
        }),
      });

      const result = (await response.json()) as {
        article?: Article;
        error?: string;
      };

      if (!response.ok || !result.article) {
        throw new Error(result.error || "Gagal membuat artikel AI.");
      }

      toast.success(
        aiForm.productSelectionMode === "manual"
          ? "Artikel AI berhasil dibuat dengan produk pilihan manual."
          : "Artikel AI berhasil dibuat dengan rekomendasi produk otomatis."
      );
      setAiForm(DEFAULT_AI_FORM);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal generate artikel AI."
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleToggleAiProductSelection(product: ProductRecommendationOption) {
    setAiForm((current) => {
      const existing = current.selectedProducts.find(
        (item) => item.slug === product.slug
      );

      return {
        ...current,
        selectedProducts: existing
          ? current.selectedProducts.filter((item) => item.slug !== product.slug)
          : [...current.selectedProducts, createAiSelectedProductState(product)],
      };
    });
  }

  function handleUpdateAiSelectedProduct(
    slug: string,
    field: keyof AiSelectedProductState,
    value: string
  ) {
    setAiForm((current) => ({
      ...current,
      selectedProducts: current.selectedProducts.map((item) =>
        item.slug === slug ? { ...item, [field]: value } : item
      ),
    }));
  }

  async function handleGenerateAutomationSuggestions() {
    if (!automationSettings.topic_queue.trim()) {
      toast.error("Isi Topik Queue dulu sebagai patokan utama AI.");
      return;
    }

    setGeneratingAutomationSuggestions(true);

    try {
      const response = await fetch("/api/admin/articles/automation-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicQueue: automationSettings.topic_queue,
          targetKeywords: automationSettings.target_keywords,
          siteContext: automationSettings.site_context,
          avoidTopics: automationSettings.avoid_topics,
        }),
      });

      const result = (await response.json()) as {
        suggestions?: {
          targetKeywords: string;
          siteContext: string;
          avoidTopics: string;
          summary: string;
        };
        error?: string;
      };

      if (!response.ok || !result.suggestions) {
        throw new Error(result.error || "Gagal membuat saran AI.");
      }

      setAutomationSettings((current) => ({
        ...current,
        target_keywords:
          result.suggestions?.targetKeywords || current.target_keywords,
        site_context: result.suggestions?.siteContext || current.site_context,
        avoid_topics: result.suggestions?.avoidTopics || current.avoid_topics,
      }));

      toast.success(
        result.suggestions.summary
          ? `Saran AI berhasil dimasukkan. ${result.suggestions.summary}`
          : "Saran AI berhasil dimasukkan ke form. Review lalu simpan."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal generate saran pengaturan automasi."
      );
    } finally {
      setGeneratingAutomationSuggestions(false);
    }
  }

  function handleInsertProductRecommendation() {
    if (!recommendationForm.productSlug) {
      toast.error("Pilih produk dulu.");
      return;
    }

    const shortcode = buildProductRecommendationShortcode({
      slug: recommendationForm.productSlug,
      caption: recommendationForm.caption,
      style: recommendationForm.style,
      linkTarget: recommendationForm.linkTarget,
    });

    setArticleForm((current) => ({
      ...current,
      content_html: insertTextAtCursor(
        current.content_html,
        shortcode,
        contentTextareaRef.current
      ),
    }));
    setRecommendationForm(DEFAULT_RECOMMENDATION_FORM);
    toast.success("Blok rekomendasi produk disisipkan ke artikel.");
  }

  if (creatingArticle || editingArticle) {
    const previewPath = articleForm.slug.trim()
      ? `/artikel/${createSlug(articleForm.slug)}`
      : "";
    const selectedRecommendationProduct = products.find(
      (product) => product.slug === recommendationForm.productSlug
    );
    const recommendationPreviewPath = selectedRecommendationProduct
      ? getRecommendationPreviewPath(
          selectedRecommendationProduct,
          recommendationForm.linkTarget
        )
      : "";

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            {creatingArticle ? "Tambah Artikel" : "Ubah Artikel"}
          </h1>
          <button
            onClick={cancelEditor}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-dark-400 transition hover:bg-dark-800 hover:text-white"
          >
            <FaTimes /> Batal
          </button>
        </div>

        <div className="space-y-5 rounded-2xl border border-dark-800 bg-dark-900 p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Judul *"
              value={articleForm.title}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  title: value,
                  slug: current.slug || createSlug(value),
                }))
              }
            />
            <Field
              label="Slug *"
              value={articleForm.slug}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, slug: value }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Excerpt"
              value={articleForm.excerpt}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, excerpt: value }))
              }
            />
            <Field
              label="Cover Image URL"
              value={articleForm.cover_image}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, cover_image: value }))
              }
              placeholder="/uploads/general/image.jpg"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-dark-300">
              Konten HTML
            </label>
            <textarea
              ref={contentTextareaRef}
              value={articleForm.content_html}
              onChange={(event) =>
                setArticleForm((current) => ({
                  ...current,
                  content_html: event.target.value,
                }))
              }
              rows={18}
              className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 font-mono text-sm text-white focus:border-primary-500/50 focus:outline-none"
              placeholder="<p>Pembuka artikel...</p>"
            />
          </div>

          <div className="rounded-2xl border border-dark-800 bg-dark-950/70 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300">
                <FaGift />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Sisipkan Rekomendasi Produk
                </h3>
                <p className="text-xs text-dark-400">
                  Anda bisa sisipkan lebih dari satu blok rekomendasi dengan style berbeda. Gambar akan diambil langsung dari `thumbnail_url` produk, jadi tidak menyimpan media baru.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SelectField
                label="Pilih Produk"
                value={recommendationForm.productSlug}
                onChange={(value) =>
                  setRecommendationForm((current) => ({
                    ...current,
                    productSlug: value,
                    linkTarget:
                      current.linkTarget === "product"
                        ? inferRecommendationLinkTarget(
                            products.find((product) => product.slug === value)
                          )
                        : current.linkTarget,
                    caption:
                      current.caption ||
                      products.find((product) => product.slug === value)
                        ?.short_description ||
                      "",
                  }))
                }
                options={[
                  { value: "", label: "Pilih produk aktif" },
                  ...products.map((product) => ({
                    value: product.slug,
                    label: product.title,
                  })),
                ]}
              />
              <SelectField
                label="Style Blok"
                value={recommendationForm.style}
                onChange={(value) =>
                  setRecommendationForm((current) => ({
                    ...current,
                    style: value as ProductRecommendationStyle,
                  }))
                }
                options={PRODUCT_RECOMMENDATION_STYLE_OPTIONS}
              />
              <SelectField
                label="Tujuan Link"
                value={recommendationForm.linkTarget}
                onChange={(value) =>
                  setRecommendationForm((current) => ({
                    ...current,
                    linkTarget: value as ProductRecommendationLinkTarget,
                  }))
                }
                options={PRODUCT_RECOMMENDATION_LINK_OPTIONS}
              />
              <Field
                label="Caption / Keterangan"
                value={recommendationForm.caption}
                onChange={(value) =>
                  setRecommendationForm((current) => ({
                    ...current,
                    caption: value,
                  }))
                }
                placeholder="Contoh: Cocok untuk pemula yang ingin landing page cepat jadi."
              />
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleInsertProductRecommendation}
                  className="w-full rounded-xl border border-primary-500/30 bg-primary-500/10 px-5 py-3 text-sm font-semibold text-primary-300 transition hover:bg-primary-500/20 md:min-w-[180px]"
                >
                  Sisipkan
                </button>
              </div>
            </div>

            {selectedRecommendationProduct ? (
              <div className="mt-4 flex items-center gap-4 rounded-xl border border-dark-800 bg-dark-900 px-4 py-3">
                {selectedRecommendationProduct.thumbnail_url ? (
                  <img
                    src={selectedRecommendationProduct.thumbnail_url}
                    alt={selectedRecommendationProduct.title}
                    className="h-16 w-20 rounded-lg object-cover bg-dark-950"
                  />
                ) : (
                  <div className="flex h-16 w-20 items-center justify-center rounded-lg bg-dark-950 text-lg font-bold text-dark-500">
                    {selectedRecommendationProduct.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {selectedRecommendationProduct.title}
                  </div>
                  <div className="mt-1 text-xs font-mono text-dark-500">
                    {recommendationPreviewPath}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-dark-400">
                    <span className="rounded-full border border-dark-700 px-2 py-1">
                      Style: {getRecommendationStyleLabel(recommendationForm.style)}
                    </span>
                    <span className="rounded-full border border-dark-700 px-2 py-1">
                      Link: {getRecommendationLinkLabel(recommendationForm.linkTarget)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-dark-800 bg-dark-900/70 px-4 py-3 text-xs text-dark-400">
              Format shortcode:
              <div className="mt-2 font-mono text-primary-300">
                {PRODUCT_RECOMMENDATION_SHORTCODE_EXAMPLE}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="SEO Title"
              value={articleForm.seo_title}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, seo_title: value }))
              }
            />
            <Field
              label="SEO Description"
              value={articleForm.seo_description}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  seo_description: value,
                }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Focus Keyword"
              value={articleForm.focus_keyword}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  focus_keyword: value,
                }))
              }
            />
            <Field
              label="Penulis"
              value={articleForm.author_name}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, author_name: value }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Canonical URL"
              value={articleForm.canonical_url}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  canonical_url: value,
                }))
              }
              placeholder="https://domain.com/artikel/judul"
            />
            <Field
              label="Tags (pisahkan koma)"
              value={articleForm.tags_input}
              onChange={(value) =>
                setArticleForm((current) => ({ ...current, tags_input: value }))
              }
              placeholder="seo, bisnis digital, affiliate"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SelectField
              label="Status"
              value={articleForm.status}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  status: value as "draft" | "published",
                }))
              }
              options={[
                { value: "draft", label: "Draf" },
                { value: "published", label: "Diterbitkan" },
              ]}
            />
            <Field
              label="Tanggal Publish"
              type="datetime-local"
              value={articleForm.published_at}
              onChange={(value) =>
                setArticleForm((current) => ({
                  ...current,
                  published_at: value,
                }))
              }
            />
          </div>

          {previewPath ? (
            <div className="rounded-xl border border-dark-800 bg-dark-950/70 px-4 py-3 text-sm text-dark-300">
              URL publik: <span className="font-mono text-primary-300">{previewPath}</span>
            </div>
          ) : null}

          <button
            onClick={handleSaveArticle}
            disabled={savingArticle}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-6 py-3 font-bold text-white transition hover:scale-[1.02] disabled:opacity-60"
          >
            <FaSave />
            {savingArticle ? "Menyimpan..." : "Simpan Artikel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Artikel</h1>
          <p className="mt-1 text-sm text-dark-400">
            Fokus workflow artikel di sini sekarang diarahkan ke generate AI, lalu Anda tinggal review hasilnya.
          </p>
        </div>
        <div className="rounded-full border border-dark-700 bg-dark-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-dark-300">
          AI Only Workflow
        </div>
      </div>

      <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500/10 text-primary-300">
            <FaRobot />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Generate Artikel dengan AI</h2>
            <p className="text-sm text-dark-400">
              Artikel dibuat oleh AI. Anda bisa memilih produk secara manual dari halaman ini atau membiarkan AI memilih produk yang paling relevan dari judul artikel.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Field
            label="Topik Artikel"
            value={aiForm.topic}
            onChange={(value) => setAiForm((current) => ({ ...current, topic: value }))}
            placeholder={
              getFirstTopicFromQueue(automationSettings.topic_queue) ||
              "Contoh: Cara memilih template landing page"
            }
          />
          <Field
            label="Focus Keyword"
            value={aiForm.focusKeyword}
            onChange={(value) =>
              setAiForm((current) => ({ ...current, focusKeyword: value }))
            }
            placeholder="template landing page"
          />
          <SelectField
            label="Status Hasil"
            value={aiForm.status}
            onChange={(value) =>
              setAiForm((current) => ({
                ...current,
                status: value as "draft" | "published",
              }))
            }
            options={[
              { value: "draft", label: "Simpan sebagai draf" },
              { value: "published", label: "Langsung publish" },
            ]}
          />
        </div>

        <div className="mt-3 text-sm text-dark-400">
          Jika `Topik Artikel` dikosongkan, sistem akan memakai baris pertama dari `Topik Queue`:
          <span className="ml-2 font-medium text-primary-300">
            {getFirstTopicFromQueue(automationSettings.topic_queue) || "belum ada topik"}
          </span>
        </div>

        {automationSettings.topic_queue.trim() ? (
          <div className="mt-2 text-xs text-dark-500">
            Scheduler akan memproses topik per baris sesuai urutan queue, lalu kembali ke baris pertama saat semua topik sudah habis.
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-dark-800 bg-dark-950/60 p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Mode Pilih Produk"
              value={aiForm.productSelectionMode}
              onChange={(value) =>
                setAiForm((current) => ({
                  ...current,
                  productSelectionMode: value as "ai" | "manual",
                }))
              }
              options={[
                { value: "ai", label: "AI pilih otomatis dari judul artikel" },
                { value: "manual", label: "Pilih produk manual" },
              ]}
            />
            <div className="rounded-xl border border-dark-800 bg-dark-900/70 px-4 py-3 text-sm text-dark-300">
              {aiForm.productSelectionMode === "ai"
                ? "AI akan mencocokkan produk aktif berdasarkan judul dan focus keyword artikel."
                : "Centang satu atau lebih produk, lalu isi deskripsi, target link order/landing, dan link kontak tambahan jika perlu."}
            </div>
          </div>

          {aiForm.productSelectionMode === "manual" ? (
            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-3 text-sm font-semibold text-white">
                  Pilih Produk untuk Ditampilkan di Artikel
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {products.map((product) => {
                    const selected = aiForm.selectedProducts.some(
                      (item) => item.slug === product.slug
                    );

                    return (
                      <label
                        key={product.id}
                        className={`flex cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3 transition ${
                          selected
                            ? "border-primary-500/40 bg-primary-500/10"
                            : "border-dark-800 bg-dark-900/70 hover:border-dark-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleToggleAiProductSelection(product)}
                        />
                        {product.thumbnail_url ? (
                          <img
                            src={product.thumbnail_url}
                            alt={product.title}
                            className="h-14 w-16 rounded-lg bg-dark-950 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-16 items-center justify-center rounded-lg bg-dark-950 text-lg font-bold text-dark-500">
                            {product.title.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {product.title}
                          </div>
                          <div className="mt-1 truncate text-xs text-dark-400">
                            {product.short_description || "Belum ada deskripsi singkat produk."}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {aiForm.selectedProducts.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-white">
                    Detail Produk Terpilih
                  </div>
                  {aiForm.selectedProducts.map((selectedProduct) => {
                    const product = products.find(
                      (item) => item.slug === selectedProduct.slug
                    );

                    if (!product) return null;

                    return (
                      <div
                        key={selectedProduct.slug}
                        className="rounded-2xl border border-dark-800 bg-dark-900/80 p-4"
                      >
                        <div className="mb-4 flex items-center gap-4">
                          {product.thumbnail_url ? (
                            <img
                              src={product.thumbnail_url}
                              alt={product.title}
                              className="h-16 w-20 rounded-xl bg-dark-950 object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-20 items-center justify-center rounded-xl bg-dark-950 text-lg font-bold text-dark-500">
                              {product.title.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">
                              {product.title}
                            </div>
                            <div className="mt-1 text-xs font-mono text-dark-500">
                              {getRecommendationPreviewPath(
                                product,
                                selectedProduct.linkTarget
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <TextAreaField
                            label="Deskripsi Produk di Artikel"
                            value={selectedProduct.caption}
                            onChange={(value) =>
                              handleUpdateAiSelectedProduct(
                                selectedProduct.slug,
                                "caption",
                                value
                              )
                            }
                            rows={3}
                            placeholder="Deskripsi singkat produk, manfaat, atau penjelasan order."
                          />
                          <div className="grid grid-cols-1 gap-4">
                            <SelectField
                              label="Target Link Utama"
                              value={selectedProduct.linkTarget}
                              onChange={(value) =>
                                handleUpdateAiSelectedProduct(
                                  selectedProduct.slug,
                                  "linkTarget",
                                  value
                                )
                              }
                              options={PRODUCT_RECOMMENDATION_LINK_OPTIONS}
                            />
                            <SelectField
                              label="Style Blok Produk"
                              value={selectedProduct.style}
                              onChange={(value) =>
                                handleUpdateAiSelectedProduct(
                                  selectedProduct.slug,
                                  "style",
                                  value
                                )
                              }
                              options={PRODUCT_RECOMMENDATION_STYLE_OPTIONS}
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <Field
                            label="Label Link Kontak Tambahan"
                            value={selectedProduct.contactLabel}
                            onChange={(value) =>
                              handleUpdateAiSelectedProduct(
                                selectedProduct.slug,
                                "contactLabel",
                                value
                              )
                            }
                            placeholder="Contoh: Chat Admin"
                          />
                          <Field
                            label="URL Kontak Tambahan"
                            value={selectedProduct.contactUrl}
                            onChange={(value) =>
                              handleUpdateAiSelectedProduct(
                                selectedProduct.slug,
                                "contactUrl",
                                value
                              )
                            }
                            placeholder="https://wa.me/62812xxxx atau https://t.me/..."
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dark-800 bg-dark-900/70 px-4 py-6 text-sm text-dark-400">
                  Belum ada produk dipilih. Centang produk yang ingin dimunculkan dengan gambar di artikel.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <button
          onClick={handleGenerateWithAI}
          disabled={generating}
          className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-5 py-3 font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60"
        >
          <FaMagic />
          {generating ? "Membuat artikel..." : "Generate Artikel AI"}
        </button>
      </section>

      <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10 text-accent-300">
            <FaNewspaper />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Pengaturan Automasi Artikel</h2>
            <p className="text-sm text-dark-400">
              Scheduler ini bekerja lewat hit ke route cron. Cocok untuk Coolify, cron server, atau worker eksternal.
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dark-800 bg-dark-950/60 px-4 py-4">
          <div>
            <div className="text-sm font-semibold text-white">
              Generate Isian Strategi dengan AI
            </div>
            <div className="mt-1 text-sm text-dark-400">
              AI akan memakai `Topik Queue` sebagai patokan utama, lalu merapikan `Target Keywords`, `Konteks Bisnis`, dan `Avoid Topics`.
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerateAutomationSuggestions}
            disabled={generatingAutomationSuggestions}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaMagic />
            {generatingAutomationSuggestions ? "Menganalisa..." : "Generate"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ToggleField
            label="Aktifkan automasi artikel"
            checked={Boolean(automationSettings.automation_enabled)}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                automation_enabled: value,
              }))
            }
          />
          <ToggleField
            label="Auto publish hasil jadwal"
            checked={Boolean(automationSettings.auto_publish)}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                auto_publish: value,
              }))
            }
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Interval Jam"
            type="number"
            value={String(automationSettings.schedule_interval_hours || 24)}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                schedule_interval_hours: Number(value) || 24,
              }))
            }
          />
          <Field
            label="Artikel per Run"
            type="number"
            value={String(automationSettings.articles_per_run || 1)}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                articles_per_run: Number(value) || 1,
              }))
            }
          />
          <Field
            label="Penulis Default"
            value={automationSettings.default_author_name || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                default_author_name: value,
              }))
            }
          />
          <Field
            label="Last Run"
            value={
              automationSettings.last_run_at
                ? formatDate(automationSettings.last_run_at)
                : "Belum pernah"
            }
            disabled
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label="Link Internal Utama"
            value={automationSettings.internal_link_url || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                internal_link_url: value,
              }))
            }
            placeholder="/produk"
          />
          <Field
            label="Anchor Link Internal"
            value={automationSettings.internal_link_anchor || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                internal_link_anchor: value,
              }))
            }
            placeholder="Lihat koleksi produk digital kami"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextAreaField
            label="Target Keywords"
            value={automationSettings.target_keywords || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                target_keywords: value,
              }))
            }
            rows={4}
            placeholder="seo, bisnis online, template, tools marketing"
          />
          <TextAreaField
            label="Topik Queue"
            value={automationSettings.topic_queue || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                topic_queue: value,
              }))
            }
            rows={4}
            placeholder={"Satu topik per baris\nCara optimasi landing page\nStrategi SEO produk digital"}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <TextAreaField
            label="Konteks Bisnis"
            value={automationSettings.site_context || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                site_context: value,
              }))
            }
            rows={5}
          />
          <TextAreaField
            label="Avoid Topics"
            value={automationSettings.avoid_topics || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                avoid_topics: value,
              }))
            }
            rows={5}
            placeholder="contoh: judi, politik, isu sensitif"
          />
        </div>

        <div className="mt-5">
          <TextAreaField
            label="Prompt Template AI"
            value={automationSettings.prompt_template || ""}
            onChange={(value) =>
              setAutomationSettings((current) => ({
                ...current,
                prompt_template: value,
              }))
            }
            rows={14}
          />
        </div>

        <div className="mt-5 rounded-xl border border-dark-800 bg-dark-950/70 p-4 text-sm text-dark-300">
          Cron URL: <span className="font-mono text-primary-300">/api/cron/articles</span>
        </div>

        <button
          onClick={handleSaveAutomationSettings}
          disabled={savingAutomation}
          className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-5 py-3 font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60"
        >
          <FaSave />
          {savingAutomation ? "Menyimpan..." : "Simpan Pengaturan Automasi"}
        </button>
      </section>

      <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Daftar Artikel</h2>
            <p className="text-sm text-dark-400">
              Artikel ini tidak muncul di homepage/nav utama, tapi tetap bisa dipakai untuk ranking Google.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-dark-400">Memuat artikel...</div>
        ) : articles.length === 0 ? (
          <div className="rounded-xl border border-dark-800 bg-dark-950/70 px-4 py-10 text-center text-dark-400">
            Belum ada artikel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-850">
                  <th className="px-4 py-3 text-left text-dark-400">Judul</th>
                  <th className="px-4 py-3 text-left text-dark-400">Slug</th>
                  <th className="px-4 py-3 text-left text-dark-400">Status</th>
                  <th className="px-4 py-3 text-left text-dark-400">Tanggal</th>
                  <th className="px-4 py-3 text-right text-dark-400">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    className="border-b border-dark-800 hover:bg-dark-800/40"
                  >
                    <td className="px-4 py-3 text-white">
                      <div className="font-medium">{article.title}</div>
                      {article.focus_keyword ? (
                        <div className="mt-1 text-xs text-dark-500">
                          {article.focus_keyword}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-dark-400">
                      /artikel/{article.slug}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${getStatusColor(
                          article.status
                        )}`}
                      >
                        {getStatusLabel(article.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dark-400">
                      {formatDate(article.published_at || article.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/artikel/${article.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg px-2.5 py-2 text-dark-400 transition hover:bg-emerald-500/10 hover:text-emerald-400"
                          title="Lihat artikel"
                        >
                          <FaExternalLinkAlt size={13} />
                        </a>
                        <button
                          onClick={() => startEdit(article)}
                          className="rounded-lg p-2 text-dark-400 transition hover:bg-primary-500/10 hover:text-primary-300"
                        >
                          <FaEdit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteArticle(article.id)}
                          className="rounded-lg p-2 text-dark-400 transition hover:bg-red-500/10 hover:text-red-400"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function mapArticleToForm(article: Article): ArticleFormState {
  return {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt || "",
    content_html: article.content_html || "",
    cover_image: article.cover_image || "",
    status: article.status,
    seo_title: article.seo_title || "",
    seo_description: article.seo_description || "",
    focus_keyword: article.focus_keyword || "",
    author_name: article.author_name || "",
    canonical_url: article.canonical_url || "",
    tags_input: article.tags.join(", "),
    published_at: toDateTimeLocalValue(article.published_at),
  };
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-dark-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-white outline-none transition focus:border-primary-500/50 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-dark-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-white outline-none transition focus:border-primary-500/50 resize-y"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-dark-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-white outline-none transition focus:border-primary-500/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-dark-700 bg-dark-800 px-4 py-3">
      <span className="text-sm text-dark-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function insertTextAtCursor(
  currentValue: string,
  nextText: string,
  textarea: HTMLTextAreaElement | null
) {
  if (!textarea) {
    return `${currentValue}${nextText}`;
  }

  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;

  return `${currentValue.slice(0, start)}${nextText}${currentValue.slice(end)}`;
}

function inferRecommendationLinkTarget(
  product: ProductRecommendationOption | undefined
): ProductRecommendationLinkTarget {
  if (getRecommendationPage(product)?.slug) {
    return "landing";
  }

  if (product?.click_target_type === "checkout") {
    return "order";
  }

  return "product";
}

function getRecommendationPreviewPath(
  product: ProductRecommendationOption,
  linkTarget: ProductRecommendationLinkTarget
) {
  if (linkTarget === "order") {
    return `/order/${product.slug}`;
  }

  const relatedPage = getRecommendationPage(product);

  if (linkTarget === "landing" && relatedPage?.slug) {
    return `/${relatedPage.slug}`;
  }

  return `/produk/${product.slug}`;
}

function getRecommendationPage(product: ProductRecommendationOption | undefined) {
  const relation = product?.click_target_page;

  if (Array.isArray(relation)) {
    return relation[0] || null;
  }

  return relation || null;
}

function getRecommendationStyleLabel(style: ProductRecommendationStyle) {
  return (
    PRODUCT_RECOMMENDATION_STYLE_OPTIONS.find((option) => option.value === style)
      ?.label || style
  );
}

function getRecommendationLinkLabel(linkTarget: ProductRecommendationLinkTarget) {
  return (
    PRODUCT_RECOMMENDATION_LINK_OPTIONS.find(
      (option) => option.value === linkTarget
    )?.label || linkTarget
  );
}

function getFirstTopicFromQueue(topicQueue: string | null | undefined) {
  return (topicQueue || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean) || "";
}
