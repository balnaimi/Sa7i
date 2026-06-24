-- Sa7i migration: group invitations, neutral responses, member removal, and friend deletion

alter table public.group_members
add column if not exists membership_status text not null default 'accepted'
check (membership_status in ('invited', 'accepted'));

create index if not exists group_members_status_profile_idx
on public.group_members (membership_status, profile_id, created_at desc);

-- Existing members were created before invitations existed, so keep them as accepted.
update public.group_members
set membership_status = 'accepted'
where membership_status is null;

-- Recreate policies that now need invite/delete semantics.
drop policy if exists "group creators can add accepted friends" on public.group_members;
drop policy if exists "members can update own group response" on public.group_members;
drop policy if exists "members can leave or creator can remove members" on public.group_members;
drop policy if exists "participants can delete accepted friendship" on public.friendships;

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

create policy "participants can delete accepted friendship"
on public.friendships for delete
to authenticated
using (
  status = 'accepted'
  and (auth.uid() = requester_id or auth.uid() = addressee_id)
);
