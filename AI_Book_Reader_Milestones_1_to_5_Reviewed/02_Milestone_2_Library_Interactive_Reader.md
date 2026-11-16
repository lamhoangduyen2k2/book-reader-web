# Milestone 2 — Library & Interactive Reader (Nuxt 3)

> **Bản rà soát v2 · 16/11/2026.** Đọc `00_README_START_HERE.md` trước. Mốc tương thích xác nhận: `@nuxtjs/supabase@2.1.0`; các dependency còn lại cần đối chiếu lockfile thực tế. Không ghi đè migrations đã apply. Code minh họa chưa chạy E2E trên project thật.


**Mục tiêu:** Có thư viện sách công khai + riêng tư, upload EPUB/PDF thật, đọc sách trong giao diện ba cột, lưu tiến độ, highlight và ghi chú — **chưa gọi AI**. Dựa trên Milestone 1: Nuxt **3** (`pages/` ở root), Supabase Auth + RLS, Drizzle schema/migrations.

> **Đầu ra:** `/my-books` hiển thị sách riêng, `/read/:id` đọc EPUB/PDF, lựa chọn đoạn văn + Notes/Highlights, guest chỉ thấy sách public. Reader có panel AI mock. Thử bằng **2 tài khoản A/B** trước khi chuyển M3.

## 0. Giải thích kiến trúc và hàng rào bảo mật

```
Frontend Nuxt (session user)
  ├── POST /api/books/:id/upload-init -> server tạo storage path (trusted allowlist)
  ├── supabase.storage.upload(path, file) -> RLS storage.objects
  ├── POST /api/books/:id/upload-complete -> server kiểm tra file rồi ghi book_files
  └── GET /api/books/:id/file -> server kiểm tra RLS books + book_files,
                                -> server riêng dùng secret key tạo signed URL 60s

Supabase Cloud
  ├── private bucket `book-files`  (MỌI sách, kể cả public)
  ├── public.books + RLS
  ├── public.book_files + RLS
  ├── public.reading_progress + RLS
  ├── public.book_highlights + RLS
  └── public.book_notes + RLS
```

- **Vì sao private bucket cho cả sách public?** Chia sẻ nội dung đọc qua endpoint kiểm tra quyền, tránh vô tình làm lộ file private do cấu hình bucket. Public là trạng thái của **book record**, không phải tính public của cả Storage bucket.
- **Signed URL là bearer token**: ai có link dùng được đến khi hết hạn, ngay cả sau logout; không log/chia sẻ/cache link. 60 giây là hạn theo ví dụ, còn quyền truy cập thực tế phải kiểm tra trước khi ký.
- **Server privileged client** chỉ sử dụng **sau khi user-scoped query xác minh quyền**. Tuyệt đối không tạo signed URL bằng service key dựa duy nhất vào `path` lấy từ client.

## 1. GATE M1 — trước khi code

1. `pnpm db:migrate` đã hoàn tất, schema `profiles`/`books` và RLS đang hoạt động.
2. `server/api/books/index.get.ts` trả sách public cho guest và public + owned private cho user.
3. Test User B **không** thấy private books của User A; `profiles.role` không được user thay đổi.
4. Đọc `06_SECURITY_REVIEW_AND_UPGRADE.md` trước khi áp dụng migration tiếp theo. Nếu migration M1 đã áp dụng, tạo **migration MỚI** — không viết đè lịch sử.

## 2. Chuẩn bị dependencies và Storage

Trong PowerShell tại root project:

```powershell
pnpm add epubjs pdfjs-dist

```

`epubjs` có type declarations đi kèm ở các bản phổ biến; kiểm tra package trước khi cài type ngoài.

**Ghi chú:** `epubjs` và `pdfjs-dist` dùng trên **client** (khởi tạo trong `onMounted`), không import ở SSR. Các SDK đổi typings theo phiên bản; khóa version `pnpm-lock.yaml`.

Supabase Dashboard → Storage → **New Bucket**:
- Name: `book-files`
- **Public bucket: OFF**
- File size limit: `5 MB` (cần thống nhất 5 MiB = 5*1024*1024 trong code; Supabase giới hạn tuỳ UI)
- Allowed MIME: `application/epub+zip`, `application/pdf`; một số browser báo khác nhau, nên **không chỉ dựa vào MIME**.

Đặt server secrets trong `.env` (không phải `NUXT_PUBLIC_*`):

```dotenv
NUXT_BOOKS_API_URL=https://PROJECT_REF.supabase.co
NUXT_BOOKS_ADMIN_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET_OR_SERVICE_ROLE_KEY
```

`nuxt.config.ts` — thêm vào object `defineNuxtConfig()` hiện có:

```ts
// nuxt.config.ts: merge object này; giữ các cấu hình riêng đang có của bạn.
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  modules: ['shadcn-nuxt', '@nuxtjs/supabase'],
  shadcn: { prefix: '', componentDir: './components/ui' },
  supabase: { redirect: false, useSsrCookies: true, types: false },
  runtimeConfig: {
    booksApiUrl: '',
    booksAdminKey: '',
  },
})
```

Biến `NUXT_BOOKS_API_URL`, `NUXT_BOOKS_ADMIN_KEY` tự map vào runtimeConfig khi Nuxt chạy. **Không đặt trong `runtimeConfig.public`**. Secret key có quyền rất cao; nếu lộ phải rotate ngay. Bật Git secret scanning nếu có.

## 3. Mở rộng Drizzle schema — không sửa bảng M1

