-- Sa7i migration: allow rejecting/canceling pending friend requests
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل زر رفض طلب الإضافة.

drop policy if exists "participants can delete pending friendship" on public.friendships;

create policy "participants can delete pending friendship"
on public.friendships for delete
to authenticated
using (
  status = 'pending'
  and (auth.uid() = requester_id or auth.uid() = addressee_id)
);
