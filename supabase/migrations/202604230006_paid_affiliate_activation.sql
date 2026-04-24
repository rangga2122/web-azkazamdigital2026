alter table public.products
  add column if not exists affiliate_commission_type text not null default 'percent',
  add column if not exists affiliate_commission_amount numeric(14,2) not null default 0;

alter table public.products
  drop constraint if exists products_affiliate_commission_type_check;

alter table public.products
  add constraint products_affiliate_commission_type_check
  check (affiliate_commission_type in ('percent', 'fixed'));

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_status_idx
  on public.orders(user_id, status, created_at desc);

create index if not exists orders_buyer_email_status_idx
  on public.orders(lower(buyer_email), status, created_at desc);

create unique index if not exists affiliate_conversions_affiliate_order_uidx
  on public.affiliate_conversions(affiliate_id, order_id)
  where affiliate_id is not null and order_id is not null;

create unique index if not exists commissions_affiliate_order_uidx
  on public.commissions(affiliate_id, order_id)
  where affiliate_id is not null and order_id is not null;

create unique index if not exists sales_order_uidx
  on public.sales(order_id);

create or replace function public.current_user_email()
returns text as $$
  select lower(coalesce(auth.jwt()->>'email', ''));
$$ language sql stable security definer;

create or replace function public.generate_affiliate_referral_code(
  p_name text,
  p_email text
)
returns text as $$
declare
  base_code text;
  candidate text;
  attempt int := 0;
begin
  base_code := upper(regexp_replace(coalesce(nullif(p_name, ''), split_part(coalesce(p_email, 'USER'), '@', 1), 'USER'), '[^a-zA-Z0-9]+', '', 'g'));
  base_code := left(coalesce(nullif(base_code, ''), 'USER'), 10);

  loop
    candidate := base_code || upper(substr(md5(coalesce(p_email, '') || clock_timestamp()::text || attempt::text), 1, 5));
    exit when not exists (
      select 1 from public.affiliates where referral_code = candidate
    );
    attempt := attempt + 1;
  end loop;

  return candidate;
end;
$$ language plpgsql security definer;

create or replace function public.sync_affiliate_links_for_affiliate(p_affiliate_id uuid)
returns void as $$
declare
  aff record;