Ở cuối `server/db/schema.ts`, bổ sung các import cần thiết `integer`, `primaryKey`, `uniqueIndex` từ `drizzle-orm/pg-core` (nếu chưa có), rồi thêm:

```ts
// Chỉ developer/admin SQL được cấp membership. Không có API tự đăng ký vào bảng này.
export const uploadMembers = pgTable('upload_members', {
  userId: uuid('user_id').primaryKey().references(() => profiles.id, { onDelete: 'cascade' }),
})

export const bookFiles = pgTable('book_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookId: uuid('book_id').notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  mimeType: varchar('mime_type', { length: 60 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('book_files_book_unique').on(t.bookId),
  uniqueIndex('book_files_path_unique').on(t.storagePath),
  check('book_files_size_check', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 5242880`),
])

export const readingProgress = pgTable('reading_progress', {
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  locator: text('locator').notNull(), // EPUB CFI hoặc "pdf:12"
  chapterIndex: integer('chapter_index').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.bookId] })])

export const bookHighlights = pgTable('book_highlights', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  locator: text('locator').notNull(),
  selectedText: text('selected_text').notNull(),
  color: varchar('color', { length: 16 }).notNull().default('yellow'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('highlight_color_check', sql`${t.color} in ('yellow','purple','green')`)])

