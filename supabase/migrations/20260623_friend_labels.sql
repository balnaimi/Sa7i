-- Sa7i migration: per-user labels for friendships
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل ميزة تسمية الأصدقاء.

alter table public.friendships
add column if not exists requester_label text,
add column if not exists addressee_label text;

-- املأ الأسماء الافتراضية للعلاقات الموجودة حتى تظهر القوائم بدون فراغات.
update public.friendships f
set requester_label = coalesce(f.requester_label, p.display_name, p.username)
from public.profiles p
where f.addressee_id = p.id
  and f.requester_label is null;

update public.friendships f
set addressee_label = coalesce(f.addressee_label, p.display_name, p.username)
from public.profiles p
where f.requester_id = p.id
  and f.addressee_label is null;
