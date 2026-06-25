-- شالترتيب!? v0.6.1: allow group admins to delete their groups.

drop policy if exists "creators can delete groups" on public.groups;

create policy "creators can delete groups"
on public.groups for delete
to authenticated
using (auth.uid() = created_by);