export const bookNotes = pgTable('book_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  locator: text('locator'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Vì sao khóa ngoại `book_id`/`user_id` chưa đủ bảo mật?** FK chỉ kiểm tra ID có tồn tại, không biết một user có được đọc sách đó không. Cần RLS + server auth. **Vì sao unique `book_files.book_id`?** MVP mỗi sách 1 file; tránh nhiều file mơ hồ trong reader.

Generate migration schema trước:

```powershell
pnpm db:generate
```

**Đừng nhấn `db:migrate` vội.** Review các SQL `CREATE TABLE`; custom migration dưới đây phải có thứ tự **sau** migration schema. Nếu lỡ generate custom trước schema, tạo lại custom migration ở vị trí cuối bằng `drizzle-kit generate --custom --name=reader-security`.

## 4. Migration RLS & Storage — BẮT BUỘC

Tạo **custom migration mới sau schema**. Dùng nguyên các dấu `--> statement-breakpoint` khi copy vào file `.sql` của Drizzle.

```sql
-- 0. MVP trusted-only uploads: cấp quyền thủ công, không mở Internet tự upload.
revoke all on public.upload_members from PUBLIC, anon, authenticated;
--> statement-breakpoint
grant select on public.upload_members to authenticated;
--> statement-breakpoint
alter table public.upload_members enable row level security;
--> statement-breakpoint
create policy upload_members_select_own on public.upload_members
for select to authenticated using (user_id = (select auth.uid()));
--> statement-breakpoint
-- 1. Default deny: không dựa vào GRANT có sẵn
revoke all on public.book_files from PUBLIC, anon, authenticated;
--> statement-breakpoint
revoke all on public.reading_progress from PUBLIC, anon, authenticated;
--> statement-breakpoint
revoke all on public.book_highlights from PUBLIC, anon, authenticated;
--> statement-breakpoint
revoke all on public.book_notes from PUBLIC, anon, authenticated;
--> statement-breakpoint

-- 2. Table privileges: book_files chỉ đọc; ghi phải qua backend tin cậy
-- Đọc book_files vẫn phải vượt qua RLS bên dưới
grant select on public.book_files to anon, authenticated;
--> statement-breakpoint
-- Server-only client có role service_role có thể bypass RLS, nhưng vẫn cần GRANT.
-- Chỉ cấp trên bảng thực sự cần; KHÔNG cấp quyền này cho browser roles.
grant select on public.books to service_role;
--> statement-breakpoint
grant select, insert on public.book_files to service_role;
--> statement-breakpoint
grant select, insert, update on public.reading_progress to authenticated;
--> statement-breakpoint
grant select, insert, delete on public.book_highlights to authenticated;
--> statement-breakpoint
grant select, insert, update, delete on public.book_notes to authenticated;
--> statement-breakpoint

alter table public.book_files enable row level security;
--> statement-breakpoint
alter table public.reading_progress enable row level security;
--> statement-breakpoint
alter table public.book_highlights enable row level security;
--> statement-breakpoint
alter table public.book_notes enable row level security;
--> statement-breakpoint

-- 3. book_files: chỉ file của sách mà role có thể thấy
create policy "book_files_public_read" on public.book_files
for select to anon, authenticated
using (exists (
  select 1 from public.books b
  where b.id = book_id and b.visibility = 'public'
));
--> statement-breakpoint
create policy "book_files_owner_read" on public.book_files
for select to authenticated
using (exists (
  select 1 from public.books b
  where b.id = book_id and b.owner_id = (select auth.uid())
));
--> statement-breakpoint

-- 4. Progress chỉ thuộc user đăng nhập, sách phải có thể đọc
create policy "progress_select_own" on public.reading_progress
for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint
create policy "progress_insert_own" on public.reading_progress
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint
create policy "progress_update_own" on public.reading_progress
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint

-- 5. Highlights riêng tư; chỉ tạo cho sách được phép đọc
create policy "highlights_select_own" on public.book_highlights
for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint
create policy "highlights_insert_own" on public.book_highlights
for insert to authenticated with check (
 user_id = (select auth.uid()) and exists (
  select 1 from public.books b where b.id = book_id
  and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
 )
);
--> statement-breakpoint
create policy "highlights_delete_own" on public.book_highlights
for delete to authenticated using (user_id = (select auth.uid()));
--> statement-breakpoint

create policy "notes_select_own" on public.book_notes
for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint
create policy "notes_insert_own" on public.book_notes
for insert to authenticated with check (
 user_id = (select auth.uid()) and exists (
  select 1 from public.books b where b.id = book_id
  and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
 )
);
--> statement-breakpoint
create policy "notes_update_own" on public.book_notes
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.books b where b.id = book_id
      and (b.visibility = 'public' or b.owner_id = (select auth.uid()))
  )
);
--> statement-breakpoint
create policy "notes_delete_own" on public.book_notes
for delete to authenticated using (user_id = (select auth.uid()));
--> statement-breakpoint

-- 6. Storage: `book-files` là PRIVATE bucket, user chỉ upload trong folder của mình
-- Path server cấp có dạng <uid>/<book-id>/<uuid>.epub|pdf
-- Không thêm SELECT policy Storage cho anon: URL sẽ do server ký sau kiểm tra quyền.
create policy "book_files_storage_insert_own" on storage.objects
for insert to authenticated with check (
  bucket_id = 'book-files'
  and exists (select 1 from public.upload_members m where m.user_id = (select auth.uid()))
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.books b
    where b.id::text = (storage.foldername(name))[2]
      and b.owner_id = (select auth.uid())
  )
);
--> statement-breakpoint
create policy "book_files_storage_select_own" on storage.objects
for select to authenticated using (
  bucket_id = 'book-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.books b
    where b.id::text = (storage.foldername(name))[2]
      and b.owner_id = (select auth.uid())
  )
);

-- Giới hạn input ngay tại DB vì client có thể bỏ qua Zod/Nitro qua Data API.
--> statement-breakpoint
alter table public.reading_progress add constraint progress_bounds_check
check (char_length(locator) between 1 and 1500 and chapter_index between 0 and 100000);
--> statement-breakpoint
alter table public.book_highlights add constraint highlight_bounds_check
check (char_length(locator) between 1 and 1500 and char_length(selected_text) between 1 and 2000);
--> statement-breakpoint
alter table public.book_notes add constraint note_bounds_check
check (char_length(body) between 1 and 5000 and (locator is null or char_length(locator) <= 1500));
```

**GATE trusted upload:** Parser ở M2–M3 chưa phải parser untrusted an toàn. Chỉ tài khoản do bạn chủ động allowlist mới được upload, cả qua Storage API trực tiếp. Trong SQL Editor sau migrate: `insert into public.upload_members (user_id) values ('UUID_CUA_TAI_KHOAN_TEST');` (thay UUID thật). Không cấp quyền INSERT/UPDATE/DELETE bảng này cho user. Thu hồi qua SQL DELETE. Không bật public upload trước khi sandbox/scan/quota storage được kiểm thử. File đã đăng ký vẫn được đọc theo quyền sách; chỉ chọn file đáng tin cậy. Người được allowlist vẫn có thể tạo orphan objects trực tiếp nên đây **không phải** quota upload production.

**Review Storage:** không sửa/INSERT trực tiếp vào `storage.objects`; chỉ định nghĩa policy tại đây, còn thao tác file dùng Storage API. Trong project bật RLS rồi, nhưng policy vẫn phải có. Không cấp Storage `DELETE`/`UPDATE` cho browser ở MVP. **Không tạo policy `SELECT USING (bucket_id='book-files')` cho `anon`**.

> **Cần lưu ý với các hàm bảng**: `PUBLIC` là pseudo-role chung, không phải schema `public`. `REVOKE` là thao tác cấu hình thực thi khi migrate, không chạy sau mỗi trigger hoặc request. Gọi `GRANT SELECT` lên bảng chỉ cấp quyền ở cấp bảng; RLS vẫn quyết định row được đọc.

Chạy:

```powershell
pnpm db:migrate
pnpm typecheck
```

**Checkpoint 2A:** SQL Editor: `pg_policies` có policy `book_files`, `reading_progress`, `book_highlights`, `book_notes`, `storage.objects`; bảng mới bật RLS; file bucket vẫn `public=false`.

## 5. Server-only Supabase admin client (KHÔNG DÙNG CHO AUTH USER)

Tạo **`server/utils/books-admin-client.ts`**:

```ts
import { createClient } from '@supabase/supabase-js'

export function booksAdminClient() {
  const config = useRuntimeConfig()
  if (!config.booksApiUrl || !config.booksAdminKey) {
    throw new Error('Missing NUXT_BOOKS_API_URL / NUXT_BOOKS_ADMIN_KEY')
  }
  return createClient(config.booksApiUrl, config.booksAdminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

**Lý do dùng client riêng:** `serverSupabaseClient(event)` dùng session người dùng/RLS; admin client dùng secret role, thường bypass RLS, **chỉ được dùng sau access check bằng client user**, tuyệt đối không dùng admin client làm mặc định mọi API. Không chia sẻ instance admin với SSR cookies.

## 6. Server API upload — hai bước rõ ràng

**Quy tắc:** Người dùng phải tạo metadata sách ở M1 (`POST /api/books`) trước. `bookId` do server trả về, không lấy từ URL khác. `POST upload-init` tạo tên file khó đoán; `complete` chỉ chấp nhận path đúng prefix user/book, kiểm tra bytes và tạo metadata book_files. Không nhận `ownerId` từ client.

**`server/api/books/[id]/upload-init.post.ts`**:

```ts
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'

const schema = z.object({ ext: z.enum(['epub', 'pdf']) })

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const bookId = getRouterParam(event, 'id')
  if (!bookId || !z.string().uuid().safeParse(bookId).success)
    throw createError({ statusCode: 400, statusMessage: 'Invalid book ID' })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400 })

  const sb = await serverSupabaseClient(event)
  const { data: membership, error: membershipError } = await sb.from('upload_members')
    .select('user_id').eq('user_id', user.id).maybeSingle()
  if (membershipError) throw createError({ statusCode: 503 })
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Upload not enabled' })
  const { data: book } = await sb.from('books')
    .select('id, owner_id').eq('id', bookId).eq('owner_id', user.id).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })

  const { data: existing, error: existingError } = await sb.from('book_files')
    .select('id').eq('book_id', bookId).maybeSingle()
  if (existingError) throw createError({ statusCode: 503 })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'File already exists' })

  return { path: `${user.id}/${bookId}/${randomUUID()}.${parsed.data.ext}` }
})
```

Frontend chỉ gửi file tối đa 5 MiB và upload qua **user session**, không dùng privileged key:

```ts
const sb = useSupabaseClient()
const bookId = 'UUID_FROM_POST_BOOKS'
const file = selectedFile.value // ref<File|null> trong component
if (!file) throw new Error('Select EPUB/PDF first')
if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Max 5 MiB')
const ext = file.name.toLowerCase().endsWith('.epub') ? 'epub'
  : file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : null
