alter table public.article_automation_settings
add column if not exists queue_cursor int not null default 0;

update public.article_automation_settings
set queue_cursor = coalesce(queue_cursor, 0);
