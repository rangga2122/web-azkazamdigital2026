-- Log percobaan kirim notifikasi WhatsApp per order.
--
-- Alasan: kegagalan kirim WA (instablast/GOWA) sebelumnya hanya masuk console
-- container sehingga panel Admin tidak tahu notif mana yang gagal, kenapa, dan
-- tidak bisa mengirim ulang. Satu baris = satu percobaan kirim.
--
-- Dipakai oleh:
--   src/lib/whatsapp-notification-log.ts  (record + baca)
--   POST /api/admin/whatsapp/order-notifications  (kirim ulang dari menu Pesanan)

create table if not exists public.whatsapp_notification_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  order_code text not null,
  -- order_created = notif order baru (checkout) | status_update = notif perubahan status
  type text not null,
  -- sent = berhasil dikirim ke gateway | failed = gagal
  status text not null,
  phone text,
  -- isi pesan yang benar-benar dikirim (dipakai untuk kirim ulang persis sama)
  message text,
  error text,
  -- siapa pemicunya: "system" (checkout/webhook) atau email admin (kirim ulang manual)
  sender text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_notification_logs_order_code_idx
  on public.whatsapp_notification_logs (order_code, created_at desc);

create index if not exists whatsapp_notification_logs_order_id_idx
  on public.whatsapp_notification_logs (order_id, created_at desc);

alter table public.whatsapp_notification_logs enable row level security;

drop policy if exists "admins read whatsapp notification logs" on public.whatsapp_notification_logs;
create policy "admins read whatsapp notification logs"
  on public.whatsapp_notification_logs
  for select
  using (current_user_is_admin());

drop policy if exists "admins insert whatsapp notification logs" on public.whatsapp_notification_logs;
create policy "admins insert whatsapp notification logs"
  on public.whatsapp_notification_logs
  for insert
  with check (current_user_is_admin());
