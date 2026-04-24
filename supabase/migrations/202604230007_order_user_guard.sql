create or replace function public.ensure_affiliate_for_paid_order(p_order_id uuid)
returns uuid as $$
declare
  ord record;
  matched_user_id uuid;
  existing_order_user_email text;
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

  matched_user_id := null;

  if ord.user_id is not null then
    select lower(email)
      into existing_order_user_email
    from auth.users
    where id = ord.user_id
    limit 1;

    if existing_order_user_email = lower(ord.buyer_email) then
      matched_user_id := ord.user_id;
    else
      update public.orders
      set user_id = null
      where id = ord.id;
    end if;
  end if;

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
        and user_id is distinct from matched_user_id;
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
