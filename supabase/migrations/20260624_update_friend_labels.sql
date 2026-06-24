-- Sa7i migration: allow accepted friends to rename their own local label
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل خيار تعديل اسم الصديق بعد الإضافة.

drop policy if exists "participants can update own accepted friend label" on public.friendships;

create policy "participants can update own accepted friend label"
on public.friendships for update
to authenticated
using (
  status = 'accepted'
  and (auth.uid() = requester_id or auth.uid() = addressee_id)
)
with check (
  status = 'accepted'
  and (auth.uid() = requester_id or auth.uid() = addressee_id)
);