if (!ext) throw new Error('Only EPUB/PDF')

const init = await $fetch<{ path: string }>(`/api/books/${bookId}/upload-init`, {
  method: 'POST', body: { ext },
})
const { error: storageError } = await sb.storage.from('book-files')
  .upload(init.path, file, {
    upsert: false,
    contentType: ext === 'pdf' ? 'application/pdf' : 'application/epub+zip',
  })
if (storageError) throw storageError
await $fetch(`/api/books/${bookId}/upload-complete`, {
  method: 'POST', body: { path: init.path },
})
```

**Vì sao không tin `.type` hoặc `.name`?** Cả hai có thể giả mạo. Client validation chỉ phục vụ UX; API `complete` kiểm tra **bytes thật** và chính sách xử lý file. Đây là phiên bản prototype với giới hạn 5 MiB, chưa phải antivirus/CDR hoặc chống zip bomb ở mức production.

**`server/api/books/[id]/upload-complete.post.ts`**:

```ts
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
import { booksAdminClient } from '~/server/utils/books-admin-client'

const schema = z.object({ path: z.string().min(1).max(350) })
const MAX = 5 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) throw createError({ statusCode: 400 })
  const input = schema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400 })

  const sb = await serverSupabaseClient(event)
  const { data: membership, error: membershipError } = await sb.from('upload_members')
    .select('user_id').eq('user_id', user.id).maybeSingle()
  if (membershipError) throw createError({ statusCode: 503 })
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Upload not enabled' })
  const { data: book } = await sb.from('books')
    .select('id, owner_id').eq('id', id).eq('owner_id', user.id).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })

  const parts = input.data.path.split('/')
  if (parts.length !== 3 || parts[0] !== user.id || parts[1] !== id
    || !/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(epub|pdf)$/i.test(parts[2] ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storage path' })
  }

  const { data: existing, error: existingError } = await sb.from('book_files')
    .select('id').eq('book_id', id).maybeSingle()
  if (existingError) throw createError({ statusCode: 503 })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'File already exists' })
  const admin = booksAdminClient()
  const { data: file, error: downloadError } = await sb.storage
    .from('book-files').download(input.data.path)
  if (downloadError || !file) throw createError({ statusCode: 400, statusMessage: 'File not uploaded' })

  const bytes = Buffer.from(await file.arrayBuffer())
  if (!bytes.length || bytes.length > MAX)
    throw createError({ statusCode: 413, statusMessage: 'File too large' })
  const ext = parts[2]!.split('.').pop()!.toLowerCase()
  const valid = ext === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  if (!valid) throw createError({ statusCode: 415, statusMessage: 'File content mismatch' })

  // metadata ghi bằng privileged client sau khi đã xác minh ownership + path
  const { data, error } = await admin.from('book_files').insert({
    book_id: id,
    storage_path: input.data.path,
    mime_type: ext === 'pdf' ? 'application/pdf' : 'application/epub+zip',
    size_bytes: bytes.length,
    checksum_sha256: createHash('sha256').update(bytes).digest('hex'),
  }).select('id, book_id').single()
  if (error || !data) {
    console.error('[upload-complete]', error?.code)
    throw createError({ statusCode: 409, statusMessage: 'Could not register book file' })
  }
  return { ok: true, fileId: data.id }
})
```

**Giới hạn an toàn cần biết:** Đoạn trên **không chứng minh EPUB là file an toàn**, chỉ xác minh ZIP magic. Một EPUB chứa HTML/script/ZIP bomb vẫn có thể qua bước upload. Trước khi xử lý hoặc phục vụ công khai, dùng bounded parser/worker sandbox, chặn số entries/decompressed bytes, không thực thi script; các bước thuộc M3/M5. Không đưa MVP này ra Internet cho người lạ upload khi chưa qua GATE.

## 7. API signed URL để đọc, không bao giờ nhận path từ browser

**`server/api/books/[id]/file.get.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { booksAdminClient } from '~/server/utils/books-admin-client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  // RLS: chỉ trả sách public hoặc sách private của user hiện tại
  const { data: book, error: bookError } = await sb.from('books')
    .select('id').eq('id', id).maybeSingle()
  if (bookError || !book) throw createError({ statusCode: 404 })
  // RLS trên book_files phải cho đúng người đọc file
  const { data: file, error: fileError } = await sb.from('book_files')
    .select('storage_path, mime_type').eq('book_id', id).maybeSingle()
  if (fileError || !file) throw createError({ statusCode: 404, statusMessage: 'No file yet' })

  // Admin client CHỈ ký chính xác path vừa được DB RLS xác minh
  const { data, error } = await booksAdminClient().storage
    .from('book-files').createSignedUrl(file.storage_path, 60)
  if (error || !data) throw createError({ statusCode: 503, statusMessage: 'File unavailable' })
  setHeader(event, 'Cache-Control', 'no-store')
  return { url: data.signedUrl, mimeType: file.mime_type }
})
```

Khi người dùng tải EPUB, frontend nên **fetch toàn bộ file một lần**, đưa ArrayBuffer vào `epub.js`, không để epub.js request nhiều chương qua signed URL đã hết hạn. Với PDF viewer cũng tải bytes rồi render. File download tối đa 5 MiB nên MVP chấp nhận RAM phía client.

## 8. Đọc EPUB — chạy client only

**`components/reader/EpubReader.client.vue`**:

```vue
<script setup lang="ts">
const props = defineProps<{ bookId: string; initialCfi?: string }>()
const emit = defineEmits<{
  relocated: [payload: { locator: string; chapterIndex: number }]
  selected: [payload: { locator: string; text: string }]
}>()
const container = ref<HTMLElement | null>(null)
const errorText = ref('')
let disposed = false
let book: any
let rendition: any

