do $$
begin
  create policy "admins can read own admin row" on public.admins
    for select using (user_id = auth.uid() or public.current_user_is_admin());
exception when duplicate_object then
  null;
end $$;
