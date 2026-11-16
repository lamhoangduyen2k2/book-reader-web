# Security review & upgrade — từ bộ tài liệu v1 sang v2

**16/11/2026** · Đọc trước khi áp dụng hướng dẫn mới. Tài liệu v2 thay thế các hướng dẫn cũ về cùng chức năng; không áp dụng đồng thời các đoạn cũ và mới. Sao lưu DB/Storage và source, tạo branch riêng. Nếu database có dữ liệu cần giữ, không drop/reset database.

## 1. Changelog và nguyên nhân

| ID | Mức ưu tiên | Điểm phát hiện ở bản cũ | Bản mới |
|---|---|---|---|
| AUTH-01 | Cao | `serverSupabaseUser()` v2.1.0 trả `JwtPayload`, code cũ dùng `.id` | `requireUser()` duy nhất trả đối tượng User từ Auth; xử lý 401/503; UI claims `sub` |
| DB-01 | Gia cố | REVOKE trên bảng M1 thiếu `PUBLIC` | REVOKE tường minh cả 3 role; kiểm tra quyền hiệu lực và inherited grants |
| DB-02 | Cao | `GRANT INSERT ON books` tự cấp quyền INSERT cả cột mới M3, có thể giả consent/status | Column-level GRANT từ M1, revoke table INSERT lần nữa ở M3; test trực tiếp Data API |
| DB-03 | Gia cố | Definer function nằm exposed schema; lỗi `display_name` nếu thiếu dữ liệu | `app_private`, search_path rỗng, revoke EXECUTE, fallback tên, kiểm tra trigger |
| HTTP-01 | Cao | Boolean session/route UI không đủ, cookie mutation thiếu Origin check đến M5 | Middleware M1: Origin + no-store SSR/API; server verified auth + RLS; reset client state khi đổi account |
| HTTP-02 | Trung bình | Một list LIMIT 50 dùng cho cả public/private → sách riêng có thể lấn trang public | `scope=all/public/private` lọc trong SQL; thứ tự ổn định; giữ backward compatibility |
| FILE-01 | Cao | Storage policy cho mọi user upload; parser chưa chống ZIP bomb | `upload_members` trusted-only, kiểm tra RLS/API. Không mở public upload; ban đầu chỉ trusted fixtures |
| FILE-02 | Trung bình | File magic bytes không chứng minh EPUB/PDF an toàn; thiếu kiểm tra checksum ở worker | Check size/bytes/immutable path + SHA256, giới hạn text/chapter/job; sandbox vẫn là gate bắt buộc |
| DB-04 | Trung bình | Zod chỉ bảo vệ Nitro, client có thể gọi PostgREST trực tiếp | CHECK bounds cho progress/highlight/notes, RLS khi đọc theo quyền sách hiện hành |
| AI-01 | Cao | Quota chỉ ở M4, không bảo vệ worker hoặc summary ở M3; một chat tính 1 dù gọi 2 SDK methods | Đưa bảng quota và module dùng chung vào M3, reserve trước SDK calls, atomic global + per-user |
| AI-02 | Trung bình | Operator pgvector có thể không resolve do extension schema, đổi embedding space tùy ý | `OPERATOR(extensions.<=>)` và model contract 768d; không đổi nếu chưa reindex |
| AI-03 | Trung bình | `chunkId` dùng cho chapter, thiếu giới hạn mode chapter hoặc stream đứt | `sourceType/sourceId`, require chapterIndex khi cần, kiểm tra done/error; không dùng lịch sử cũ trong prompt no-spoiler |
| AI-04 | Tương thích | Gemini 2.5 Flash deprecated; mốc định tuyến 01/12/2026 theo bảng giá | Chuyển baseline LLM sang `gemini-3.5-flash-lite`; text-only Standard Free Tier, kiểm tra project quota |
| OPS-01 | Trung bình | Unit test mặc định chạy chung integration cần secrets; CI không có lockfile pin rõ | Unit scope riêng, dotenv-cli cho test integration, pin module, CI/Docker đồng bộ pnpm, runtime env riêng worker |

