-- شالترتيب!? v0.6.0 migration
-- Converts Sa7i's groups into arrangement/qutiyyah coordination groups.

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

-- The new product no longer uses wake signals or Web Push subscriptions.
drop table if exists public.wake_signals cascade;
drop table if exists public.push_subscriptions cascade;

alter table public.groups
  add column if not exists description text,
  add column if not exists group_type text not null default 'arrangement',
  add column if not exists event_date date,
  add column if not exists event_time time,
  add column if not exists location_name text,
  add column if not exists location_url text,
  add column if not exists visibility text not null default 'private',
  add column if not exists allow_join_requests boolean not null default false,
  add column if not exists total_amount numeric(12,2),
  add column if not exists auto_split_amount boolean not null default false;

alter table public.groups
  drop constraint if exists groups_group_type_check,
  add constraint groups_group_type_check check (group_type in ('arrangement', 'qutiyyah')),
  drop constraint if exists groups_visibility_check,
  add constraint groups_visibility_check check (visibility in ('public', 'private')),
  drop constraint if exists groups_total_amount_non_negative,
  add constraint groups_total_amount_non_negative check (total_amount is null or total_amount >= 0);

alter table public.group_members
  add column if not exists display_label text,
  add column if not exists note text,
  add column if not exists amount_due numeric(12,2),
  add column if not exists amount_paid numeric(12,2),
  add column if not exists is_money_manager boolean not null default false;

alter table public.group_members
  drop constraint if exists group_members_amount_due_non_negative,
  add constraint group_members_amount_due_non_negative check (amount_due is null or amount_due >= 0),
  drop constraint if exists group_members_amount_paid_non_negative,
  add constraint group_members_amount_paid_non_negative check (amount_paid is null or amount_paid >= 0);

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

create index if not exists group_join_requests_group_status_idx
on public.group_join_requests (group_id, status, created_at desc);

create index if not exists group_join_requests_requester_idx
on public.group_join_requests (requester_id, created_at desc);

drop trigger if exists set_group_join_requests_updated_at on public.group_join_requests;
create trigger set_group_join_requests_updated_at
before update on public.group_join_requests
for each row execute function public.set_updated_at();

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

alter table public.group_join_requests enable row level security;

drop policy if exists "group members can read their groups" on public.groups;
drop policy if exists "users can create groups" on public.groups;
drop policy if exists "group creators can update groups" on public.groups;
drop policy if exists "group members can read group members" on public.group_members;
drop policy if exists "group creators can add accepted friends" on public.group_members;
drop policy if exists "members can update own group response" on public.group_members;
drop policy if exists "members can leave or creator can remove members" on public.group_members;
drop policy if exists "public or members can read groups" on public.groups;
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
using (
  auth.uid() = profile_id
  or private.is_group_creator(group_id, auth.uid())
);

create policy "join requests visible to requester or creator"
on public.group_join_requests for select
to authenticated
using (
  requester_id = auth.uid()
  or private.is_group_creator(group_id, auth.uid())
);

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

do $$
begin
  alter publication supabase_realtime add table public.group_join_requests;
exception
  when duplicate_object then null;
end $$;
