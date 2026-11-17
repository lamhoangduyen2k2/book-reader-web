-- Custom SQL migration file, put your code below! --
create schema if not exists app_private;
--> statement-breakpoint
revoke all on schema app_private from PUBLIC, anon, authenticated;
--> statement-breakpoint
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null
     and to_regprocedure('app_private.handle_new_user()') is not null then
    raise exception 'Both trigger functions exist; review before migration';
  elsif to_regprocedure('public.handle_new_user()') is not null then
    alter function public.handle_new_user() set schema app_private;
  elsif to_regprocedure('app_private.handle_new_user()') is null then
    raise exception 'Missing M1 trigger function; review before migration';
  end if;
end;
$$;
--> statement-breakpoint
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(new.email, '@', 1), ''), 'Reader'), 100));
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function app_private.handle_new_user() from PUBLIC, anon, authenticated;
--> statement-breakpoint
revoke all on table public.profiles from PUBLIC, anon, authenticated;
--> statement-breakpoint
revoke all on table public.books from PUBLIC, anon, authenticated;
--> statement-breakpoint
grant select on public.profiles to authenticated;
--> statement-breakpoint
grant select on public.books to anon, authenticated;
--> statement-breakpoint
grant insert (title, author, owner_id, visibility) on public.books to authenticated;
--> statement-breakpoint
alter table public.profiles enable row level security;
--> statement-breakpoint
alter table public.books enable row level security;