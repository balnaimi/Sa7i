-- شالترتيب!? Supabase schema
-- شغّل الملف في Supabase Dashboard → SQL Editor → New query → Run.
-- ملاحظة للتجربة: عطّل Email confirmations من Authentication → Sign In / Providers → Email
-- لأن التطبيق يستخدم username وكلمة مرور ويحوّل الاسم داخلياً إلى بريد مثل username@shaltarteeb.local.

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  invite_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_invite_code_format check (invite_code ~ '^[A-F0-9]{8}$')
);

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

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  group_type text not null default 'arrangement' check (group_type in ('arrangement', 'qutiyyah')),
  event_date date,
  event_time time,
  location_name text,
  location_url text,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  allow_join_requests boolean not null default false,
  total_amount numeric(12,2) check (total_amount is null or total_amount >= 0),
  auto_split_amount boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length check (char_length(trim(name)) between 1 and 80)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  membership_status text not null default 'invited' check (membership_status in ('invited', 'accepted')),
  display_label text,
  response text check (response in ('yes', 'no')),
  note text,
  amount_due numeric(12,2) check (amount_due is null or amount_due >= 0),
  amount_paid numeric(12,2) check (amount_paid is null or amount_paid >= 0),
  is_money_manager boolean not null default false,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, requester_id)
);

create index if not exists groups_created_by_idx on public.groups (created_by, created_at desc);
create index if not exists group_members_profile_idx on public.group_members (profile_id, created_at desc);
create index if not exists group_members_group_idx on public.group_members (group_id);
create index if not exists group_members_status_profile_idx on public.group_members (membership_status, profile_id, created_at desc);
create index if not exists group_join_requests_group_status_idx on public.group_join_requests (group_id, status, created_at desc);
create index if not exists group_join_requests_requester_idx on public.group_join_requests (requester_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
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

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists set_group_join_requests_updated_at on public.group_join_requests;
create trigger set_group_join_requests_updated_at
before update on public.group_join_requests
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

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function private.is_group_member(target_group_id uuid, target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.profile_id = target_profile_id
      and gm.membership_status = 'accepted'
  );
$$;

create or replace function private.is_group_creator(target_group_id uuid, target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = target_group_id
      and g.created_by = target_profile_id
  );
$$;

create or replace function private.is_group_money_manager(target_group_id uuid, target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.profile_id = target_profile_id
      and gm.membership_status = 'accepted'
      and gm.is_money_manager = true
  );
$$;

revoke execute on function private.is_group_member(uuid, uuid) from public, anon;
revoke execute on function private.is_group_creator(uuid, uuid) from public, anon;
revoke execute on function private.is_group_money_manager(uuid, uuid) from public, anon;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_group_creator(uuid, uuid) to authenticated;
grant execute on function private.is_group_money_manager(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_join_requests enable row level security;

-- تنظيف السياسات لو تعيد تشغيل الملف أثناء التعلم.
drop policy if exists "profiles are readable by signed in users" on public.profiles;
drop policy if exists "users can insert their own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
drop policy if exists "friendships are readable by participants" on public.friendships;
drop policy if exists "users can request friendship" on public.friendships;
drop policy if exists "addressee can accept friendship" on public.friendships;
drop policy if exists "participants can update own accepted friend label" on public.friendships;
drop policy if exists "participants can delete pending friendship" on public.friendships;
drop policy if exists "participants can delete accepted friendship" on public.friendships;
drop policy if exists "public or members can read groups" on public.groups;
drop policy if exists "users can create groups" on public.groups;
drop policy if exists "creators can update groups" on public.groups;
drop policy if exists "creators can delete groups" on public.groups;
drop policy if exists "public or members can read group members" on public.group_members;
drop policy if exists "creators can add group members" on public.group_members;
drop policy if exists "members admins and money managers can update group members" on public.group_members;
drop policy if exists "members can leave and creators can remove group members" on public.group_members;
drop policy if exists "join requests visible to requester or creator" on public.group_join_requests;
drop policy if exists "users can request public group join" on public.group_join_requests;
drop policy if exists "creators can update join requests" on public.group_join_requests;
drop policy if exists "requesters can delete own pending join request" on public.group_join_requests;

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

create policy "participants can update own accepted friend label"
on public.friendships for update
to authenticated
using (status = 'accepted' and (auth.uid() = requester_id or auth.uid() = addressee_id))
with check (status = 'accepted' and (auth.uid() = requester_id or auth.uid() = addressee_id));

create policy "participants can delete pending friendship"
on public.friendships for delete
to authenticated
using (status = 'pending' and (auth.uid() = requester_id or auth.uid() = addressee_id));

create policy "participants can delete accepted friendship"
on public.friendships for delete
to authenticated
using (status = 'accepted' and (auth.uid() = requester_id or auth.uid() = addressee_id));

create policy "public or members can read groups"
on public.groups for select
to anon, authenticated
using (
  visibility = 'public'
  or (auth.uid() is not null and private.is_group_member(id, auth.uid()))
  or (auth.uid() is not null and auth.uid() = created_by)
);

create policy "users can create groups"
on public.groups for insert
to authenticated
with check (auth.uid() = created_by);

create policy "creators can update groups"
on public.groups for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "creators can delete groups"
on public.groups for delete
to authenticated
using (auth.uid() = created_by);

create policy "public or members can read group members"
on public.group_members for select
to anon, authenticated
using (
  exists (select 1 from public.groups g where g.id = group_id and g.visibility = 'public')
  or (auth.uid() is not null and profile_id = auth.uid())
  or (auth.uid() is not null and private.is_group_member(group_id, auth.uid()))
  or (auth.uid() is not null and private.is_group_creator(group_id, auth.uid()))
);

create policy "creators can add group members"
on public.group_members for insert
to authenticated
with check (
  auth.uid() = added_by
  and private.is_group_creator(group_id, auth.uid())
  and (
    (profile_id = auth.uid() and membership_status = 'accepted')
    or exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = profile_id)
          or (f.addressee_id = auth.uid() and f.requester_id = profile_id)
        )
    )
    or exists (
      select 1
      from public.group_join_requests gjr
      where gjr.group_id = group_members.group_id
        and gjr.requester_id = group_members.profile_id
        and gjr.status = 'pending'
    )
  )
);

