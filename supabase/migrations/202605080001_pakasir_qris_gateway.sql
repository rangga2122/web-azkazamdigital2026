alter table public.site_settings
  add column if not exists pakasir_enabled boolean not null default false,
  add column if not exists pakasir_mode text not null default 'sandbox',
  add column if not exists pakasir_project_slug text,
  add column if not exists pakasir_api_key text,
  add column if not exists pakasir_webhook_url text;

alter table public.site_settings
  drop constraint if exists site_settings_pakasir_mode_check;

alter table public.site_settings
  add constraint site_settings_pakasir_mode_check
  check (pakasir_mode in ('sandbox', 'live'));

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_method text,
  add column if not exists gateway_status text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_amount numeric(14,2),
  add column if not exists gateway_fee numeric(14,2),
  add column if not exists gateway_total_payment numeric(14,2),
  add column if not exists gateway_payment_number text,
  add column if not exists gateway_expired_at timestamptz,
  add column if not exists gateway_completed_at timestamptz,
  add column if not exists gateway_payload jsonb;