onMounted(async () => {
  try {
    const { url } = await $fetch<{ url: string }>(`/api/books/${props.bookId}/file`)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Cannot download ebook')
    const bytes = await response.arrayBuffer()
    if (disposed) return
    const { default: ePub } = await import('epubjs')
    if (disposed) return
    book = ePub(bytes)
    if (!container.value) return
    rendition = book.renderTo(container.value, { width: '100%', height: '100%', allowScriptedContent: false })
    rendition.on('relocated', (loc: any) => emit('relocated', {
      locator: loc?.start?.cfi ?? '', chapterIndex: Number(loc?.start?.index ?? 0),
    }))
    rendition.on('selected', (cfi: string, contents: any) => {
      const text = contents.window.getSelection()?.toString().slice(0, 2000) ?? ''
      if (text.trim()) emit('selected', { locator: cfi, text })
    })
    await rendition.display(props.initialCfi || undefined)
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : 'Failed to open EPUB'
  }
})
onBeforeUnmount(() => { disposed = true; rendition?.destroy?.(); book?.destroy?.() })
defineExpose({ next: () => rendition?.next(), prev: () => rendition?.prev(), display: (locator: string) => rendition?.display(locator) })
</script>
<template>
  <div class="h-full min-h-[550px]">
    <p v-if="errorText" role="alert" class="text-red-600">{{ errorText }}</p>
    <div ref="container" class="h-full" />
  </div>
