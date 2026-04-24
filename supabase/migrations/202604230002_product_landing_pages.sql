alter table public.products
  add column if not exists landing_page_mode text not null default 'default',
  add column if not exists landing_page_html text not null default '';

alter table public.products
  drop constraint if exists products_landing_page_mode_check;

alter table public.products
  add constraint products_landing_page_mode_check
  check (landing_page_mode in ('default', 'custom_html'));

update public.products
set landing_page_mode = 'default'
where landing_page_mode is null
   or landing_page_mode not in ('default', 'custom_html');

update public.products
set landing_page_html = ''
where landing_page_html is null;
