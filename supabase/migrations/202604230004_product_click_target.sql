alter table public.products
  add column if not exists click_target_type text not null default 'checkout',
  add column if not exists click_target_page_id uuid references public.pages(id) on delete set null;

alter table public.products
  drop constraint if exists products_click_target_type_check;

alter table public.products
  add constraint products_click_target_type_check
  check (click_target_type in ('cms_page', 'checkout', 'custom_url'));

create index if not exists products_click_target_page_id_idx
  on public.products(click_target_page_id);
