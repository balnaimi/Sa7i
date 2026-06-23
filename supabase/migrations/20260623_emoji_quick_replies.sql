-- Sa7i migration: allow emoji quick replies on wake signals
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا كان مشروعك موجود قبل ميزة ردود الإيموجي.

alter table public.wake_signals
  drop constraint if exists wake_signals_text_check;

alter table public.wake_signals
  add constraint wake_signals_text_check
  check (text in ('صاحي ؟', 'صاحي..', '✅', '❌'));
