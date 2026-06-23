-- Sa7i migration: Web Push subscriptions for system/PWA notifications
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor قبل تفعيل تنبيهات النظام.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
on public.push_subscriptions (profile_id);

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "users can manage own push subscriptions" on public.push_subscriptions;
create policy "users can manage own push subscriptions"
on public.push_subscriptions for all
to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);
