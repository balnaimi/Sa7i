-- Sa7i migration: topical groups with per-member attendance response
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل ميزة القروبات.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
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
  response text check (response in ('yes', 'no')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

create index if not exists groups_created_by_idx
on public.groups (created_by, created_at desc);

create index if not exists group_members_profile_idx
on public.group_members (profile_id, created_at desc);

create index if not exists group_members_group_idx
on public.group_members (group_id);

create index if not exists group_members_status_profile_idx
on public.group_members (membership_status, profile_id, created_at desc);

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create schema if not exists private;

grant usage on schema private to authenticated;

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

revoke execute on function private.is_group_member(uuid, uuid) from public, anon;
revoke execute on function private.is_group_creator(uuid, uuid) from public, anon;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_group_creator(uuid, uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "group members can read their groups" on public.groups;
drop policy if exists "users can create groups" on public.groups;
drop policy if exists "group creators can update groups" on public.groups;
drop policy if exists "group members can read group members" on public.group_members;
drop policy if exists "group creators can add accepted friends" on public.group_members;
drop policy if exists "members can update own group response" on public.group_members;
drop policy if exists "members can leave or creator can remove members" on public.group_members;

create policy "group members can read their groups"
on public.groups for select
to authenticated
using (private.is_group_member(id, auth.uid()));

create policy "users can create groups"
on public.groups for insert
to authenticated
with check (auth.uid() = created_by);

create policy "group creators can update groups"
on public.groups for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "group members can read group members"
on public.group_members for select
to authenticated
using (
  profile_id = auth.uid()
  or private.is_group_member(group_id, auth.uid())
);

create policy "group creators can add accepted friends"
on public.group_members for insert
to authenticated
with check (
  auth.uid() = added_by
  and private.is_group_creator(group_id, auth.uid())
  and (
    (profile_id = auth.uid() and membership_status = 'accepted')
    or (
      membership_status = 'invited'
      and exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = profile_id)
            or (f.addressee_id = auth.uid() and f.requester_id = profile_id)
          )
      )
    )
  )
);

create policy "members can update own group response"
on public.group_members for update
to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

create policy "members can leave or creator can remove members"
on public.group_members for delete
to authenticated
using (
  auth.uid() = profile_id
  or private.is_group_creator(group_id, auth.uid())
);

do $$
begin
  alter publication supabase_realtime add table public.groups;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception
  when duplicate_object then null;
end $$;
