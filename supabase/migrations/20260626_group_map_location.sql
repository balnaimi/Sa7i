-- شالترتيب!? v0.7.0: store map coordinates for group locations.

alter table public.groups
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;