</template>
```

Component đã expose `next`, `prev`, `display`; toolbar gọi qua template ref hoặc emit. Chỉ đưa locator đã kiểm tra từ nội dung sách vào `display`. Sự kiện `selected` chỉ là **input UI**; M4 phải xác minh nội dung này với dữ liệu sách đã index, không gửi selectedText lên AI và xem nó là nguồn đáng tin ngay.

**Tên auto-import của Nuxt 3:** vì các components đặt dưới `components/reader/`, tên trong template mặc định là `ReaderEpubReader` và `ReaderPdfReader` (tương ứng các file `.client.vue`), không phải `EpubReader`/`PdfReader` nếu bạn chưa cấu hình `pathPrefix:false`. Có thể import thủ công nếu muốn tên ngắn.

**GATE:** EPUB là ZIP chứa XHTML. Không bật `allowScriptedContent`, kiểm tra CSP, không render HTML không rõ nguồn bằng `v-html`. `epub.js` có sandbox nhưng không thay thế quy trình kiểm tra file độc hại.

## 9. Đọc PDF — renderer tối thiểu

**`components/reader/PdfReader.client.vue`**:

```vue
<script setup lang="ts">
const props = defineProps<{ bookId: string; initialPage?: number }>()
const emit = defineEmits<{ relocated: [payload: {locator: string; chapterIndex: number}] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const page = ref(1)
const total = ref(0)
const errorText = ref('')
let pdfDoc: any
let renderTask: any

async function renderPage() {
  if (!pdfDoc || !canvas.value) return
  renderTask?.cancel?.()
  const pdfPage = await pdfDoc.getPage(page.value)
  const viewport = pdfPage.getViewport({ scale: 1.15 })
  const el = canvas.value
  el.width = Math.floor(viewport.width)
  el.height = Math.floor(viewport.height)
  const context = el.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  renderTask = pdfPage.render({ canvasContext: context, canvas: el, viewport })
  await renderTask.promise
  emit('relocated', { locator: `pdf:${page.value}`, chapterIndex: page.value - 1 })
}
onMounted(async () => {
  try {
    const { url } = await $fetch<{ url: string }>(`/api/books/${props.bookId}/file`)
    const response = await fetch(url)
    if (!response.ok) throw new Error('Cannot download PDF')
    const bytes = await response.arrayBuffer()
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
    total.value = pdfDoc.numPages
    page.value = Math.max(1, Math.min(total.value, props.initialPage ?? 1))
    await renderPage()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Failed to open PDF'
  }
})
onBeforeUnmount(() => { renderTask?.cancel?.(); pdfDoc?.destroy?.() })
async function go(delta: number) {
  if (!pdfDoc) return
  const next = Math.max(1, Math.min(total.value, page.value + delta))
  if (next === page.value) return
  page.value = next
  try { await renderPage() } catch (e: any) {
    if (e?.name !== 'RenderingCancelledException') errorText.value = 'Render failed'
  }
}
</script>
<template>
  <section class="space-y-3">
    <div class="flex items-center gap-3">
      <Button variant="outline" @click="go(-1)">Previous</Button>
      <span>Page {{ page }} / {{ total }}</span>
      <Button variant="outline" @click="go(1)">Next</Button>
    </div>
    <p v-if="errorText" role="alert">{{ errorText }}</p>
    <div class="overflow-auto"><canvas ref="canvas" /></div>
  </section>
</template>
```

**Quan trọng:** Đây mới là **canvas renderer**, chưa phải PDF text selection/highlight. PDF.js version mới đôi khi đổi worker entry và `render()` options. Nếu build lỗi, kiểm tra package version và example chính thức tương ứng; không sửa lung tung bằng `any` để che lỗi runtime. M2 hoàn thành highlight ở EPUB trước; PDF annotation có thể hoàn thiện cuối M2 bằng text layer/coordinate mapping, hoặc ghi chú theo trang `pdf:N` để giữ scope.

## 10. API lưu tiến độ và highlights — giao dữ liệu cho RLS

**`server/api/books/[id]/progress.put.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
const schema = z.object({
  locator: z.string().min(1).max(1500),
  chapterIndex: z.number().int().min(0).max(100000),
})
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) throw createError({ statusCode: 400 })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', id).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { error } = await sb.from('reading_progress').upsert({
    user_id: user.id, book_id: id, locator: parsed.data.locator,
    chapter_index: parsed.data.chapterIndex, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,book_id' })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Cannot save progress' })
  return { ok: true }
})
```

**`server/api/books/[id]/highlights.post.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
const schema = z.object({
  locator: z.string().min(1).max(1500),
  text: z.string().trim().min(1).max(2000),
  color: z.enum(['yellow', 'purple', 'green']).default('yellow'),
})
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success) throw createError({ statusCode: 400 })
  const body = schema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', id).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { data, error } = await sb.from('book_highlights').insert({
    book_id: id, user_id: user.id,
    locator: body.data.locator, selected_text: body.data.text, color: body.data.color,
  }).select('id').single()
  if (error || !data) throw createError({ statusCode: 500 })
  return data
})
```

`GET /api/books/:id/progress` và `GET /api/books/:id/highlights` tương tự: check auth + book visibility trước, rồi query theo `user_id=user.id`/`book_id=id` bằng session client. `book_notes` dùng cùng mẫu POST với `body` được `.trim().min(1).max(5000)`. **Tuyệt đối không cho client tự gán `user_id`**.

**Ghi chú về tính chính xác:** RLS sẽ bảo vệ quyền đọc/ghi, nhưng một người có thể tự tạo highlight giả cho sách của chính họ. Đây là dữ liệu ghi chú cá nhân, chưa phải nguồn sự thật cho AI; trong M4 cần verify selected passage.

## 11. Reader layout bám theo UI mới

Tạo `pages/read/[id].vue` với 3 cột; thực hiện từng checkpoint trước khi polish visual:

```vue
<script setup lang="ts">
const route = useRoute()
const bookId = String(route.params.id)
definePageMeta({ key: route => route.path }) // remount khi đổi sách
const selected = ref<{ locator: string; text: string } | null>(null)
const { data: book, error } = await useFetch<{ id: string; title: string; author: string; visibility: 'public' | 'private'; file_format: 'epub' | 'pdf' | null }>(`/api/books/${bookId}`)
// Cần tạo GET /api/books/[id] bằng cách query books với session client;
// chỉ trả record khi RLS cho phép, không dùng admin client.
async function saveHighlight() {
  if (!selected.value) return
  await $fetch(`/api/books/${bookId}/highlights`, {
    method: 'POST', body: selected.value,
  })
}
</script>
<template>
  <div class="grid min-h-screen grid-cols-1 gap-4 bg-stone-50 p-4 text-stone-800 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
    <aside class="rounded-2xl border bg-white p-4">
      <h2 class="font-semibold">Library / Contents</h2>
      <p class="mt-2 text-sm">{{ book?.title }}</p>
      <p class="mt-4 text-xs text-stone-500">TOC sẽ lấy từ EPUB ở checkpoint sau.</p>
    </aside>
    <main class="min-w-0 rounded-2xl border bg-white p-4">
      <p v-if="error">Cannot open this book.</p>
      <template v-else-if="book">
        <div class="mb-4 flex items-center justify-between border-b pb-3">
          <h1 class="font-semibold">{{ book.title }}</h1>
          <span class="text-xs">Reader · {{ book.visibility }}</span>
        </div>
        <ClientOnly>
          <ReaderEpubReader v-if="book.file_format === 'epub'" :book-id="bookId" @selected="selected = $event" />
          <ReaderPdfReader v-else-if="book.file_format === 'pdf'" :book-id="bookId" />
          <p v-else>File is not available yet.</p>
        </ClientOnly>
      </template>
    </main>
    <aside class="rounded-2xl border bg-white p-4">
      <h2 class="font-semibold">AI Companion (mock)</h2>
      <p class="text-sm text-stone-500">Chat và Summary sẽ làm ở M3–M4.</p>
      <div v-if="selected" class="mt-4 rounded-xl bg-violet-50 p-3 text-sm">
        <p class="line-clamp-4">{{ selected.text }}</p>
        <Button class="mt-3" size="sm" @click="saveHighlight">Save highlight</Button>
      </div>
    </aside>
  </div>
