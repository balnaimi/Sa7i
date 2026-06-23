-- Sa7i migration: invite codes + realtime friendship updates
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل إضافة كود الإضافة.

create extension if not exists pgcrypto;

alter table public.profiles
add column if not exists invite_code text;

update public.profiles
set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where invite_code is null;

alter table public.profiles
alter column invite_code set not null,
alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index if not exists profiles_invite_code_key
on public.profiles (invite_code);

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.wake_signals;
exception
  when duplicate_object then null;
end $$;
