import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  extractProductRecommendationTokens,
  replaceProductRecommendationShortcodes,
  type ProductRecommendationSource,
} from "@/lib/article-product-recommendations";
import { sanitizePublicMediaUrl } from "@/lib/legacy-media";
import { absoluteUrl } from "@/lib/site-url";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDate, sanitizeHtml } from "@/lib/utils";
import type { Article } from "@/types";

export const revalidate = 300;

const getCachedArticle = unstable_cache(
  async (slug: string) => {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    return (data || null) as Article | null;
  },
  ["public-article"],
  { revalidate: 300, tags: ["public-articles"] }
);

async function getArticle(slug: string) {
  return getCachedArticle(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return {
      title: "Artikel Tidak Ditemukan",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const canonical = article.canonical_url || `/artikel/${article.slug}`;
  const image = sanitizePublicMediaUrl(article.cover_image) || "/icon.png";

  return {
    title: article.seo_title || article.title,
    description: article.seo_description || article.excerpt,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      url: canonical,
      title: article.seo_title || article.title,
      description: article.seo_description || article.excerpt,
      publishedTime: article.published_at || article.created_at,
      modifiedTime: article.updated_at,
      authors: article.author_name ? [article.author_name] : undefined,
      tags: article.tags,
      images: [{ url: image, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.seo_title || article.title,
      description: article.seo_description || article.excerpt,
      images: [image],
    },
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  const renderedArticleContent = await renderArticleContent(article.content_html);
  const canonical = absoluteUrl(article.canonical_url || `/artikel/${article.slug}`);
  const image = absoluteUrl(
    sanitizePublicMediaUrl(article.cover_image) || "/icon.png"
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.seo_description || article.excerpt,
    image: [image],
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at,
    author: article.author_name
      ? {
          "@type": "Person",
          name: article.author_name,
        }
      : {
          "@type": "Organization",
          name: "AzkazamDigital",
        },
    mainEntityOfPage: canonical,
    keywords: article.tags.join(", "),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Artikel",
        item: absoluteUrl("/artikel"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: article.title,
        item: canonical,
      },
    ],
  };

  return (
    <div className="min-h-screen py-12 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-sm text-dark-400">
          <Link href="/artikel" className="transition-colors hover:text-primary-300">
            Artikel
          </Link>
          <span className="px-2">/</span>
          <span>{article.title}</span>
        </div>

        <article className="overflow-hidden rounded-[2rem] border border-dark-800 bg-dark-900/95">
          {sanitizePublicMediaUrl(article.cover_image) ? (
            <img
              src={sanitizePublicMediaUrl(article.cover_image) || "/icon.png"}
              alt={article.title}
              className="h-auto max-h-[420px] w-full object-cover"
            />
          ) : null}

          <div className="p-6 sm:p-10">
            <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-dark-400">
              <span>{formatDate(article.published_at || article.created_at)}</span>
              {article.author_name ? <span>&bull; {article.author_name}</span> : null}
              {article.focus_keyword ? (
                <span className="rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs text-primary-300">
                  {article.focus_keyword}
                </span>
              ) : null}
            </div>

            <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
              {article.title}
            </h1>

            {article.excerpt ? (
              <p className="mt-5 text-lg leading-8 text-dark-300">
                {article.excerpt}
              </p>
            ) : null}

            {article.tags.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-dark-700 px-3 py-1 text-xs text-dark-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div
              className="cms-content mt-10 rounded-[1.75rem] border border-dark-800 bg-dark-950/70 p-6 sm:p-8"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedArticleContent) }}
            />

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-dark-800 bg-dark-950/60 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-white">
                  Ingin lihat produk terkait?
                </div>
                <div className="text-sm text-dark-400">
                  Jelajahi koleksi produk digital dan landing page kami.
                </div>
              </div>
              <Link
                href="/produk"
                className="rounded-full bg-gradient-to-r from-primary-600 to-accent-600 px-5 py-3 text-sm font-semibold text-white transition hover:scale-[1.02]"
              >
                Lihat Produk
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

async function renderArticleContent(contentHtml: string) {
  const tokens = extractProductRecommendationTokens(contentHtml);
  if (tokens.length === 0) {
    return contentHtml;
  }

  const slugs = Array.from(new Set(tokens.map((token) => token.slug)));
  const supabase = await createServiceRoleClient();
  const { data: products } = await supabase
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
    .in("slug", slugs)
    .eq("is_active", true);

  const productsBySlug = ((products || []) as Array<
    ProductRecommendationSource & {
      is_active: boolean;
      click_target_page?: { slug: string } | Array<{ slug: string }> | null;
    }
  >).reduce<Record<string, ProductRecommendationSource>>((accumulator, product) => {
    accumulator[product.slug] = {
      title: product.title,
      slug: product.slug,
      thumbnail_url: product.thumbnail_url,
      short_description: product.short_description,
      click_target_type: product.click_target_type,
      click_target_page_slug: getRelatedPageSlug(product.click_target_page),
    };
    return accumulator;
  }, {});

  return replaceProductRecommendationShortcodes(contentHtml, productsBySlug);
}

function getRelatedPageSlug(
  relation: { slug: string } | Array<{ slug: string }> | null | undefined
) {
  if (Array.isArray(relation)) {
    return relation[0]?.slug || null;
  }

  return relation?.slug || null;
}
