create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content_html text not null default '',
  cover_image text,
  status public.publish_status not null default 'draft',
  seo_title text,
  seo_description text,
  focus_keyword text,
  author_name text,
  canonical_url text,
  tags text[] not null default '{}'::text[],
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.article_automation_settings (
  id uuid primary key default gen_random_uuid(),
  automation_enabled boolean not null default false,
  auto_publish boolean not null default false,
  schedule_interval_hours int not null default 24,
  articles_per_run int not null default 1,
  last_run_at timestamptz,
  default_author_name text not null default 'Tim AzkazamDigital',
  site_context text not null default 'Menjual produk digital, tools, template, kursus, ebook, dan aset pemasaran digital untuk audiens Indonesia.',
  prompt_template text not null,
  topic_queue text not null default '',
  target_keywords text not null default 'produk digital, template premium, tools marketing, strategi SEO, bisnis online',
  avoid_topics text not null default '',
  internal_link_url text not null default '/produk',
  internal_link_anchor text not null default 'Lihat koleksi produk digital kami',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_slug_idx on public.articles(slug);
create index if not exists articles_status_published_at_idx
  on public.articles(status, published_at desc nulls last);

drop trigger if exists articles_updated_at on public.articles;
create trigger articles_updated_at
before update on public.articles
for each row execute function public.set_updated_at();

drop trigger if exists article_automation_settings_updated_at on public.article_automation_settings;
create trigger article_automation_settings_updated_at
before update on public.article_automation_settings
for each row execute function public.set_updated_at();

alter table public.articles enable row level security;
alter table public.article_automation_settings enable row level security;

drop policy if exists "published articles are readable" on public.articles;
create policy "published articles are readable" on public.articles
for select using (status = 'published' or public.current_user_is_admin());

drop policy if exists "admins full access articles" on public.articles;
create policy "admins full access articles" on public.articles
for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists "admins full access article automation settings" on public.article_automation_settings;
create policy "admins full access article automation settings" on public.article_automation_settings
for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());

insert into public.article_automation_settings (
  prompt_template
)
select
  'Buat artikel SEO berbahasa Indonesia yang natural, helpful, dan berorientasi search intent.

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
}'
where not exists (
  select 1 from public.article_automation_settings
);
