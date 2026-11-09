-- Custom SQL migration file, put your code below! --
-- Link profiles -> Supabase Auth
alter table public.profiles
    add constraint profiles_auth_user_fk
    foreign key (id) references auth.users(id) on delete cascade;
--> statement-breakpoint

-- 2. Tạo schema nội bộ cho privileged functions
create schema if not exists app_private;
--> statement-breakpoint

revoke all on schema app_private from PUBLIC;
--> statement-breakpoint

-- Tự động tạo profile ngay khi auth.users có user mới.
create function app_private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.profiles(id, display_name)
    values (
        new.id,
        left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                            split_part(new.email, '@', 1)), 100)
    );
    return new;
end;
$$;
--> statement-breakpoint

-- Tao trigger để gọi hàm handle_new_user khi có user mới được tạo trong auth.users
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function app_private.handle_new_user();
--> statement-breakpoint

-- Hàm trigger chạy với quyền definer, không mở quyền gọi RPC ra ngoài.
revoke all on function app_private.handle_new_user() from PUBLIC, anon, authenticated;
--> statement-breakpoint

-- 6. Thu hồi quyền bảng
revoke all on table public.profiles from PUBLIC, anon, authenticated;
--> statement-breakpoint

revoke all on table public.books from PUBLIC, anon, authenticated;
--> statement-breakpoint

-- 7. Cấp lại đúng quyền của Milestone 1
grant select on table public.profiles to authenticated;
--> statement-breakpoint

grant select on table public.books to anon;
--> statement-breakpoint

grant select, insert on table public.books to authenticated;
--> statement-breakpoint

-- 8. Bật RLS
alter table public.profiles enable row level security;
--> statement-breakpoint

alter table public.books enable row level security;
--> statement-breakpoint

-- 9. Người dùng chỉ đọc profile của mình
create policy "profiles_select_own" 
on public.profiles
for select 
to authenticated
using (
  id = (select auth.uid())
);
--> statement-breakpoint

-- 10. Mọi người có quyền SELECT chỉ xem sách public
create policy "books_select_public"
on public.books
for select
to anon, authenticated
using (
  visibility = 'public'
);
--> statement-breakpoint

-- 11. Người dùng đọc sách thuộc sở hữu của mình
create policy "books_select_own"
on public.books
for select
to authenticated
using (
  owner_id = (select auth.uid())
);
--> statement-breakpoint

-- 12. Người dùng tạo sách private của chính mình
create policy "books_insert_private"
on public.books
for insert
to authenticated 
with check (
  owner_id = (select auth.uid())
  and visibility = 'private'
);
--> statement-breakpoint

-- 13. Admin tạo sách public của chính mình
create policy "books_admin_insert_public"
on public.books
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and visibility = 'public'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  )
);