**Lưu ý:** các cải tiến trên giảm rủi ro, không đồng nghĩa đã chạy thực tế hay bảo đảm không có lỗ hổng. Đặc biệt `SECURITY DEFINER` không phải lỗi tự thân; profile trigger cần quyền phù hợp và owner xác định. `PUBLIC` không phải schema và PostgreSQL mặc định không cho PUBLIC quyền table; bổ sung REVOKE ở đây là thiết lập rõ quyền mong muốn.

## 2. Nếu bạn đang làm Milestone 1 (khuyến nghị)

### 2.1. Source code

1. Giữ nguyên project và lockfile hiện tại. Kiểm tra `pnpm list @nuxtjs/supabase --depth 0` phải là 2.1.0. Nếu range còn mở, `pnpm add -D -E @nuxtjs/supabase@2.1.0`; không nâng các package khác tự động. Cài direct dependency `@supabase/supabase-js` nếu chưa có (M2/M5 import trực tiếp). Khi thay dependency, review lockfile diff và chạy `pnpm typecheck`.
2. Thêm `server/utils/require-user.ts` và `server/middleware/security.ts` theo M1 v2 mục 6.0 (đặt `APP_ORIGIN=http://localhost:3000` khớp browser thật).
3. Chỉnh `server/api/me.get.ts`, `server/api/books/index.post.ts`, `server/api/admin/ping.get.ts`, `server/api/books/index.get.ts` theo M1. Tìm mọi nơi import `serverSupabaseUser` và `useSupabaseUser`. Không thay toàn bộ `.id` bằng `.sub`: User object của `auth.getUser()` vẫn `id`.
4. Đối chiếu login/logout/confirm page và list public/private của M1. Chạy `pnpm exec nuxt prepare`, `pnpm typecheck`, `pnpm build`.

### 2.2. Migration chưa apply

Nếu chưa chạy `pnpm db:migrate`: dùng custom migration v2 trong M1 mục 5.5 thay đoạn **chưa được apply**. Giữ migration schema do Drizzle generate, thay nội dung đúng file custom auth/RLS. Nếu đã tạo trigger `app_private` thủ công ngoài migration, kiểm tra DB trước; không tạo trigger lần hai.

### 2.3. Migration M1 đã apply — tạo migration mới (không sửa lịch sử)

**Chỉ dành cho DB đã có hai bảng `profiles`, `books` và trigger M1**, chưa làm M2–M4. Trước khi apply kiểm tra bước 3. Nếu function đã tồn tại trong `app_private`, câu DO bỏ qua move; nếu ở cả hai schema, dừng để xử lý ownership/trigger thay vì tự drop. `ALTER FUNCTION ... SET SCHEMA` giữ object identity nên trigger đã liên kết vẫn trỏ đúng function. Tài khoản chạy phải là owner/role có quyền.

```powershell
pnpm exec drizzle-kit generate --custom --name=foundation-v2-hardening
```

Điền file SQL mới:

```sql
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
```

**Không tạo lại 5 RLS policies/trigger/FK** ở đây: đã có ở M1. PostgreSQL REVOKE privilege trên table không xóa mọi quyền theo cột được grant riêng hoặc inherited role khác; nếu DB đã thay GRANT ngoài tài liệu, audit các quyền đó và thu hồi cụ thể trước khi coi hệ thống an toàn. Không expose `app_private` trong Data API Settings. Không grant service_role quyền rộng để chữa permission denied. Module `@nuxtjs/supabase` cài dev dependency là bình thường.

```powershell
pnpm db:migrate
pnpm db:check
pnpm typecheck
```

Nếu có tài khoản tạo trước trigger, backfill bằng admin SQL có kiểm soát (không tự nâng role, không ghi đè profile đang có):

```sql
insert into public.profiles (id, display_name)
select u.id, left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
  nullif(split_part(u.email, '@', 1), ''), 'Reader'), 100)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
```

## 3. SQL kiểm tra trước mỗi milestone

Chạy bằng SQL Editor để **kiểm tra cấu hình**, không dùng role quản trị để chứng minh quyền của app user.

