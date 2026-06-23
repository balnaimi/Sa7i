-- Sa7i migration: per-device push preferences
-- Adds quiet-hours and muted-friend preferences to Web Push subscriptions.

alter table public.push_subscriptions
add column if not exists quiet_enabled boolean not null default false,
add column if not exists quiet_start text not null default '23:00',
add column if not exists quiet_end text not null default '08:00',
add column if not exists muted_friend_ids uuid[] not null default '{}';
