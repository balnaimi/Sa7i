-- Sa7i Supabase schema
-- شغّل الملف في Supabase Dashboard → SQL Editor → New query → Run.
-- ملاحظة للتجربة: عطّل Email confirmations من Authentication → Sign In / Providers → Email
-- لأن التطبيق يستخدم username وكلمة مرور ويحوّل الاسم داخلياً إلى بريد مثل username@sa7i.local.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  invite_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_invite_code_format check (invite_code ~ '^[A-F0-9]{8}$')
);

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

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  requester_label text,
  addressee_label text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_one_pair_idx
on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships
add column if not exists requester_label text,
add column if not exists addressee_label text;

create table if not exists public.wake_signals (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (text in ('صاحي ؟', 'صاحي..', '✅', '❌')),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wake_signals_not_self check (sender_id <> receiver_id)
);

create index if not exists wake_signals_receiver_created_idx
on public.wake_signals (receiver_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_friendships_updated_at on public.friendships;
create trigger set_friendships_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text;
begin
  raw_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    raw_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), raw_username)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.wake_signals enable row level security;

-- تنظيف السياسات لو تعيد تشغيل الملف أثناء التعلم.
drop policy if exists "profiles are readable by signed in users" on public.profiles;
drop policy if exists "users can insert their own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
drop policy if exists "friendships are readable by participants" on public.friendships;
drop policy if exists "users can request friendship" on public.friendships;
drop policy if exists "addressee can accept friendship" on public.friendships;
drop policy if exists "participants can delete pending friendship" on public.friendships;
drop policy if exists "wake signals readable by sender or receiver" on public.wake_signals;
drop policy if exists "friends can send wake signals" on public.wake_signals;
drop policy if exists "receiver can mark signal as seen" on public.wake_signals;

create policy "profiles are readable by signed in users"
on public.profiles for select
to authenticated
using (true);

create policy "users can insert their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "friendships are readable by participants"
on public.friendships for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "users can request friendship"
on public.friendships for insert
to authenticated
with check (auth.uid() = requester_id and requester_id <> addressee_id);

create policy "addressee can accept friendship"
on public.friendships for update
to authenticated
using (auth.uid() = addressee_id and status = 'pending')
with check (auth.uid() = addressee_id and status = 'accepted');

create policy "participants can delete pending friendship"
on public.friendships for delete
to authenticated
using (
  status = 'pending'
  and (auth.uid() = requester_id or auth.uid() = addressee_id)
);

create policy "wake signals readable by sender or receiver"
on public.wake_signals for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "friends can send wake signals"
on public.wake_signals for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = sender_id and f.addressee_id = receiver_id)
        or (f.requester_id = receiver_id and f.addressee_id = sender_id)
      )
  )
);

create policy "receiver can mark signal as seen"
on public.wake_signals for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

-- تفعيل Realtime على جداول الطلبات والتنبيهات.
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
