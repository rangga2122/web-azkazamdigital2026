create table if not exists public.whatsapp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (status in ('draft', 'running', 'paused', 'completed', 'stopped', 'failed')),
  template text not null default '',
  send_image boolean not null default false,
  image_url text,
  send_video boolean not null default false,
  video_url text,
  min_delay_seconds integer not null default 10 check (min_delay_seconds >= 1),
  max_delay_seconds integer not null default 30 check (max_delay_seconds >= 1),
  filter_statuses text[] not null default array['paid']::text[],
  filter_date_from date,
  filter_date_to date,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  current_index integer not null default 0,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  stopped_at timestamptz,
  last_processed_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.whatsapp_broadcasts(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  sequence_no integer not null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  last_order_code text,
  last_order_date timestamptz,
  last_order_total numeric(12,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  send_after timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, sequence_no)
);

create table if not exists public.whatsapp_followup_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  level integer not null check (level between 1 and 3),
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  locked_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, level)
);

create index if not exists whatsapp_broadcasts_status_idx
  on public.whatsapp_broadcasts(status, created_at desc);

create index if not exists whatsapp_broadcast_recipients_queue_idx
  on public.whatsapp_broadcast_recipients(broadcast_id, status, send_after, sequence_no);

create index if not exists whatsapp_followup_jobs_due_idx
  on public.whatsapp_followup_jobs(status, scheduled_for, level);

create index if not exists whatsapp_followup_jobs_order_idx
  on public.whatsapp_followup_jobs(order_id, level);

drop trigger if exists whatsapp_broadcasts_updated_at on public.whatsapp_broadcasts;
create trigger whatsapp_broadcasts_updated_at
before update on public.whatsapp_broadcasts
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_broadcast_recipients_updated_at on public.whatsapp_broadcast_recipients;
create trigger whatsapp_broadcast_recipients_updated_at
before update on public.whatsapp_broadcast_recipients
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_followup_jobs_updated_at on public.whatsapp_followup_jobs;
create trigger whatsapp_followup_jobs_updated_at
before update on public.whatsapp_followup_jobs
for each row execute function public.set_updated_at();

alter table public.whatsapp_broadcasts enable row level security;
alter table public.whatsapp_broadcast_recipients enable row level security;
alter table public.whatsapp_followup_jobs enable row level security;

drop policy if exists "admins full access whatsapp broadcasts" on public.whatsapp_broadcasts;
create policy "admins full access whatsapp broadcasts" on public.whatsapp_broadcasts
  for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists "admins full access whatsapp broadcast recipients" on public.whatsapp_broadcast_recipients;
create policy "admins full access whatsapp broadcast recipients" on public.whatsapp_broadcast_recipients
  for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());

drop policy if exists "admins full access whatsapp followup jobs" on public.whatsapp_followup_jobs;
create policy "admins full access whatsapp followup jobs" on public.whatsapp_followup_jobs
  for all using (public.current_user_is_admin()) with check (public.current_user_is_admin());