create policy "members admins and money managers can update group members"
on public.group_members for update
to authenticated
using (
  auth.uid() = profile_id
  or private.is_group_creator(group_id, auth.uid())
  or private.is_group_money_manager(group_id, auth.uid())
)
with check (
  auth.uid() = profile_id
  or private.is_group_creator(group_id, auth.uid())
  or private.is_group_money_manager(group_id, auth.uid())
);

create policy "members can leave and creators can remove group members"
on public.group_members for delete
to authenticated
using (auth.uid() = profile_id or private.is_group_creator(group_id, auth.uid()));

create policy "join requests visible to requester or creator"
on public.group_join_requests for select
to authenticated
using (requester_id = auth.uid() or private.is_group_creator(group_id, auth.uid()));

create policy "users can request public group join"
on public.group_join_requests for insert
to authenticated
with check (
  requester_id = auth.uid()
  and exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.visibility = 'public'
      and g.allow_join_requests = true
  )
  and not private.is_group_member(group_id, auth.uid())
);

create policy "creators can update join requests"
on public.group_join_requests for update
to authenticated
using (private.is_group_creator(group_id, auth.uid()))
with check (private.is_group_creator(group_id, auth.uid()));

create policy "requesters can delete own pending join request"
on public.group_join_requests for delete
to authenticated
using (requester_id = auth.uid() and status = 'pending');

-- Realtime على جداول الطلبات والقروبات.
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.groups;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_join_requests;
exception when duplicate_object then null;
end $$;
