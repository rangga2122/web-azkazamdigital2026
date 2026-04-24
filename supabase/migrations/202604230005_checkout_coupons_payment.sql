alter table public.site_settings
  add column if not exists hide_checkout_chrome boolean not null default true,
  add column if not exists hide_thank_you_chrome boolean not null default true,
  add column if not exists checkout_coupon_enabled boolean not null default true,
  add column if not exists checkout_notes_enabled boolean not null default true,
  add column if not exists payment_bank_name text,
  add column if not exists payment_account_number text,
  add column if not exists payment_account_name text,
  add column if not exists payment_qris_url text;

update public.site_settings
set
  payment_bank_name = coalesce(payment_bank_name, 'BCA'),
  payment_account_number = coalesce(payment_account_number, '7891502145'),
  payment_account_name = coalesce(payment_account_name, 'ASNIDAR NUR'),
  payment_qris_url = coalesce(payment_qris_url, '/qris.webp');

alter table public.orders
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists unique_code int not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0;

update public.orders
set
  subtotal = case when subtotal = 0 then price else subtotal end,
  total_amount = case when total_amount = 0 then price else total_amount end;

create table if not exists public.coupon_codes (
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

create index if not exists coupon_codes_code_idx on public.coupon_codes(code);

drop trigger if exists coupon_codes_updated_at on public.coupon_codes;
create trigger coupon_codes_updated_at
  before update on public.coupon_codes
  for each row execute function public.set_updated_at();

alter table public.coupon_codes enable row level security;

drop policy if exists "admins full access coupons" on public.coupon_codes;
create policy "admins full access coupons" on public.coupon_codes
  for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists "active coupons readable" on public.coupon_codes;
create policy "active coupons readable" on public.coupon_codes
  for select using (is_active = true or public.current_user_is_admin());
