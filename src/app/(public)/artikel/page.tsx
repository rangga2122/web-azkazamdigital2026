import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Article } from "@/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Artikel",
  description:
    "Artikel dan panduan SEO seputar produk digital, bisnis online, dan strategi pemasaran digital.",
  openGraph: {
    title: "Artikel",
    description:
      "Artikel dan panduan SEO seputar produk digital, bisnis online, dan strategi pemasaran digital.",
  },
};

async function getPublishedArticles() {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(48);

    return (data || []) as Article[];
  } catch {
    return [];
  }
}

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="min-h-screen py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-primary-300">
            Knowledge Hub
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-5xl">
            Artikel SEO & Bisnis Digital
          </h1>
          <p className="mt-4 text-base leading-7 text-dark-300 sm:text-lg">
            Kumpulan artikel untuk membantu pertumbuhan trafik organik, pemasaran
            digital, dan penjualan produk digital secara lebih terstruktur.
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="rounded-3xl border border-dark-800 bg-dark-900 p-10 text-center text-dark-400">
            Belum ada artikel yang dipublikasikan.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <article
                key={article.id}
                className="group flex h-full flex-col overflow-hidden rounded-3xl border border-dark-800 bg-dark-900/95 transition-all hover:-translate-y-1 hover:border-dark-700"
              >
                {article.cover_image ? (
                  <img
                    src={article.cover_image}
                    alt={article.title}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="h-48 bg-[radial-gradient(circle_at_top_left,#38bdf8,transparent_45%),linear-gradient(135deg,#111827,#0f172a_45%,#1d4ed8)]" />
                )}

                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-dark-400">
                    <span>{formatDate(article.published_at || article.created_at)}</span>
                    {article.author_name ? <span>• {article.author_name}</span> : null}
                  </div>

                  <h2 className="text-xl font-semibold leading-tight text-white transition-colors group-hover:text-primary-300">
                    <Link href={`/artikel/${article.slug}`}>{article.title}</Link>
                  </h2>

                  <p className="mt-3 flex-1 text-sm leading-7 text-dark-300">
                    {article.excerpt}
                  </p>

                  {article.tags.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {article.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs text-primary-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <Link
                      href={`/artikel/${article.slug}`}
                      className="inline-flex items-center rounded-full border border-dark-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-primary-500/50 hover:text-primary-300"
                    >
                      Baca artikel
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
