create table if not exists public.license_product_catalog_syncs (
  id uuid primary key default gen_random_uuid(),
  license_product_id bigint not null unique,
  license_product_name text not null,
  catalog_product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists license_product_catalog_syncs_license_product_uidx
  on public.license_product_catalog_syncs(license_product_id);

create index if not exists license_product_catalog_syncs_catalog_product_idx
  on public.license_product_catalog_syncs(catalog_product_id);

drop trigger if exists license_product_catalog_syncs_updated_at on public.license_product_catalog_syncs;
create trigger license_product_catalog_syncs_updated_at
before update on public.license_product_catalog_syncs
for each row execute function public.set_updated_at();

alter table public.license_product_catalog_syncs enable row level security;

drop policy if exists "admins full access license product catalog syncs" on public.license_product_catalog_syncs;
create policy "admins full access license product catalog syncs"
on public.license_product_catalog_syncs
for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());