begin
  select id, user_id, email, whatsapp, referral_code
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
  select distinct
    aff.id,
    p.id,
    aff.referral_code,
    '/produk/' || p.slug || '?ref=' || aff.referral_code,
    coalesce((
      select count(*)::int
      from public.affiliate_clicks c
      where c.affiliate_id = aff.id
        and c.product_id = p.id
    ), 0),
    coalesce((
      select count(*)::int
      from public.affiliate_conversions cv
      where cv.affiliate_id = aff.id
        and cv.product_id = p.id
    ), 0)
  from public.orders o
  join public.products p on p.id = o.product_id
  where o.status = 'paid'
    and o.product_id is not null
    and (
      (aff.user_id is not null and o.user_id = aff.user_id)
      or lower(o.buyer_email) = lower(aff.email)
      or (aff.whatsapp is not null and o.buyer_whatsapp = aff.whatsapp)
    )
  on conflict (affiliate_id, product_id) where product_id is not null
  do update
    set referral_code = excluded.referral_code,
        target_url = excluded.target_url,
        clicks_count = excluded.clicks_count,
        conversions_count = excluded.conversions_count,
        updated_at = now();

  delete from public.affiliate_links l
  where l.affiliate_id = aff.id
    and l.product_id is not null
    and not exists (
      select 1
      from public.orders o
      where o.status = 'paid'
        and o.product_id = l.product_id
        and (
          (aff.user_id is not null and o.user_id = aff.user_id)
          or lower(o.buyer_email) = lower(aff.email)
          or (aff.whatsapp is not null and o.buyer_whatsapp = aff.whatsapp)
        )
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
  select distinct
    a.id,
    prod.id,
    a.referral_code,
    '/produk/' || prod.slug || '?ref=' || a.referral_code,
    coalesce((
      select count(*)::int
      from public.affiliate_clicks c
      where c.affiliate_id = a.id
        and c.product_id = prod.id
    ), 0),
    coalesce((
      select count(*)::int
      from public.affiliate_conversions cv
      where cv.affiliate_id = a.id
        and cv.product_id = prod.id
    ), 0)
  from public.affiliates a
  where a.referral_code is not null
    and exists (
      select 1
      from public.orders o
      where o.status = 'paid'
        and o.product_id = prod.id
        and (
          (a.user_id is not null and o.user_id = a.user_id)
          or lower(o.buyer_email) = lower(a.email)
          or (a.whatsapp is not null and o.buyer_whatsapp = a.whatsapp)
        )
    )
  on conflict (affiliate_id, product_id) where product_id is not null
  do update
    set referral_code = excluded.referral_code,
        target_url = excluded.target_url,
        clicks_count = excluded.clicks_count,
        conversions_count = excluded.conversions_count,
        updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function public.ensure_affiliate_for_paid_order(p_order_id uuid)
returns uuid as $$
declare
  ord record;
  matched_user_id uuid;
  affiliate_id_result uuid;
begin
  select *
    into ord
  from public.orders
  where id = p_order_id
    and status = 'paid'
    and product_id is not null;

  if not found then
    return null;
  end if;

  matched_user_id := ord.user_id;

  if matched_user_id is null then
    select id
      into matched_user_id
    from auth.users
    where lower(email) = lower(ord.buyer_email)
    order by created_at asc
    limit 1;

    if matched_user_id is not null then
      update public.orders
      set user_id = matched_user_id
      where id = ord.id
        and user_id is null;
    end if;
  end if;

  if matched_user_id is not null then
    insert into public.users_profiles (id, full_name, phone, role)
    values (matched_user_id, ord.buyer_name, ord.buyer_whatsapp, 'affiliate')
    on conflict (id) do update
      set full_name = coalesce(public.users_profiles.full_name, excluded.full_name),
          phone = coalesce(public.users_profiles.phone, excluded.phone),
          role = case
            when public.users_profiles.role in ('super_admin', 'admin') then public.users_profiles.role
            else 'affiliate'
          end,
          updated_at = now();
  end if;

  select id
    into affiliate_id_result
  from public.affiliates
  where lower(email) = lower(ord.buyer_email)
  limit 1;

  if affiliate_id_result is null then
    insert into public.affiliates (
      user_id,
      full_name,
      email,
      whatsapp,
      referral_code,
      status,
      qualifying_order_id,
      approved_at
    )
    values (
      matched_user_id,
      ord.buyer_name,
      ord.buyer_email,
      ord.buyer_whatsapp,
      public.generate_affiliate_referral_code(ord.buyer_name, ord.buyer_email),
      'approved',
      ord.id,
      now()
    )
    returning id into affiliate_id_result;
  else
    update public.affiliates
    set user_id = coalesce(public.affiliates.user_id, matched_user_id),
        full_name = coalesce(nullif(public.affiliates.full_name, ''), ord.buyer_name),
        whatsapp = coalesce(public.affiliates.whatsapp, ord.buyer_whatsapp),
        qualifying_order_id = coalesce(public.affiliates.qualifying_order_id, ord.id),
        status = 'approved',
        approved_at = coalesce(public.affiliates.approved_at, now()),
        updated_at = now()
    where id = affiliate_id_result;
  end if;

  perform public.sync_affiliate_links_for_affiliate(affiliate_id_result);

  return affiliate_id_result;
end;
$$ language plpgsql security definer;

create or replace function public.process_paid_order_affiliate(p_order_id uuid)
returns void as $$
declare
  ord record;
  product_row record;
  commission_base numeric(14,2);
  commission_amount numeric(14,2);
  inserted_conversion_id uuid;
begin
  select *
    into ord
  from public.orders
  where id = p_order_id
    and status = 'paid';

  if not found then
    return;
  end if;

  perform public.ensure_affiliate_for_paid_order(ord.id);

  insert into public.sales (order_id, product_id, affiliate_id, amount, status)
  values (ord.id, ord.product_id, ord.affiliate_id, ord.total_amount, 'paid')
  on conflict (order_id) do update
    set product_id = excluded.product_id,
        affiliate_id = excluded.affiliate_id,
        amount = excluded.amount,
        status = 'paid',
        updated_at = now();

  if ord.affiliate_id is null or ord.product_id is null then
    return;
  end if;

  select affiliate_commission_rate, affiliate_commission_type, affiliate_commission_amount
    into product_row
  from public.products
  where id = ord.product_id;

  commission_base := greatest(coalesce(ord.subtotal, ord.price, 0) - coalesce(ord.discount_amount, 0), 0);
  commission_amount := case
    when coalesce(product_row.affiliate_commission_type, 'percent') = 'fixed'
      then greatest(coalesce(product_row.affiliate_commission_amount, 0), 0)
    else (commission_base * coalesce(product_row.affiliate_commission_rate, 0)) / 100
  end;

  insert into public.affiliate_conversions (
    affiliate_id,
    product_id,
    order_id,
    referral_code,
    conversion_type,
    amount
  )
  values (
    ord.affiliate_id,
    ord.product_id,
    ord.id,
    ord.referral_code,
    'order_paid',
    commission_base
  )
  on conflict (affiliate_id, order_id) where affiliate_id is not null and order_id is not null
  do nothing
  returning id into inserted_conversion_id;

  insert into public.commissions (
    affiliate_id,
    order_id,
    product_id,
    referral_code,
    amount,
    rate,
    status
  )
  values (
    ord.affiliate_id,
    ord.id,
    ord.product_id,
    ord.referral_code,
    commission_amount,
    case
      when coalesce(product_row.affiliate_commission_type, 'percent') = 'fixed' then 0
      else coalesce(product_row.affiliate_commission_rate, 0)
    end,
    'pending'
  )
  on conflict (affiliate_id, order_id) where affiliate_id is not null and order_id is not null
  do update
    set product_id = excluded.product_id,
        referral_code = excluded.referral_code,
        amount = excluded.amount,
        rate = excluded.rate,
        updated_at = now();

  update public.affiliate_links l
  set conversions_count = (
        select count(*)::int
        from public.affiliate_conversions c
        where c.affiliate_id = l.affiliate_id
          and c.product_id = l.product_id
      ),
      updated_at = now()
  where l.affiliate_id = ord.affiliate_id
    and l.product_id = ord.product_id;
end;
$$ language plpgsql security definer;

create or replace function public.handle_order_affiliate_status_change()
returns trigger as $$
declare
  buyer_affiliate_id uuid;
begin
  if new.status = 'paid' then
    perform public.process_paid_order_affiliate(new.id);
    return new;
  end if;

  if old.status = 'paid' and new.status <> 'paid' then
    update public.sales
    set status = new.status,
        updated_at = now()
    where order_id = new.id;

    update public.commissions
    set status = 'rejected',
        notes = coalesce(notes, 'Order tidak lagi berstatus paid.'),
        updated_at = now()
    where order_id = new.id
      and status in ('pending', 'approved');

    delete from public.affiliate_conversions
    where order_id = new.id;

    if old.affiliate_id is not null and old.product_id is not null then
      update public.affiliate_links l
      set conversions_count = (
            select count(*)::int
            from public.affiliate_conversions c
            where c.affiliate_id = l.affiliate_id
              and c.product_id = l.product_id
          ),
          updated_at = now()
      where l.affiliate_id = old.affiliate_id
        and l.product_id = old.product_id;
    end if;

    select id into buyer_affiliate_id
    from public.affiliates
    where lower(email) = lower(new.buyer_email)
    limit 1;

    if buyer_affiliate_id is not null then
      perform public.sync_affiliate_links_for_affiliate(buyer_affiliate_id);
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace function public.current_affiliate_id()
returns uuid as $$
  select id
  from public.affiliates
  where user_id = auth.uid()
     or lower(email) = public.current_user_email()
  limit 1;
$$ language sql stable security definer;

drop trigger if exists orders_affiliate_status_change on public.orders;
drop trigger if exists orders_affiliate_status_insert on public.orders;
create trigger orders_affiliate_status_insert
after insert
on public.orders
for each row
when (new.status = 'paid')
execute function public.handle_order_affiliate_status_change();

drop trigger if exists orders_affiliate_status_update on public.orders;
create trigger orders_affiliate_status_update
after update of status
on public.orders
for each row
when (new.status = 'paid' or old.status = 'paid')
execute function public.handle_order_affiliate_status_change();

do $$
declare
  order_row record;
begin
  for order_row in
    select id from public.orders where status = 'paid'
  loop
    perform public.process_paid_order_affiliate(order_row.id);
  end loop;
end $$;

drop policy if exists "users can read own profile" on public.users_profiles;
create policy "users can read own profile" on public.users_profiles
  for select using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "users can update own profile" on public.users_profiles;
create policy "users can update own profile" on public.users_profiles
  for update using (id = auth.uid() or public.current_user_is_admin())
  with check (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "users can insert own profile" on public.users_profiles;
create policy "users can insert own profile" on public.users_profiles
  for insert with check (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "users can read own orders" on public.orders;
create policy "users can read own orders" on public.orders
  for select using (
    user_id = auth.uid()
    or lower(buyer_email) = public.current_user_email()
    or public.current_user_is_admin()
  );

drop policy if exists "affiliate can update own profile" on public.affiliates;
create policy "affiliate can update own profile" on public.affiliates
  for update using (id = public.current_affiliate_id() or public.current_user_is_admin())
  with check (id = public.current_affiliate_id() or public.current_user_is_admin());

drop policy if exists "users can read paid products they bought" on public.products;
create policy "users can read paid products they bought" on public.products
  for select using (
    is_active = true
    or public.current_user_is_admin()
    or exists (
      select 1
      from public.orders o
      where o.product_id = public.products.id
        and o.status = 'paid'
        and (
          o.user_id = auth.uid()
          or lower(o.buyer_email) = public.current_user_email()
        )
    )
  );
