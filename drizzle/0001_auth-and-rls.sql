-- Custom SQL migration file, put your code below! --
-- Link profiles -> Supabase Auth
alter table public.profiles
    add constraint profiles_auth_user_fk
    foreign key (id) references auth.users(id) on delete cascade;
--> statement-breakpoint

-- Tự động tạo profile ngay khi auth.users có user mới.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.profiles(id, display_name)
    values (
        new.id,
        left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                            split_part(new.email, "@", 1)), 100)
    )
    return new;
end;
$$;
--> statement-breakpoint

-- Tao trigger để gọi hàm handle_new_user khi có user mới được tạo trong auth.users
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
--> statement-breakpoint

-- Hàm trigger chạy với quyền definer, không mở quyền gọi RPC ra ngoài.
revoke all on function public.handle_new_user() from public, anon, authenticated;
--> statement-breakpoint

-- Không dựa vào default GRANT. Thu hồi trước, cấp lại đúng quyền.
revoke all on table public.profiles from anon, authenticated;