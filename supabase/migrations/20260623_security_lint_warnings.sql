-- Sa7i migration: fix Supabase database-linter security warnings
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا ظهرت تحذيرات:
-- function_search_path_mutable على public.set_updated_at
-- anon/authenticated_security_definer_function_executable على public.handle_new_user

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