```sql
select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('profiles','books','upload_members','book_files','reading_progress',
    'book_highlights','book_notes','processing_jobs','book_chapters','book_chunks',
    'book_summaries','ai_daily_usage','ai_global_daily','ai_global_minute',
    'chat_sessions','chat_messages')
order by c.relname;
```

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage')
order by schemaname, tablename, policyname;
```

```sql
select
  has_table_privilege('anon','public.books','SELECT') as guest_can_read,
  has_any_column_privilege('anon','public.books','INSERT') as guest_can_insert,
  has_table_privilege('authenticated','public.books','INSERT') as broad_user_insert,
  has_column_privilege('authenticated','public.books','title','INSERT') as user_can_insert_title,
  has_column_privilege('authenticated','public.books','id','INSERT') as user_can_set_id,
  has_column_privilege('authenticated','public.books','created_at','INSERT') as user_can_set_created_at,
  has_any_column_privilege('authenticated','public.profiles','UPDATE') as user_can_edit_profile;
```

Kỳ vọng theo thứ tự: true, false, false, true, false, false, false. Nếu không đúng, **dừng trước M2**, kiểm tra ACL/inherited roles. Có thể xem `information_schema.role_table_grants`, `information_schema.table_privileges`, `information_schema.column_privileges`; kiểm tra cả `PUBLIC` và các quyền xuất phát từ role membership. `has_column_privilege` phản ánh quyền hiệu lực; không có quyền full-table vẫn có thể có quyền column.

```sql
select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname='handle_new_user';
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid='auth.users'::regclass and tgname='on_auth_user_created';
```

Kỳ vọng: một function `app_private.handle_new_user()`, definer true, search_path rỗng, owner đủ quyền ghi `profiles`, execute false cho anon/authenticated; một trigger `AFTER INSERT` trên auth.users trỏ đến function. Test signup mới thật. SQL chỉ kiểm tra cấu hình, không chứng minh signup chưa fail vì constraint khác.

**Sau M3, thêm test:**

```sql
select
  has_column_privilege('authenticated','public.books','ai_consent_at','INSERT') as forge_consent,
  has_column_privilege('authenticated','public.books','ai_status','INSERT') as forge_status,
  has_any_column_privilege('authenticated','public.books','UPDATE') as user_update_books,
  has_any_column_privilege('authenticated','public.book_chunks','SELECT') as user_read_chunks,
  has_any_column_privilege('authenticated','public.ai_global_daily','UPDATE') as user_update_quota;
