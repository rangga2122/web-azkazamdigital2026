create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  source_path text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages(created_at desc);

create index if not exists contact_messages_unread_idx
  on public.contact_messages(is_read, created_at desc);

create trigger contact_messages_updated_at
before update on public.contact_messages
for each row execute function public.set_updated_at();

alter table public.contact_messages enable row level security;

create policy "public can insert contact messages" on public.contact_messages
  for insert with check (true);

create policy "admins full access contact messages" on public.contact_messages
  for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
