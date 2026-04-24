alter table public.affiliates
  add column if not exists payout_account_number text;
