alter table public.pages
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists hide_header_footer boolean not null default false;

create index if not exists pages_product_id_idx on public.pages(product_id);
