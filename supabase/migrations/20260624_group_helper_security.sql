-- Sa7i migration: move group RLS helper functions out of the exposed public API schema
-- يعالج تحذيرات Supabase security definer executable على public.is_group_member / public.is_group_creator.

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

drop policy if exists "group members can read their groups" on public.groups;
drop policy if exists "group members can read group members" on public.group_members;
drop policy if exists "group creators can add accepted friends" on public.group_members;

create policy "group members can read their groups"
on public.groups for select
to authenticated
using (private.is_group_member(id, auth.uid()));

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
    profile_id = auth.uid()
    or exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = profile_id)
          or (f.addressee_id = auth.uid() and f.requester_id = profile_id)
        )
    )
  )
);

drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.is_group_creator(uuid, uuid);