</template>
```

**Bắt buộc hoàn thiện trước chạy:** `GET /api/books/[id]` trả thêm `file_format` từ `book_files.mime_type`, không trả `storage_path` hoặc secret. Dùng session client RLS:

**`server/api/books/[id].get.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !z.string().uuid().safeParse(id).success)
    throw createError({ statusCode: 400, statusMessage: 'Invalid book ID' })
  const sb = await serverSupabaseClient(event)
  const { data: book, error: bookError } = await sb.from('books')
    .select('id,title,author,visibility').eq('id', id).maybeSingle()
  if (bookError || !book) throw createError({ statusCode: 404 })
  const { data: file, error: fileError } = await sb.from('book_files')
    .select('mime_type').eq('book_id', id).maybeSingle()
  if (fileError) throw createError({ statusCode: 500, statusMessage: 'File metadata unavailable' })
  return {
    ...book,
    file_format: file?.mime_type === 'application/pdf' ? 'pdf'
      : file?.mime_type === 'application/epub+zip' ? 'epub' : null,
  }
})
```

Mục lục thật: lấy spine/TOC từ `epub.js` trên client; progress: khi nhận `relocated`, debounce (ví dụ 600–1000ms) gọi `PUT /api/books/:id/progress`; notes/highlights: gọi API rồi render `rendition.annotations.highlight(cfi)`. **Để chạy mượt**, làm lần lượt Reader → TOC → Progress → Highlight, đừng thêm cùng lúc.

## 11.1. Hoàn thiện Notes/Highlights/Progress bằng API đọc/ghi

M2 nên có cả API **đọc lại dữ liệu** sau khi reload, không chỉ API `POST`. Các API dưới đây chỉ trả dữ liệu của user hiện tại, không trả của user khác. Trước khi trả, check quyền đọc sách bằng user-scoped Supabase client.

**`server/api/books/[id]/progress.get.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const bookId = getRouterParam(event, 'id')
  if (!bookId || !z.string().uuid().safeParse(bookId).success)
    throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', bookId).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { data, error } = await sb.from('reading_progress')
    .select('locator,chapter_index,updated_at')
    .eq('book_id', bookId).eq('user_id', user.id).maybeSingle()
  if (error) throw createError({ statusCode: 500 })
  return data // null nếu lần đầu đọc
})
```

**`server/api/books/[id]/highlights.get.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const bookId = getRouterParam(event, 'id')
  if (!bookId || !z.string().uuid().safeParse(bookId).success)
    throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', bookId).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { data, error } = await sb.from('book_highlights')
    .select('id,locator,selected_text,color,created_at')
    .eq('book_id', bookId).eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(100)
  if (error) throw createError({ statusCode: 500 })
  return data ?? []
})
```

**`server/api/books/[id]/notes.post.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
const schema = z.object({
  body: z.string().trim().min(1).max(5000),
  locator: z.string().trim().max(1500).optional(),
})
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const bookId = getRouterParam(event, 'id')
  if (!bookId || !z.string().uuid().safeParse(bookId).success)
    throw createError({ statusCode: 400 })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', bookId).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { data, error } = await sb.from('book_notes').insert({
    user_id: user.id, book_id: bookId,
    locator: parsed.data.locator ?? null, body: parsed.data.body,
  }).select('id,body,locator,created_at').single()
  if (error || !data) throw createError({ statusCode: 500 })
  setResponseStatus(event, 201)
  return data
})
```

**`server/api/books/[id]/notes.get.ts`**:

```ts
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUser } from '~/server/utils/require-user'
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const bookId = getRouterParam(event, 'id')
  if (!bookId || !z.string().uuid().safeParse(bookId).success)
    throw createError({ statusCode: 400 })
  const sb = await serverSupabaseClient(event)
  const { data: book } = await sb.from('books').select('id').eq('id', bookId).maybeSingle()
  if (!book) throw createError({ statusCode: 404 })
  const { data, error } = await sb.from('book_notes')
    .select('id,body,locator,created_at')
    .eq('book_id', bookId).eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(100)
  if (error) throw createError({ statusCode: 500 })
  return data ?? []
})
```

### 11.2. Nối progress và highlight vào Reader

Trong `pages/read/[id].vue`, khi đăng nhập:

```ts
const user = useSupabaseUser()
const progress = ref<{ locator: string; chapter_index: number } | null>(null)
if (user.value) {
  progress.value = await useRequestFetch()<{ locator: string; chapter_index: number } | null>(`/api/books/${bookId}/progress`)
}
let saveTimer: ReturnType<typeof setTimeout> | undefined
function onRelocated(payload: { locator: string; chapterIndex: number }) {
  if (!user.value || !payload.locator) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    $fetch(`/api/books/${bookId}/progress`, {
      method: 'PUT', body: payload,
    }).catch(() => { /* UI nên báo "Could not save progress" */ })
  }, 800)
}
onBeforeUnmount(() => { if (saveTimer) clearTimeout(saveTimer) })
```

Truyền vào component:

```vue
<ReaderEpubReader :book-id="bookId" :initial-cfi="progress?.locator" @relocated="onRelocated" @selected="selected = $event" />
```

**Tương ứng chỉ số chương:** `loc.start.index` của epub.js là **spine index**; M3 phải lưu `book_chapters.chapter_index` theo **spine index**, không tự đánh số lại sau khi bỏ qua XHTML không có text. Nếu không, chế độ chống spoiler M4 có thể lọc sai chương. Với PDF dùng `page - 1`.

**Nếu `progress` tải sau khi EPUB được mount**, reader có thể hiển thị chương đầu trước khi có CFI; nên đợi trạng thái progress fetch hoàn thành rồi mới mount EPUB hoặc theo dõi prop và gọi `rendition.display(cfi)`. Code ví dụ dùng `await` khi `setup` SSR với Supabase cookies; thử với guest/login để tránh hydration mismatch.

Khôi phục highlights trong `EpubReader.client.vue` **sau khi `rendition.display` hoàn tất**:

```ts
const user = useSupabaseUser()
if (user.value) {
  const highlights = await $fetch<Array<{ locator: string; color: string }>>(
    `/api/books/${props.bookId}/highlights`,
  )
  for (const highlight of highlights) {
    rendition.annotations.highlight(highlight.locator, {}, undefined, 'epubjs-hl')
  }
}
```

**PDF page progress:** code ở mục 9 đã có `initialPage` và emit; không thêm lần hai. Khi tích hợp, event có dạng `emit('relocated', {locator: \`pdf:${page.value}\`, chapterIndex:page.value-1})` (bỏ dấu `\` dùng để trình bày nếu copy); ở reader page dùng cùng `onRelocated`. Để khôi phục vị trí, thêm `initialPage?: number` và clamp trang trong `onMounted` trước khi render.

**Phần notes UI:** M2 có thể làm `NoteEditor.vue` gồm `Textarea`, nút Save và danh sách notes load từ GET; chỉ dùng `{{ note.body }}`, **không `v-html`**. API bên trên đã là khung hoàn chỉnh cho việc lưu.

---

## 12. Bộ test M2 (phải chạy bằng session A/B)

Cấp allowlist A và B (hai tài khoản test do bạn quản lý), để kiểm thử ownership riêng biệt với membership. Tạo C đăng nhập nhưng không allowlist: upload-init/complete trả 403, Storage upload trực tiếp bị từ chối, SELECT public books vẫn được. Không dùng C thay B ở case ownership 404.

| # | Test | Kết quả mong đợi |
|---|---|---|
| 1 | Guest gọi upload-init | 401 |
| 2 | B gọi upload-init trên sách private của A | 404 |
| 3 | B upload trực tiếp vào Storage prefix của A | Bị RLS từ chối |
| 4 | User A upload file `.pdf` nhưng bytes là TXT | 415 ở upload-complete |
| 5 | User A upload file >5 MiB | Bị chặn phía client/bucket và complete |
| 6 | Guest gọi file URL sách private A | 404 |
| 7 | User B gọi file URL sách private A | 404 |
| 8 | Guest gọi file URL sách public | Thành công, URL có hạn sử dụng ngắn |
| 9 | A tạo highlight/book note | Thành công |
| 10 | B cố đọc highlights/notes của A qua Supabase Data API | Không trả dữ liệu |
| 11 | A đổi `user_id` khi tạo note thành ID B | RLS từ chối |
| 12 | A reload EPUB | Lấy lại vị trí CFI nếu đã lưu progress |
| 13 | Nhập HTML độc hại vào note | Vue `{{ }}` hiển thị text, không thực thi |
| 14 | SQL Editor có role admin nhìn thấy row | **Không** phải bằng chứng RLS sai |

**Các trường hợp chưa hoàn thiện theo mặc định (không được tự đánh dấu DoD):** PDF text highlight, EPUB sanitization/CDR nâng cao, chống ZIP bomb nghiêm ngặt, atomic upload metadata + storage (hai hệ thống khác nhau), dọn orphan objects và security kiểm thử tự động. Trước khi mở public upload, xử lý ở M5.

## 13. Definition of Done (DoD)

- [ ] Bucket private + file size/MIME restrictions.
- [ ] `book_files`, `reading_progress`, `book_highlights`, `book_notes` có `GRANT`/RLS đúng.
- [ ] User A upload EPUB/PDF 5 MiB; B không thể đọc file của A.
- [ ] Reader EPUB mở trang, đọc text; PDF hiển thị và chuyển trang.
- [ ] Ít nhất EPUB có TOC, progress/CFI, highlight, notes; PDF có note theo page (nếu chưa có text layer).
- [ ] UI ba cột theo bản thiết kế, panel AI vẫn mock.
- [ ] Các test #1–#14 được ghi kết quả thực tế.
- [ ] `pnpm typecheck`, `pnpm build` chạy không lỗi; không có secret client-side.

## Tài liệu tham khảo (tham khảo; rà soát 16/11/2026)

- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/security/ownership
- https://supabase.com/docs/guides/storage/uploads/standard-uploads
- https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl
- https://supabase.com/docs/guides/storage/security/signing-keys
- https://github.com/futurepress/epub.js/blob/master/examples/highlights.html
- https://mozilla.github.io/pdf.js/examples/