```

Cả 5 phải false. Test qua A/B thật theo M5, bao gồm insert sách private bình thường vẫn thành công và thêm `ai_status='ready'` vào Data API request phải fail.

## 4. Nếu đã áp dụng M2–M4 cũ (không giả định bạn đã làm)

Không dùng toàn bộ migration mới tạo lại những bảng/policy đã có. Các thay đổi quan trọng phải được chuyển thành migration delta. Dừng worker và web mutation trước. Backup cả DB và storage. Kiểm tra version database, lịch sử Drizzle, constraint, cột và policy bằng SQL mục 3.

- M2 cũ: thêm `upload_members` vào schema, generate migration chỉ tạo bảng mới; copy phần GRANT/RLS của bảng đó. `DROP POLICY IF EXISTS "book_files_storage_insert_own" ON storage.objects;` rồi tạo lại policy M2 v2 (trong cùng transaction migration). Kiểm tra không có policy permissive khác cho phép bypass allowlist. Thêm 3 constraints `progress_bounds_check`/`highlight_bounds_check`/`note_bounds_check` sau khi kiểm tra dữ liệu cũ; sửa 3 SELECT policies bằng `ALTER POLICY ... USING (...)` hoặc drop/create cùng transaction. Cấp allowlist thủ công cho test users. Các policy không liên quan giữ nguyên.
- M3 cũ: kiểm tra bảng `books` đã có hai cột AI; không add lại. Thu hồi quyền INSERT toàn bảng và quyền INSERT riêng trên hai cột nếu từng cấp; cấp đúng bốn cột M1. **Không tự coi consent/status đã được ghi trước đây là đáng tin cậy** nếu có khả năng client giả mạo: rà soát theo nguồn consent thật, tạm vô hiệu AI, thu hồi/dọn index chưa có bằng chứng consent trước khi mở lại. Thêm quota tables thiếu bằng Drizzle; nếu chưa làm M4, cả ba bảng quota được tạo ở M3 mới. Nếu đã làm M4, hai bảng daily có thể tồn tại, chỉ thêm `ai_global_minute`; không reset counter giữa ngày để vượt quota. M3 định nghĩa quota duy nhất.
- M4 cũ: giữ chat schema cũ nhưng thay contract JSONB citations trong TypeScript; dữ liệu `chunkId` cũ có thể là chapter ID, không migrate bằng rename mù. Rebuild/mark legacy citation hoặc giữ reader hỗ trợ legacy đã kiểm tra, không coi ID cũ là chứng cứ. Rà soát policy select session cần quyền sách hiện hành. Đảm bảo tất cả endpoint AI dùng quota mới trước các call. Test no-spoiler và stream.
- Nếu `service_role` từng được cấp quyền rộng theo bản cũ, audit các call thật từ API/worker; thu hồi quyền không dùng trên chính các bảng ứng dụng đó (không động vào các bảng owned by Supabase). Current baseline chỉ cần `SELECT/INSERT` book_files và chat sessions/messages, Storage API key; `DATABASE_URL` truy cập bảng AI nội bộ. Không thu hồi mù khi chạy production app khác. Không cấp `service_role` cho browser hoặc cho user tự gọi arbitrarily.

Nhánh upgrade này là hướng dẫn delta/kiểm tra, **không phải một migration duy nhất chạy được cho mọi trạng thái DB**. Đối với M1 hiện tại của bạn, nhánh 2.2/2.3 là đủ. Nếu đã đi xa hơn, cần đối chiếu `schema.ts`, các migration đã apply và package lock thực tế.

## 5. Các security gates không được bỏ qua

| Kiểm thử | Kết quả cần bằng chứng |
|---|---|
| Auth helper | Guest 401 (với Origin hợp lệ), session sai 401, Auth outage 503; user id lấy từ verified Auth |
| A/B + admin | B không đọc sách, profile, file, notes, chat riêng A; non-admin không tự promote hoặc tạo public book |
| Data API trực tiếp | Tự gán owner B, role admin, consent/status, internal chunk, allowlist, AI quota đều bị từ chối |
| Storage | Bucket private, B không upload prefix A; nonmember không upload kể cả có prefix own; signed URL TTL ngắn |
| AI | Mọi SDK path (embed worker/query, summary, chat stream) có reservation trước; no key/billing fallback; concurrency 429 |
| Content | EPUB/PDF trusted fixture, không bật scripted EPUB, XSS escaped; ZIP bomb, resource limits, sandbox chưa test thì không mở public upload |
| Lifecycle | Không đổi migration đã apply; failed jobs không ready, consent withdrawal trước khi AI tiếp tục; xóa file qua Storage API |
| CI | Actual lockfile, typecheck/build, unit riêng integration; HTTPS và no-store thật sự phát huy ở proxy cuối |

## 6. Nguồn chính thức đã dùng kiểm chứng

- https://github.com/nuxt-modules/supabase/blob/v2.1.0/src/runtime/server/services/serverSupabaseUser.ts
- https://github.com/nuxt-modules/supabase/blob/v2.1.0/src/module.ts
- https://github.com/nuxt-modules/supabase/blob/v2.1.0/src/runtime/composables/useSupabaseUser.ts
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/database/postgres/column-level-security
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://www.postgresql.org/docs/current/sql-revoke.html
- https://www.postgresql.org/docs/current/sql-alterfunction.html
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits

**Rà soát ≠ nghiệm thu.** Chưa có source project/lockfile/credentials để build và chạy test. Không đánh dấu case là pass nếu chưa thực hiện. Portfolio demo trusted-only vẫn cần bảo vệ secret, quyền và giới hạn tài nguyên.
