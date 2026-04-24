alter table public.products
  add column if not exists affiliate_commission_rate numeric(5,2) not null default 30.00;

alter table public.products
  drop constraint if exists products_affiliate_commission_rate_check;

alter table public.products
  add constraint products_affiliate_commission_rate_check
  check (affiliate_commission_rate >= 0 and affiliate_commission_rate <= 100);

alter table public.affiliates
  add column if not exists qualifying_order_id uuid references public.orders(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.commissions
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists referral_code text;

create unique index if not exists affiliate_links_affiliate_product_uidx
  on public.affiliate_links(affiliate_id, product_id)
  where product_id is not null;

create index if not exists affiliate_links_referral_product_idx
  on public.affiliate_links(referral_code, product_id);

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

drop trigger if exists affiliate_links_sync_from_affiliates on public.affiliates;
create trigger affiliate_links_sync_from_affiliates
after insert or update of referral_code
on public.affiliates
for each row
execute function public.handle_affiliate_link_sync_on_affiliate();

drop trigger if exists affiliate_links_sync_from_products on public.products;
create trigger affiliate_links_sync_from_products
after insert or update of slug, is_active
on public.products
for each row
execute function public.handle_affiliate_link_sync_on_product();

update public.products
set affiliate_commission_rate = coalesce(affiliate_commission_rate, 30.00)
where affiliate_commission_rate is distinct from coalesce(affiliate_commission_rate, 30.00);

do $$
declare
  aff record;
  prod record;
begin
  for aff in select id from public.affiliates loop
    perform public.sync_affiliate_links_for_affiliate(aff.id);
  end loop;

  for prod in select id from public.products loop
    perform public.sync_affiliate_links_for_product(prod.id);
  end loop;
end $$;
