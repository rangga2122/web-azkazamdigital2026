create extension if not exists "pgcrypto";

create type public.user_role as enum ('super_admin', 'admin', 'affiliate', 'user');
create type public.publish_status as enum ('draft', 'published');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled');
create type public.affiliate_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.commission_status as enum ('pending', 'approved', 'paid', 'rejected');

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table public.users_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.user_role not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  site_name text not null default 'AZKAZAM Digital',
  logo_url text,
  favicon_url text,
  description text,
  whatsapp_number text,
  email text,
  address text,
  social_links jsonb not null default '{}'::jsonb,
  hero_title text,
  hero_subtitle text,
  primary_cta_label text,
  primary_cta_url text,
  footer_text text,
  custom_head_script text,
  custom_body_script text,
  pixel_enabled boolean not null default false,
  facebook_pixel_id text,
  custom_meta_script text,
  custom_tracking_script text,
  whatsapp_button_enabled boolean not null default true,
  hide_checkout_chrome boolean not null default true,
  hide_thank_you_chrome boolean not null default true,
  checkout_coupon_enabled boolean not null default true,
  checkout_notes_enabled boolean not null default true,
  payment_bank_name text,
  payment_account_number text,
  payment_account_name text,
  payment_qris_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content_html text not null default '',
  status public.publish_status not null default 'draft',
  product_id uuid references public.products(id) on delete set null,
  hide_header_footer boolean not null default false,
  seo_title text,
  seo_description text,
  featured_image text,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.articles (
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

create table public.article_automation_settings (
  id uuid primary key default gen_random_uuid(),
  automation_enabled boolean not null default false,
  auto_publish boolean not null default false,
  schedule_interval_hours int not null default 24,
  articles_per_run int not null default 1,
  queue_cursor int not null default 0,
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

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  thumbnail_url text,
  banner_url text,
  short_description text,
  description_html text not null default '',
  landing_page_mode text not null default 'default' check (landing_page_mode in ('default', 'custom_html')),
  landing_page_html text not null default '',
  click_target_type text not null default 'checkout' check (click_target_type in ('cms_page', 'checkout', 'custom_url')),
  click_target_page_id uuid references public.pages(id) on delete set null,
  price numeric(14,2) not null default 0,
  affiliate_commission_rate numeric(5,2) not null default 30.00 check (affiliate_commission_rate >= 0 and affiliate_commission_rate <= 100),
  compare_at_price numeric(14,2),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  purchase_url text,
  checkout_url text,
  demo_url text,
  digital_file_url text,
  badge text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  quote text not null,
  avatar_url text,
  rating int not null default 5 check (rating between 1 and 5),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  whatsapp text,
  referral_code text not null unique,
  status public.affiliate_status not null default 'pending',
  commission_rate numeric(5,2) not null default 30.00,
  qualifying_order_id uuid references public.orders(id) on delete set null,
  approved_at timestamptz,
  payout_method text,
  payout_account_number text,
  payout_account text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  referral_code text not null,
  target_url text not null,
  clicks_count int not null default 0,
  conversions_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliates(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  referral_code text,
  landing_path text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  product_id uuid references public.products(id) on delete set null,
  affiliate_id uuid references public.affiliates(id) on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  buyer_whatsapp text not null,
  product_name text not null,
  price numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  unique_code int not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  coupon_code text,
  referral_code text,
  status public.order_status not null default 'pending',
  tracking_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  affiliate_id uuid references public.affiliates(id) on delete set null,
  amount numeric(14,2) not null default 0,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliates(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  referral_code text,
  conversion_type text not null default 'lead',
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.coupon_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  discount_type text not null default 'fixed' check (discount_type in ('fixed', 'percent')),
  discount_value numeric(14,2) not null default 0,
  is_active boolean not null default true,
  usage_limit int,
  usage_count int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  referral_code text,
  amount numeric(14,2) not null default 0,
  rate numeric(5,2) not null default 0,
  status public.commission_status not null default 'pending',
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  folder text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index pages_slug_idx on public.pages(slug);
create index articles_slug_idx on public.articles(slug);
create index articles_status_published_at_idx on public.articles(status, published_at desc nulls last);
create index products_slug_idx on public.products(slug);
create index categories_slug_idx on public.categories(slug);
create index orders_code_idx on public.orders(order_code);
create index affiliates_referral_code_idx on public.affiliates(referral_code);
create index affiliate_clicks_referral_idx on public.affiliate_clicks(referral_code, created_at desc);
create unique index affiliate_links_affiliate_product_uidx on public.affiliate_links(affiliate_id, product_id) where product_id is not null;
create index affiliate_links_referral_product_idx on public.affiliate_links(referral_code, product_id);
create index coupon_codes_code_idx on public.coupon_codes(code);

create trigger users_profiles_updated_at before update on public.users_profiles for each row execute function public.set_updated_at();
create trigger admins_updated_at before update on public.admins for each row execute function public.set_updated_at();
create trigger site_settings_updated_at before update on public.site_settings for each row execute function public.set_updated_at();
create trigger pages_updated_at before update on public.pages for each row execute function public.set_updated_at();
create trigger articles_updated_at before update on public.articles for each row execute function public.set_updated_at();
create trigger article_automation_settings_updated_at before update on public.article_automation_settings for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger testimonials_updated_at before update on public.testimonials for each row execute function public.set_updated_at();
create trigger faqs_updated_at before update on public.faqs for each row execute function public.set_updated_at();
create trigger affiliates_updated_at before update on public.affiliates for each row execute function public.set_updated_at();
create trigger affiliate_links_updated_at before update on public.affiliate_links for each row execute function public.set_updated_at();
create trigger affiliate_links_sync_from_affiliates after insert or update of referral_code on public.affiliates for each row execute function public.handle_affiliate_link_sync_on_affiliate();
create trigger affiliate_links_sync_from_products after insert or update of slug, is_active on public.products for each row execute function public.handle_affiliate_link_sync_on_product();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger commissions_updated_at before update on public.commissions for each row execute function public.set_updated_at();
create trigger coupon_codes_updated_at before update on public.coupon_codes for each row execute function public.set_updated_at();

alter table public.users_profiles enable row level security;
alter table public.admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.pages enable row level security;
alter table public.articles enable row level security;
alter table public.article_automation_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.testimonials enable row level security;
alter table public.faqs enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.orders enable row level security;
alter table public.sales enable row level security;
alter table public.affiliate_conversions enable row level security;
alter table public.commissions enable row level security;
alter table public.media_files enable row level security;
alter table public.coupon_codes enable row level security;

create or replace function public.current_user_is_admin()
returns boolean as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid()
      and is_active = true
      and role in ('super_admin', 'admin')
  );
$$ language sql stable security definer;

create or replace function public.current_affiliate_id()
returns uuid as $$
  select id from public.affiliates
  where user_id = auth.uid()
  limit 1;
$$ language sql stable security definer;

create or replace function public.sync_affiliate_links_for_affiliate(p_affiliate_id uuid)
returns void as $$
declare
  aff record;
begin
  select id, referral_code
    into aff
  from public.affiliates
  where id = p_affiliate_id;

  if not found or aff.referral_code is null then
    return;
  end if;

  insert into public.affiliate_links (
    affiliate_id,
    product_id,
    referral_code,
    target_url,
    clicks_count,
    conversions_count
  )
  select
    aff.id,
    p.id,
    aff.referral_code,
    '/produk/' || p.slug || '?ref=' || aff.referral_code,
    0,
    0
  from public.products p
  where p.is_active = true
  on conflict (affiliate_id, product_id) where product_id is not null
  do update
    set referral_code = excluded.referral_code,
        target_url = excluded.target_url,
        updated_at = now();

  delete from public.affiliate_links l
  where l.affiliate_id = aff.id
    and l.product_id in (
      select id from public.products where is_active = false
    );
end;
$$ language plpgsql security definer;

create or replace function public.sync_affiliate_links_for_product(p_product_id uuid)
returns void as $$
declare
  prod record;
begin
  select id, slug, is_active
    into prod
  from public.products
  where id = p_product_id;

  if not found then
    return;
  end if;

  if prod.is_active is not true then
    delete from public.affiliate_links where product_id = p_product_id;
    return;
  end if;

  insert into public.affiliate_links (
    affiliate_id,
    product_id,
    referral_code,
    target_url,
    clicks_count,
    conversions_count
  )
  select
    a.id,
    prod.id,
    a.referral_code,
    '/produk/' || prod.slug || '?ref=' || a.referral_code,
    0,
    0
  from public.affiliates a
  where a.referral_code is not null
  on conflict (affiliate_id, product_id) where product_id is not null
  do update
    set referral_code = excluded.referral_code,
        target_url = excluded.target_url,
        updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function public.handle_affiliate_link_sync_on_affiliate()
returns trigger as $$
begin
  perform public.sync_affiliate_links_for_affiliate(new.id);
  return new;
end;
$$ language plpgsql;

create or replace function public.handle_affiliate_link_sync_on_product()
returns trigger as $$
begin
  perform public.sync_affiliate_links_for_product(new.id);
  return new;
end;
$$ language plpgsql;

create policy "admins can read own admin row" on public.admins
  for select using (user_id = auth.uid() or public.current_user_is_admin());

create policy "published pages are readable" on public.pages for select using (status = 'published' or public.current_user_is_admin());
create policy "published articles are readable" on public.articles for select using (status = 'published' or public.current_user_is_admin());
create policy "public catalog readable" on public.products for select using (is_active = true or public.current_user_is_admin());
create policy "public categories readable" on public.categories for select using (true);
create policy "public testimonials readable" on public.testimonials for select using (is_active = true or public.current_user_is_admin());
create policy "public faqs readable" on public.faqs for select using (is_active = true or public.current_user_is_admin());
create policy "public settings readable" on public.site_settings for select using (true);
create policy "admins full access pages" on public.pages for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access articles" on public.articles for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access article automation settings" on public.article_automation_settings for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access products" on public.products for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access categories" on public.categories for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access product categories" on public.product_categories for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access site settings" on public.site_settings for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access testimonials" on public.testimonials for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access faqs" on public.faqs for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access business data" on public.orders for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access affiliates" on public.affiliates for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access affiliate links" on public.affiliate_links for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access clicks" on public.affiliate_clicks for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access conversions" on public.affiliate_conversions for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access commissions" on public.commissions for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access sales" on public.sales for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access media" on public.media_files for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins full access coupons" on public.coupon_codes for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "active coupons readable" on public.coupon_codes for select using (is_active = true or public.current_user_is_admin());

create policy "orders insert from public" on public.orders for insert with check (true);
create policy "clicks insert from public" on public.affiliate_clicks for insert with check (true);
create policy "conversions insert from public" on public.affiliate_conversions for insert with check (true);
create policy "affiliate own profile" on public.affiliates for select using (id = public.current_affiliate_id() or public.current_user_is_admin());
create policy "affiliate own links" on public.affiliate_links for select using (affiliate_id = public.current_affiliate_id() or public.current_user_is_admin());
create policy "affiliate own clicks" on public.affiliate_clicks for select using (affiliate_id = public.current_affiliate_id() or public.current_user_is_admin());
create policy "affiliate own conversions" on public.affiliate_conversions for select using (affiliate_id = public.current_affiliate_id() or public.current_user_is_admin());
create policy "affiliate own commissions" on public.commissions for select using (affiliate_id = public.current_affiliate_id() or public.current_user_is_admin());

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
