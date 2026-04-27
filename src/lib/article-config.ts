export const DEFAULT_ARTICLE_PROMPT_TEMPLATE = `Buat artikel SEO berbahasa Indonesia yang natural, helpful, dan berorientasi search intent.

Konteks situs:
- Nama situs: {{SITE_NAME}}
- Deskripsi situs: {{SITE_DESCRIPTION}}
- Konteks bisnis: {{SITE_CONTEXT}}
- Kata kunci target umum: {{TARGET_KEYWORDS}}
- Topik utama artikel: {{TOPIC}}
- Fokus keyword prioritas: {{FOCUS_KEYWORD}}
- Link internal utama: {{INTERNAL_LINK_URL}}
- Anchor internal link: {{INTERNAL_LINK_ANCHOR}}
- Nama penulis: {{AUTHOR_NAME}}

Persyaratan artikel:
- Fokus pada kualitas, pengalaman nyata, dan manfaat praktis.
- Gunakan sudut pandang yang relevan untuk calon pembeli produk digital.
- Hindari keyword stuffing.
- Buat judul yang kuat dan layak klik.
- Buat excerpt singkat yang menarik.
- Buat SEO title dan SEO description yang natural.
- Isi artikel minimal 900 kata.
- Gunakan HTML semantik tanpa <html>, <head>, <body>, tanpa script, tanpa style inline.
- Jangan gunakan tag <h1> karena judul utama dirender terpisah.
- Gunakan beberapa <h2> dan bila perlu <h3>.
- Jika relevan, sisipkan 1 link internal ke {{INTERNAL_LINK_URL}} dengan anchor {{INTERNAL_LINK_ANCHOR}}.
- Tutup artikel dengan CTA yang halus, bukan hard selling.

Kembalikan HANYA JSON valid dengan struktur:
{
  "title": "string",
  "slug": "string-kebab-case",
  "excerpt": "string",
  "focusKeyword": "string",
  "seoTitle": "string",
  "seoDescription": "string",
  "authorName": "string",
  "tags": ["tag-1", "tag-2"],
  "contentHtml": "<p>...</p>"
}`;

export const DEFAULT_ARTICLE_AUTOMATION_SETTINGS = {
  automation_enabled: false,
  auto_publish: false,
  schedule_interval_hours: 24,
  articles_per_run: 1,
  queue_cursor: 0,
  default_author_name: "Tim AzkazamDigital",
  site_context:
    "Menjual produk digital, tools, template, kursus, ebook, dan aset pemasaran digital untuk audiens Indonesia.",
  prompt_template: DEFAULT_ARTICLE_PROMPT_TEMPLATE,
  topic_queue: "",
  target_keywords:
    "produk digital, template premium, tools marketing, strategi SEO, bisnis online, affiliate marketing",
  avoid_topics: "",
  internal_link_url: "/produk",
  internal_link_anchor: "Lihat koleksi produk digital kami",
} as const;

export function parseTopicQueue(queue: string | null | undefined) {
  return (queue || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
