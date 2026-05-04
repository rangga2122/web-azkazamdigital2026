alter table public.products
  drop constraint if exists products_click_target_type_check;

alter table public.products
  add constraint products_click_target_type_check
  check (click_target_type in ('cms_page', 'checkout', 'custom_url'));
