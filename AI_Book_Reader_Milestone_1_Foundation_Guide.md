# AI Book Reader — Milestone 1: Foundation

**Giáo trình thực hành từ đầu đến cuối | Nuxt 3 + TypeScript + Tailwind v4 + shadcn-vue + Supabase Auth/PostgreSQL + Drizzle ORM**  
**Cập nhật tài liệu:** 02/11/2026  
**Đối tượng:** Người học frontend, backend, database và chuẩn bị học AI Application.  
**Môi trường hướng dẫn:** Windows 10/11, PowerShell, VS Code/WebStorm, Node.js 22, pnpm; Supabase Cloud Free.

> **Cách học:** Làm theo thứ tự, đọc phần “Vì sao?” trước khi chép code, chạy ứng dụng sau mỗi checkpoint. Đừng cài tất cả framework ở Milestone 1. Không cần Gemini API key ở giai đoạn này.

---

## Mục lục nhanh

- [0–2. Kết quả, chuẩn bị, tạo Nuxt 3](#0-thành-quả-cuối-cùng)  #Đang ở bước này
- [3–4. Giao diện và Supabase](#3-cài-ui-tailwind-css-v4-và-shadcn-vue)
- [5. Database + migration + RLS](#5-database-với-drizzle-schema-và-migration)
- [6. API server và validation](#6-tạo-kiểu-dữ-liệu-và-api-server)
- [7. Authentication](#7-authentication-pages-và-route-middleware)
- [8–9. Form và các màn hình](#8-form-tạo-sách-dùng-chung-không-upload-file-thật)
- [10–11. Tài khoản admin và 14 bài test](#10-tạo-tài-khoản-và-phân-vai-trò-admin)
- [12–17. Debug, checklist, kiến thức, tài liệu](#12-kiến-trúc-thư-mục-sau-milestone-1)

**Nhịp học gợi ý:** hoàn thành **Checkpoint A–B** trước; sau đó **C** (database), **D** (API), và **E** (giao diện/auth). Đừng nhảy tới phần admin nếu chưa chạy migration và xác nhận trigger.

---

## 0. Thành quả cuối cùng

Sau khi hoàn thành, bạn có thể:

- Chạy dự án Nuxt 3 với TypeScript và Tailwind; sử dụng `Button` của shadcn-vue.
- Hiểu cơ bản sự khác nhau giữa `pages/`, `middleware/`, `server/api/`, `server/db/` và `shared/`.
- Đăng ký, xác nhận email, đăng nhập và đăng xuất bằng Supabase Auth (SSR cookie).
- Tạo bảng `profiles` và `books` qua **Drizzle migration**.
- Tạo profile tự động khi một tài khoản được đăng ký.
- Xem thư viện sách công khai khi chưa đăng nhập; xem sách riêng khi đăng nhập.
- Thêm sách **metadata** (tên, tác giả) dạng private; admin có thể tạo sách public.
- Bảo vệ page lẫn API bằng authentication/authorization và PostgreSQL Row Level Security (RLS).
- Thử nghiệm quyền truy cập giữa hai người dùng và admin; chạy typecheck/build.

**Chưa làm trong Milestone 1:** upload file EPUB/PDF thật, hiển thị ebook, xử lý text, Gemini, embedding, tóm tắt, RAG, streaming. Những việc đó thuộc các milestone kế tiếp.

### Luồng hệ thống

```text
Trình duyệt (Nuxt pages/components)
  ├─ Supabase Auth: signUp / signIn / signOut
  └─ $fetch('/api/...')
       ↓
Nitro API (server/api)
  ├─ serverSupabaseUser(event) → xác minh danh tính
  ├─ Zod → xác minh dữ liệu nhập
  └─ serverSupabaseClient(event) → truy vấn DB mang danh tính user
       ↓
Supabase PostgreSQL
  ├─ profiles / books
  └─ RLS policies: public / owner / admin

Drizzle schema (TypeScript) → drizzle-kit migration (SQL) → PostgreSQL
```

**Quyết định kiến trúc đáng nhớ:** ở Milestone 1, Drizzle dùng để quản lý schema/migrations và thử kết nối database; các request dữ liệu trong Nitro sử dụng **Supabase client theo session của người dùng** để PostgreSQL áp RLS. Nếu sau này dùng Drizzle bằng `DATABASE_URL` trong API, bạn **phải** tự kiểm tra ownership/role trong từng truy vấn: kết nối quản trị trực tiếp thường không tự kế thừa RLS của JWT người dùng.

---

## 1. Chuẩn bị máy và các tài khoản

### 1.1. Kiểm tra môi trường

Mở **PowerShell**:

```powershell
node -v
pnpm -v
git --version
```

Mục tiêu: Node.js **22 LTS** (hoặc phiên bản tương thích Nuxt 3), pnpm có thể chạy, Git đã cài. Nếu chưa có pnpm:

```powershell
corepack enable
corepack pnpm --version
```

Nếu `corepack` không có sẵn, có thể cài pnpm theo hướng dẫn chính thức: <https://pnpm.io/installation>. Kiểm tra lại bằng `pnpm -v`.

**Tài khoản cần có:** [Supabase Dashboard](https://supabase.com/dashboard), tài khoản GitHub/GitLab (tùy chọn để lưu source). **Không cần đăng ký dịch vụ AI** ở phần Foundation.

### 1.2. Nguyên tắc bảo vệ secret

- `NUXT_PUBLIC_SUPABASE_URL` và `NUXT_PUBLIC_SUPABASE_KEY`: là public endpoint/publishable key, frontend dùng được; **không tự nó thay thế RLS**.
- `DATABASE_URL`: chứa mật khẩu PostgreSQL; chỉ sử dụng ở local tooling/server đáng tin cậy.
- `NUXT_SUPABASE_SECRET_KEY` / `service_role`: quyền quản trị có thể bypass RLS; **không dùng trong milestone này và không đưa vào client**.
- `.env` không commit lên Git, không paste lên diễn đàn, không đưa lên screenshot.

---

## 2. Tạo project Nuxt 3

### Bước 2.1 — Khởi tạo bằng template Nuxt 3 (không phải Nuxt 4)

```powershell
pnpm create nuxt@latest ai-book-reader -- -t v3
cd ai-book-reader
pnpm install
pnpm dev
```

Nếu CLI hỏi lựa chọn, ưu tiên pnpm và không thêm các module không nằm trong tài liệu. Truy cập <http://localhost:3000>.

> **Vì sao chọn `-t v3`?** `create-nuxt` hiện có nhiều template. Chọn rõ v3 giúp thống nhất cấu trúc thư mục trong hướng dẫn này: `pages/`, `components/`, `assets/`, `middleware/` ở **root**. Không trộn cấu trúc Nuxt 4 `app/` khi chưa chủ động cấu hình.

### Bước 2.2 — Xác nhận TypeScript

File `tsconfig.json` nên giữ dạng đơn giản:

**`tsconfig.json`**

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

Đừng tự thay cả `compilerOptions` của Nuxt bằng cấu hình TypeScript tự tạo. `.nuxt/tsconfig.json` được Nuxt sinh ra sau `pnpm dev`/`pnpm nuxt prepare`.

### Checkpoint A

- [ ] `pnpm dev` chạy bình thường.
- [ ] Mở được `http://localhost:3000`.
- [ ] Dự án dùng **Nuxt 3**, không phải 4.

---

## 3. Cài UI: Tailwind CSS v4 và shadcn-vue

### Bước 3.1 — Cài Tailwind + Vite plugin

Dừng dev server bằng `Ctrl+C`:

```powershell
pnpm add -D tailwindcss @tailwindcss/vite
pnpm add -D shadcn-nuxt
pnpm add -D typescript vue-tsc
```

Tạo thư mục `assets/css/` và file:

**`assets/css/tailwind.css`**

```css
@import "tailwindcss";
```

**`nuxt.config.ts`** (tạm thời; sẽ bổ sung Supabase ở bước 4)

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  modules: ['shadcn-nuxt'],
  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },
})
```

> `compatibilityDate` là mốc tương thích cấu hình; không bắt buộc phải trùng hôm nay. Nếu template Nuxt đã tạo mốc khác thì giữ mốc đó.

### Bước 3.2 — Khởi tạo shadcn-vue

```powershell
pnpm exec nuxt prepare
pnpm dlx shadcn-vue@latest init
pnpm dlx shadcn-vue@latest add button card input label
```

Khi CLI yêu cầu, chọn `Nuxt`, `Tailwind CSS v4` nếu có câu hỏi tương ứng, màu nền `Neutral` và giữ đường dẫn phù hợp `components/ui`. CLI có thể tự sửa CSS và tạo `components.json`; **đừng ghi đè lại CSS về chỉ một dòng** sau bước init.

### Bước 3.3 — Tạo trang thử

**`app.vue`** (Nuxt 3 ở root):

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

**`pages/index.vue`** (phiên bản thử, sẽ thay ở bước 9):

```vue
<template>
  <main class="mx-auto max-w-3xl p-8">
    <h1 class="mb-4 text-3xl font-bold">AI Book Reader</h1>
    <Button>shadcn-vue hoạt động!</Button>
  </main>
</template>
```

Chạy lại `pnpm dev`, xác nhận button có style. `Button` được `shadcn-nuxt` auto-import nếu module cấu hình đúng.

### Checkpoint B

- [ ] Có `components/ui/button` và `components.json`.
- [ ] Tailwind class `p-8`, `text-3xl` hiển thị đúng.
- [ ] `Button` hoạt động; không có lỗi component chưa đăng ký.

---

## 4. Tạo Supabase project và kết nối Auth

### Bước 4.1 — Tạo project Supabase Free

1. Vào <https://supabase.com/dashboard> → **New project**.
2. Đặt tên, chọn khu vực gần bạn, tạo mật khẩu database **mạnh** và lưu trong password manager.
3. Chờ project được tạo, vào phần **Connect / Project URL / API Keys**.
4. Lấy **Project URL** và **Publishable key** (`sb_publishable_...`). Đừng lấy `secret` key cho frontend.
5. Vào **Authentication → Providers → Email** và bật email/password.
6. Vào **Authentication → URL Configuration**: đặt **Site URL** là `http://localhost:3000`; thêm `http://localhost:3000/confirm` vào **Redirect URLs**.

**Giới hạn email rất dễ mắc:** trên hosted Supabase Free, email mặc định chỉ gửi đến email thành viên trong Supabase organization và có rate limit rất thấp (tài liệu hiện ghi khoảng 2 email/giờ). Hãy thử với email thuộc team; khi cần test nhiều tài khoản, có thể tạo tài khoản test đã xác nhận trong Dashboard → Authentication → Users; hoặc cấu hình SMTP riêng. Đừng tắt email confirmation trong ứng dụng thực tế chỉ để né vấn đề này.

### Bước 4.2 — Cài Supabase Nuxt module

```powershell
pnpm add @nuxtjs/supabase
```

Tạo **`.env`** ở root:

```dotenv
NUXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=YOUR_PUBLISHABLE_KEY
DATABASE_URL=postgresql://YOUR_DB_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_POOLER_HOST:5432/postgres
```

`DATABASE_URL`: copy từ **Supabase → Connect → Session pooler** (hữu ích khi mạng không hỗ trợ IPv6). Không thay chuỗi mẫu bằng `YOUR_...` nếu chưa xác định chính xác URL. Nếu mật khẩu có ký tự `@`, `#`, `/`, `:` ... phải URL-encode phần password; cách dễ nhất là sử dụng connection string Supabase cung cấp và thay placeholder một cách an toàn.

Tạo **`.env.example`** để commit (KHÔNG có secret thật):

```dotenv
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_KEY=
DATABASE_URL=
```

Kiểm tra **`.gitignore`** có:

```gitignore
.env
.env.*
!.env.example
```

### Bước 4.3 — Cập nhật `nuxt.config.ts` hoàn chỉnh

**`nuxt.config.ts`** (thay phiên bản bước 3)

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  modules: ['shadcn-nuxt', '@nuxtjs/supabase'],
  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },
  supabase: {
    redirect: false,    // Tự viết route middleware để hiểu auth
    useSsrCookies: true,
    types: false,      // M1: tạo type DTO thủ công; về sau sẽ gen Supabase DB types
  },
})
```

**Vì sao đặt `redirect: false`?** Module Supabase có redirect tự động, nhưng milestone này chủ động tạo `middleware/auth.ts` để học rõ khác biệt giữa client navigation và kiểm tra quyền trong API. `useSsrCookies: true` giúp session có thể sử dụng khi SSR và trong Nitro request.

**Cảnh báo:** `types: false` chỉ bỏ qua việc nạp các types Supabase DB được generate, không tắt TypeScript trong app. Ở phần mở rộng ta sẽ dùng `supabase gen types`.

---

## 5. Database với Drizzle: schema và migration

### 5.1. Tìm hiểu 4 khái niệm

| Khái niệm | Ý nghĩa | Liên hệ với project |
|---|---|---|
| Schema | Mô tả bảng, cột, kiểu dữ liệu | `profiles`, `books` |
| Migration | SQL thay đổi cấu trúc DB có lịch sử | Tạo bảng, FK, RLS |
| ORM | Viết query hoặc schema bằng TypeScript | Drizzle |
| RLS | DB quyết định user nhìn/sửa được hàng nào | Không thấy private books của user khác |

### Bước 5.1 — Cài dependency

```powershell
pnpm add drizzle-orm postgres zod
pnpm add -D drizzle-kit dotenv tsx
```

**Thêm scripts** vào `package.json` (giữ nguyên các scripts khác do Nuxt tạo):

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:check": "tsx scripts/db-check.ts",
    "typecheck": "nuxt typecheck"
  }
}
```

> Chỉ **ghép** các keys trong `scripts`, đừng thay nguyên `package.json` bằng ví dụ này. Commit `pnpm-lock.yaml` để các máy dùng cùng dependency versions. Hướng dẫn dùng bản package ổn định được pnpm giải quyết lúc cài; nếu bạn đang dùng một bản Drizzle RC, migration layout có thể khác hình minh họa.

### Bước 5.2 — Định nghĩa schema

Tạo **`server/db/schema.ts`**:

```ts
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: varchar('display_name', { length: 100 }),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check('profiles_role_check', sql`${table.role} in ('user', 'admin')`),
])

export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 180 }).notNull(),
  author: varchar('author', { length: 120 }).notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check('books_visibility_check', sql`${table.visibility} in ('public', 'private')`),
  index('books_owner_id_idx').on(table.ownerId),
  index('books_created_at_idx').on(table.createdAt),
])

export type Profile = typeof profiles.$inferSelect
export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
```

**Giải thích:** `uuid` là ID, `notNull` yêu cầu có giá trị, `defaultNow` cho ngày tạo, `references` là khóa ngoại, `check` đảm bảo DB không nhận giá trị role/visibility lạ. `enum` trên `text()` chủ yếu cho TypeScript, nên DB vẫn cần `check`.

> Chưa tham chiếu `auth.users` trong schema TypeScript vì đó là bảng do Supabase quản lý, không muốn Drizzle nghĩ phải tự tạo bảng `auth.users`. Ta thêm FK bằng custom SQL migration ở bước sau.

### Bước 5.3 — Cấu hình migration

**`drizzle.config.ts`**:

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL in .env')
}

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
})
```

### Bước 5.4 — Generate SQL migration

```powershell
pnpm db:generate
```

Mở file migration SQL được tạo trong `drizzle/`, kiểm tra có `CREATE TABLE "profiles"`, `CREATE TABLE "books"`, indexes/check constraints.

**Không dùng** `drizzle-kit push` trong project này: ta muốn có migration được review và lưu vào Git. Tạm thời **chưa chạy migrate**, vì phải bổ sung FK/RLS/trigger ngay trước đó.

### Bước 5.5 — Custom migration: FK, trigger và RLS

Tạo migration riêng:

```powershell
pnpm exec drizzle-kit generate --custom --name=auth-and-rls
```

Mở file `.sql` mới tạo, **thay toàn bộ nội dung** bằng đoạn SQL dưới đây. Drizzle một số phiên bản tạo đường dẫn `drizzle/<timestamp>_auth-and-rls/migration.sql`, phiên bản khác dùng `drizzle/0001_*.sql`; luôn tìm đúng migration SQL mới mà CLI vừa báo. Giữ marker `--> statement-breakpoint` để Drizzle có thể tách statement.

**`drizzle/<custom-migration>.sql`**:

```sql
-- Link profiles -> Supabase Auth. Supabase quản lý auth.users.
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
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  split_part(new.email, '@', 1)), 100)
  );
  return new;
end;
$$;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
--> statement-breakpoint

-- Hàm trigger chạy với quyền definer, không mở quyền gọi RPC ra ngoài.
revoke all on function public.handle_new_user() from public, anon, authenticated;
--> statement-breakpoint

-- Không dựa vào default GRANT. Thu hồi trước, cấp lại đúng quyền.
revoke all on table public.profiles from anon, authenticated;
--> statement-breakpoint
revoke all on table public.books from anon, authenticated;
--> statement-breakpoint

grant select on table public.profiles to authenticated;
--> statement-breakpoint
grant select on table public.books to anon;
--> statement-breakpoint
grant select, insert on table public.books to authenticated;
--> statement-breakpoint

alter table public.profiles enable row level security;
--> statement-breakpoint
alter table public.books enable row level security;
--> statement-breakpoint

-- User chỉ được xem profile của chính mình.
create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = (select auth.uid()));
--> statement-breakpoint

-- Ai cũng được xem sách public.
create policy "books_select_public"
on public.books for select to anon, authenticated
using (visibility = 'public');
--> statement-breakpoint

-- User chỉ được xem sách private của mình.
create policy "books_select_own"
on public.books for select to authenticated
using (owner_id = (select auth.uid()));
--> statement-breakpoint

-- User thường chỉ tạo sách private do chính mình sở hữu.
create policy "books_insert_private"
on public.books for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and visibility = 'private'
);
--> statement-breakpoint

-- Admin có quyền tạo sách public, nhưng cũng phải tự là owner.
-- Role ở bảng profiles chỉ được chỉnh bởi trusted backend/admin SQL.
create policy "books_admin_insert_public"
on public.books for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and visibility = 'public'
  and exists (
    select 1 from public.profiles as p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);
```

**Rất quan trọng:** Không tạo API cho phép cập nhật trường `profiles.role`. Vai trò admin được cấp bằng SQL Editor cho tài khoản đáng tin cậy ở bước 10. Không lấy `role` từ dữ liệu người dùng tự gửi hoặc `user_metadata`.

**Về người dùng đã đăng ký trước migration:** trigger chỉ chạy khi tạo user mới. Vì vậy hãy tạo tài khoản test **sau khi** chạy migration. Nếu đã tạo trước, phải backfill profile có kiểm soát trước khi test.

### Bước 5.6 — Chạy migration

```powershell
pnpm db:migrate
```

Trong Supabase **Table Editor** cần thấy `profiles` và `books`. Trong SQL Editor chạy:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'books')
  and c.relkind = 'r';
```

Cả hai bảng phải có RLS bật (`rls_enabled = true`).

**Thêm kiểm tra migration:**

```sql
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'books')
order by tablename, policyname;
```

### Bước 5.7 — Thử Drizzle kết nối DB từ script local

Tạo **`scripts/db-check.ts`**:

```ts
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is missing')

// Session pooler (port 5432) khuyến nghị cho ví dụ này.
// Nếu chuyển Transaction pooler (6543), dùng prepare: false.
const client = postgres(url, { max: 1, prepare: false })
const db = drizzle({ client })

try {
  const result = await db.execute(sql`select 1 as ok`)
  console.log('Database connected:', result)
} finally {
  await client.end()
}
```

Chạy:

```powershell
pnpm db:check
```

> Đây là script chạy trên máy developer, **không phải API cho người dùng**. `DATABASE_URL` có thể kết nối bằng quyền PostgreSQL mạnh hơn user JWT và thường bypass RLS. Đó là lý do Nitro routes phía dưới không dùng driver này để phục vụ truy vấn theo user.

### Checkpoint C

- [ ] Migration thành công, không chạy lặp vô hạn.
- [ ] Có `profiles`, `books`, khóa ngoại, RLS và 5 policies (`profiles` 1, `books` 4).
- [ ] `pnpm db:check` thành công.
- [ ] Không có mật khẩu trong Git.

---

## 6. Tạo kiểu dữ liệu và API server

### 6.1. Học khái niệm request–response

Khi Vue gọi `$fetch('/api/books')`, request tới file `server/api/books/index.get.ts` (Nitro). Server xác thực user, dùng Supabase client với session hiện tại, truy vấn dữ liệu; PostgreSQL quyết định row nào được trả về nhờ RLS.

### Bước 6.1 — Shared DTO

Tạo **`shared/types/book.ts`**:

```ts
export interface BookDto {
  id: string
  title: string
  author: string
  owner_id: string
  visibility: 'public' | 'private'
  created_at: string
}

export interface CreateBookBody {
  title: string
  author: string
  visibility: 'public' | 'private'
}
```

> DTO (Data Transfer Object) là cấu trúc dữ liệu API gửi qua mạng. Database schema có thể dùng camelCase trong TypeScript, nhưng response của Supabase `.from()` theo tên SQL sẽ là `snake_case`.

### Bước 6.2 — API `GET /api/books`

Tạo **`server/api/books/index.get.ts`**:

```ts
import { serverSupabaseClient } from '#supabase/server'
import type { BookDto } from '~/shared/types/book'

export default defineEventHandler(async (event): Promise<BookDto[]> => {
  // Dùng cookie/session của request; RLS sẽ lọc bản ghi.
  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, owner_id, visibility, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/books]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'Cannot load books' })
  }

  return (data ?? []) as BookDto[]
})
```

Không có session: RLS chỉ trả sách public. Có session: RLS trả sách public và sách của user hiện tại.

### Bước 6.3 — API `GET /api/me`

Tạo **`server/api/me.get.ts`**:

```ts
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: 'Profile unavailable' })
  }

  return { id: user.id, email: user.email, profile: data }
})
```

**Điểm mấu chốt:** không nhận `userId` từ body/query để xác định người đang đăng nhập; lấy từ Supabase Auth đã xác minh.

### Bước 6.4 — Validation Zod cho tạo sách

Tạo **`server/modules/books/book.schema.ts`**:

```ts
import { z } from 'zod'

export const createBookSchema = z.object({
  title: z.string().trim().min(1).max(180),
  author: z.string().trim().min(1).max(120),
  visibility: z.enum(['public', 'private']).default('private'),
})
```

Tạo **`server/api/books/index.post.ts`**:

```ts
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createBookSchema } from '~/server/modules/books/book.schema'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Login required' })
  }

  const payload = createBookSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid book data' })
  }

  const supabase = await serverSupabaseClient(event)

  if (payload.data.visibility === 'public') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || profile?.role !== 'admin') {
      throw createError({ statusCode: 403, statusMessage: 'Admin required' })
    }
  }

  const { data, error } = await supabase
    .from('books')
    .insert({
      title: payload.data.title,
      author: payload.data.author,
      visibility: payload.data.visibility,
      owner_id: user.id, // CHỈ do server gán
    })
    .select('id, title, author, owner_id, visibility, created_at')
    .single()

  if (error || !data) {
    console.error('[POST /api/books]', error?.message)
    throw createError({ statusCode: 500, statusMessage: 'Cannot create book' })
  }

  setResponseStatus(event, 201)
  return data
})
```

**Hai hàng rào bảo vệ:** Nitro chặn user thường tạo `public`; PostgreSQL RLS cũng chặn, kể cả khi người khác cố gọi Data API của Supabase trực tiếp. Không có API update/delete ở M1 để giảm bề mặt tấn công.

### Bước 6.5 — API chỉ admin

Tạo **`server/api/admin/ping.get.ts`**:

```ts
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || data?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  return { ok: true, message: 'Admin access granted' }
})
```

> Ẩn nút bằng `v-if` hoặc route middleware **không phải bảo mật**. Endpoint server phải xác minh user và quyền của họ mỗi lần gọi.

### Checkpoint D

- [ ] Khi chưa có sách, `GET /api/books` trả `[]`.
- [ ] Khi chưa đăng nhập, `GET /api/me` trả HTTP 401.
- [ ] Khi chưa đăng nhập, `GET /api/admin/ping` trả HTTP 401.

---

## 7. Authentication pages và route middleware

### Bước 7.1 — Middleware `auth`

**`middleware/auth.ts`**:

```ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
```

> Đây là **navigation guard** giúp UX tốt hơn, không phải chốt bảo mật cuối cùng. Server API và RLS mới bảo vệ dữ liệu. Nếu auth state chưa hydrate trong một số tình huống redirect, dùng SSR cookies (đã bật) và kiểm tra đường dẫn `/confirm`.

### Bước 7.2 — Trang đăng ký

**`pages/register.vue`**:

```vue
<script setup lang="ts">
const supabase = useSupabaseClient()
const name = ref('')
const email = ref('')
const password = ref('')
const busy = ref(false)
const errorText = ref('')
const successText = ref('')

async function register() {
  errorText.value = ''
  successText.value = ''
  busy.value = true

  try {
    const { error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: {
        data: { display_name: name.value.trim() },
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    })
    if (error) throw error
    successText.value = 'Đã gửi yêu cầu đăng ký. Kiểm tra email xác nhận (nếu được bật).'
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Đăng ký thất bại.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-md space-y-5 p-8">
    <h1 class="text-2xl font-semibold">Tạo tài khoản</h1>
    <form class="space-y-3" @submit.prevent="register">
      <div class="space-y-1">
        <Label for="name">Tên hiển thị</Label>
        <Input id="name" v-model="name" maxlength="100" required />
      </div>
      <div class="space-y-1">
        <Label for="email">Email</Label>
        <Input id="email" v-model="email" type="email" required />
      </div>
      <div class="space-y-1">
        <Label for="password">Mật khẩu (ít nhất 8 ký tự)</Label>
        <Input id="password" v-model="password" type="password" minlength="8" required />
      </div>
      <Button class="w-full" type="submit" :disabled="busy">
        {{ busy ? 'Đang tạo...' : 'Đăng ký' }}
      </Button>
    </form>
    <p v-if="errorText" role="alert" class="text-sm text-red-600">{{ errorText }}</p>
    <p v-if="successText" class="text-sm text-green-700">{{ successText }}</p>
    <NuxtLink to="/login" class="text-sm underline">Đã có tài khoản? Đăng nhập</NuxtLink>
  </main>
</template>
```

**Giải thích:** `signUp` gọi Supabase Auth; sau đó trigger SQL tạo profile role `user`. Mật khẩu chỉ gửi đến Supabase Auth qua HTTPS; không lưu mật khẩu vào `profiles`.

### Bước 7.3 — Trang xác nhận email

**`pages/confirm.vue`**:

```vue
<script setup lang="ts">
const user = useSupabaseUser()

watch(user, async (value) => {
  if (value) await navigateTo('/my-books', { replace: true })
}, { immediate: true })
</script>

<template>
  <main class="mx-auto max-w-lg space-y-3 p-10">
    <h1 class="text-2xl font-semibold">Xác nhận đăng nhập</h1>
    <p>Ứng dụng đang xử lý đường dẫn xác nhận từ email...</p>
    <p class="text-sm text-slate-600">
      Nếu chưa chuyển trang, hãy thử mở lại liên kết email hoặc
      <NuxtLink to="/login" class="underline">đăng nhập</NuxtLink>.
    </p>
  </main>
</template>
```

### Bước 7.4 — Trang đăng nhập

**`pages/login.vue`**:

```vue
<script setup lang="ts">
const supabase = useSupabaseClient()
const route = useRoute()
const email = ref('')
const password = ref('')
const busy = ref(false)
const errorText = ref('')

async function login() {
  busy.value = true
  errorText.value = ''

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })
    if (error) throw error

    const target = route.query.redirect
    const safeTarget = typeof target === 'string'
      && target.startsWith('/') && !target.startsWith('//')
      ? target
      : '/my-books'

    await navigateTo(safeTarget, { replace: true })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Đăng nhập thất bại.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-md space-y-5 p-8">
    <h1 class="text-2xl font-semibold">Đăng nhập AI Book Reader</h1>
    <form class="space-y-3" @submit.prevent="login">
      <div class="space-y-1">
        <Label for="email">Email</Label>
        <Input id="email" v-model="email" type="email" required />
      </div>
      <div class="space-y-1">
        <Label for="password">Mật khẩu</Label>
        <Input id="password" v-model="password" type="password" required />
      </div>
      <Button class="w-full" type="submit" :disabled="busy">
        {{ busy ? 'Đang đăng nhập...' : 'Đăng nhập' }}
      </Button>
    </form>
    <p v-if="errorText" role="alert" class="text-sm text-red-600">{{ errorText }}</p>
    <NuxtLink to="/register" class="text-sm underline">Chưa có tài khoản? Đăng ký</NuxtLink>
  </main>
</template>
```

> `safeTarget` kiểm tra đích redirect dạng đường dẫn nội bộ để giảm open-redirect. Trong ứng dụng lớn, có thể dùng allowlist các route đích thay vì chỉ kiểm tra prefix.

### Bước 7.5 — Header có logout

**`components/AppHeader.vue`**:

```vue
<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const signingOut = ref(false)

async function logout() {
  signingOut.value = true
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await navigateTo('/', { replace: true })
  } catch (error) {
    console.error('Logout failed', error)
    alert('Đăng xuất thất bại. Vui lòng thử lại.')
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <header class="border-b bg-white/90">
    <nav class="mx-auto flex max-w-6xl items-center gap-4 p-4">
      <NuxtLink to="/" class="mr-auto font-semibold">📖 AI Book Reader</NuxtLink>
      <NuxtLink to="/" class="text-sm">Public Library</NuxtLink>
      <NuxtLink v-if="user" to="/my-books" class="text-sm">My Books</NuxtLink>
      <NuxtLink v-if="user" to="/admin" class="text-sm">Admin</NuxtLink>
      <template v-if="user">
        <span class="hidden text-xs text-slate-500 sm:inline">{{ user.email }}</span>
        <Button variant="outline" :disabled="signingOut" @click="logout">
          {{ signingOut ? 'Đang thoát...' : 'Đăng xuất' }}
        </Button>
      </template>
      <NuxtLink v-else to="/login"><Button>Đăng nhập</Button></NuxtLink>
    </nav>
  </header>
</template>
```

> Link `Admin` vẫn hiện với user thường để bạn tự test HTTP 403. Sau milestone này, chỉ hiện nếu role admin. Dù ẩn hay hiện, server phải chặn đúng.

---

## 8. Form tạo sách dùng chung (không upload file thật)

Tạo **`components/BookCreateForm.vue`**:

```vue
<script setup lang="ts">
import type { CreateBookBody } from '~/shared/types/book'

const props = defineProps<{ allowPublic: boolean }>()
const emit = defineEmits<{ created: [] }>()

const title = ref('')
const author = ref('')
const visibility = ref<'private' | 'public'>('private')
const busy = ref(false)
const errorText = ref('')
const successText = ref('')

async function submit() {
  busy.value = true
  errorText.value = ''
  successText.value = ''

  try {
    const body: CreateBookBody = {
      title: title.value.trim(),
      author: author.value.trim(),
      visibility: props.allowPublic ? visibility.value : 'private',
    }
    await $fetch('/api/books', { method: 'POST', body })
    title.value = ''
    author.value = ''
    visibility.value = 'private'
    successText.value = 'Đã tạo sách metadata.'
    emit('created')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Tạo sách thất bại.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-3 rounded-xl border bg-white p-5" @submit.prevent="submit">
    <h2 class="font-semibold">Thêm sách (chỉ metadata)</h2>
    <div class="space-y-1">
      <Label for="book-title">Tên sách</Label>
      <Input id="book-title" v-model="title" maxlength="180" required />
    </div>
    <div class="space-y-1">
      <Label for="book-author">Tác giả</Label>
      <Input id="book-author" v-model="author" maxlength="120" required />
    </div>
    <div v-if="allowPublic" class="space-y-1">
      <Label for="book-visibility">Chế độ hiển thị</Label>
      <select id="book-visibility" v-model="visibility" class="w-full rounded-md border p-2">
        <option value="private">Private</option>
        <option value="public">Public</option>
      </select>
    </div>
    <Button type="submit" :disabled="busy">
      {{ busy ? 'Đang lưu...' : 'Tạo sách' }}
    </Button>
    <p v-if="errorText" role="alert" class="text-sm text-red-600">{{ errorText }}</p>
    <p v-if="successText" class="text-sm text-green-700">{{ successText }}</p>
  </form>
</template>
```

**Vì sao `allowPublic` không phải security?** Đây chỉ là UI. User có thể sửa request trong DevTools. `POST /api/books` và RLS mới thực sự quyết định ai được tạo public book.

---

## 9. Ba màn hình thư viện

### Bước 9.1 — Public Library

**`pages/index.vue`** (thay file demo bước 3):

```vue
<script setup lang="ts">
import type { BookDto } from '~/shared/types/book'

const { data: books, pending, error, refresh } = await useFetch<BookDto[]>('/api/books', {
  default: () => [],
})

const publicBooks = computed(() => books.value.filter(book => book.visibility === 'public'))
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <AppHeader />
    <main class="mx-auto max-w-6xl space-y-6 p-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-semibold">Public Library</h1>
          <p class="text-slate-500">Thư viện chung — Milestone 1</p>
        </div>
        <Button variant="outline" @click="refresh()">Làm mới</Button>
      </div>
      <p v-if="pending">Đang tải...</p>
      <p v-else-if="error" role="alert">Không tải được thư viện.</p>
      <p v-else-if="publicBooks.length === 0" class="text-slate-500">
        Chưa có sách công khai. Admin hãy thêm sách ở /admin.
      </p>
      <div v-else class="grid gap-4 md:grid-cols-3">
        <Card v-for="book in publicBooks" :key="book.id">
          <CardHeader>
            <CardTitle>{{ book.title }}</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-slate-500">{{ book.author }}</p>
            <p class="mt-2 text-xs">Public</p>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
```

**Chú ý:** CLI `shadcn-vue add card` tạo `Card`, `CardHeader`, `CardTitle`, `CardContent`; chúng được auto-import qua `shadcn-nuxt`. Nếu auto-import không hoạt động, import trực tiếp từ `~/components/ui/card`.

### Bước 9.2 — My Books

**`pages/my-books.vue`**:

```vue
<script setup lang="ts">
import type { BookDto } from '~/shared/types/book'

definePageMeta({ middleware: 'auth' })

const { data: books, pending, error, refresh } = await useFetch<BookDto[]>('/api/books', {
  default: () => [],
})
const privateBooks = computed(() => books.value.filter(book => book.visibility === 'private'))
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppHeader />
    <main class="mx-auto max-w-5xl space-y-5 p-6">
      <h1 class="text-3xl font-semibold">My Books</h1>
      <p class="text-sm text-slate-500">
        Đây mới là bản ghi metadata; upload EPUB/PDF sẽ triển khai ở Milestone 2.
      </p>
      <BookCreateForm :allow-public="false" @created="refresh()" />
      <p v-if="pending">Đang tải...</p>
      <p v-else-if="error" role="alert">Không đọc được dữ liệu.</p>
      <div v-else class="space-y-2">
        <p v-if="privateBooks.length === 0">Chưa có sách riêng.</p>
        <div v-for="book in privateBooks" :key="book.id"
             class="rounded-lg border bg-white p-4">
          <strong>{{ book.title }}</strong>
          <p class="text-sm text-slate-500">{{ book.author }}</p>
        </div>
      </div>
    </main>
  </div>
</template>
```

### Bước 9.3 — Admin

**`pages/admin.vue`**:

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data, pending, error } = await useFetch<{ ok: boolean }>('/api/admin/ping')
const canManage = computed(() => !error.value && data.value?.ok === true)

const message = ref('')
async function onCreated() {
  message.value = 'Đã tạo sách thành công. Mở Public Library để kiểm tra.'
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppHeader />
    <main class="mx-auto max-w-4xl space-y-5 p-6">
      <h1 class="text-3xl font-semibold">Admin</h1>
      <p v-if="pending">Đang kiểm tra quyền...</p>
      <p v-else-if="!canManage" role="alert" class="text-red-700">
        403 — Bạn không có quyền admin.
      </p>
      <template v-else>
        <p>Bạn đã được backend xác nhận là admin.</p>
        <BookCreateForm :allow-public="true" @created="onCreated" />
        <p class="text-sm text-green-700">{{ message }}</p>
      </template>
    </main>
  </div>
</template>
```

### Checkpoint E

- [ ] Có 3 trang `/`, `/my-books`, `/admin`.
- [ ] Khi chưa login mở `/my-books` thì chuyển tới `/login`.
- [ ] Sau login có thể tạo sách private.
- [ ] User thường không mở được nội dung admin (backend 403).

---

## 10. Tạo tài khoản và phân vai trò admin

1. Chạy `pnpm dev`, truy cập `/register`.
2. Tạo tài khoản bằng email thuộc Supabase organization; xác nhận email theo link gửi tới hộp thư. Nếu email provider mặc định từ chối, xem mục troubleshooting.
3. Đăng nhập `/login`, vào `/my-books`, tạo sách **private**.
4. Vào Supabase Dashboard → **Authentication → Users**, copy UUID của tài khoản muốn làm admin.
5. Chỉ trong **Supabase SQL Editor**, chạy lệnh dưới, thay UUID thật:

```sql
update public.profiles
set role = 'admin'
where id = 'REPLACE_WITH_REAL_AUTH_USER_UUID';
```

6. Truy cập `/admin` (reload), tạo một sách có `visibility = public`.
7. Mở cửa sổ Incognito **chưa đăng nhập**, truy cập `/`: phải thấy sách public nhưng **không thấy** sách private.

**Không làm:** API `POST /api/promote-to-admin` dựa vào userId do client đưa lên; nếu có thì đây là lỗ hổng phân quyền nghiêm trọng.

---

## 11. Bài test bắt buộc (tư duy backend/security)

Tạo hai tài khoản A, B (xác nhận/khởi tạo trong Dashboard nếu cần), và một tài khoản admin. Test các case sau:

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Guest mở `/` | HTTP 200, thấy public books |
| 2 | Guest vào `/my-books` | Redirect `/login` |
| 3 | Guest gọi `/api/me` | HTTP 401 |
| 4 | Guest `POST /api/books` | HTTP 401 |
| 5 | User A tạo sách private | HTTP 201 |
| 6 | User B mở `/api/books` | **Không** thấy private book của A |
| 7 | A gọi `/api/books` | Thấy sách public và private của A |
| 8 | User A `POST visibility: public` | HTTP 403 |
| 9 | User A gọi `/api/admin/ping` | HTTP 403 |
| 10 | Admin tạo sách public | HTTP 201; guest nhìn thấy |
| 11 | User B gọi trực tiếp Supabase Data API để lấy private của A | Không thấy row do RLS |
| 12 | Gửi title rỗng / quá 180 ký tự | HTTP 400 |
| 13 | Logout rồi reload `/my-books` | Redirect login |
| 14 | `pnpm typecheck` và `pnpm build` | Không có lỗi |

Bạn có thể thử request qua browser DevTools → Network, hoặc REST Client/Postman. Với endpoint yêu cầu login, cần gửi cookie/session hợp lệ; gọi bằng Postman không có session sẽ trả 401 là đúng.

### Kiểm tra RLS trực tiếp

Test RLS bằng hai tài khoản thực sự là đáng tin cậy nhất ở M1. **Không dùng Supabase SQL Editor để chứng minh user thường có quyền**: SQL Editor chạy với quyền cao nên có thể nhìn thấy toàn bộ row, kể cả khi RLS hoạt động đúng.

### Không thử XSS bằng việc hiển thị `v-html`

Các tên sách được render bằng `{{ book.title }}`; Vue escape HTML theo mặc định. Đừng chuyển sang `v-html` đối với nội dung do người dùng nhập.

---

## 12. Kiến trúc thư mục sau Milestone 1

```text
ai-book-reader/
├── assets/
│   └── css/tailwind.css
├── components/
│   ├── ui/                       # shadcn-vue CLI sinh ra
│   ├── AppHeader.vue
│   └── BookCreateForm.vue
├── middleware/
│   └── auth.ts
├── pages/
│   ├── index.vue                 # Public Library
│   ├── register.vue
│   ├── login.vue
│   ├── confirm.vue
│   ├── my-books.vue
│   └── admin.vue
├── server/
│   ├── api/
│   │   ├── me.get.ts
│   │   ├── admin/ping.get.ts
│   │   └── books/
│   │       ├── index.get.ts
│   │       └── index.post.ts
│   ├── db/schema.ts
│   └── modules/books/book.schema.ts
├── shared/
│   └── types/book.ts
├── scripts/
│   └── db-check.ts
├── drizzle/                      # migrations SQL + snapshots
├── app.vue
├── nuxt.config.ts
├── drizzle.config.ts
├── components.json
├── tsconfig.json
├── .env                           # KHÔNG commit
├── .env.example                   # ĐƯỢC commit
├── pnpm-lock.yaml
└── package.json
```

### Tại sao chưa chia mọi thứ thành service/repository/composable?

Vì phần Foundation chỉ có hai bảng, bốn API và một số trang. Tách quá sớm thành 10 lớp abstraction sẽ cản trở học request–response. Khi đến Milestone 2, bạn có thể tạo `features/library`, `features/book-upload` và `server/modules/ingestion` để đóng gói logic lớn hơn.

---

## 13. Các lỗi thường gặp và cách xử lý

| Dấu hiệu | Nguyên nhân có khả năng | Cách kiểm tra/sửa |
|---|---|---|
| `useSupabaseClient is not defined` | Chưa thêm module hoặc chưa prepare | Kiểm tra `modules`, chạy `pnpm exec nuxt prepare`, restart dev |
| `Cannot find name computed/ref` trong IDE | Nuxt types chưa sinh / IDE chưa tải lại | `pnpm exec nuxt prepare`, reload TS Server; có thể explicit import từ `vue` |
| `Cannot find module vue-tsc/package.json` | Thiếu/sai version checker | `pnpm add -D typescript vue-tsc`; không cài `vite-plugin-checker` ngoài nếu không dùng |
| `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF` | `node_modules` được tạo bằng pnpm config khác | Kiểm tra `pnpm config get virtual-store-dir-max-length`; thống nhất config, cài lại dependencies khi cần |
| Tailwind classes không có tác dụng | Chưa gắn Vite plugin/CSS | Kiểm tra `vite.plugins`, `css`, import `@import "tailwindcss"` |
| `Button` unknown component | Chưa add component hoặc shadcn module | `pnpm dlx shadcn-vue@latest add button` rồi restart |
| `Missing SUPABASE_URL` | `.env` sai tên / sai đường dẫn | Dùng `NUXT_PUBLIC_SUPABASE_URL` và `NUXT_PUBLIC_SUPABASE_KEY`; restart |
| `email_address_not_authorized` | Supabase SMTP mặc định chỉ gửi đến team | Dùng email thành viên Supabase organization hoặc SMTP riêng |
| `email rate limit exceeded` | Hết quota email miễn phí | Chờ quota reset hoặc dùng auth user test được xác nhận sẵn; đừng spam nút gửi |
| Postgres connection refused / DNS | Sai pooler host/port, SSL, credentials, IPv6 | Copy lại `Session pooler` từ Supabase Connect; thử `pnpm db:check` |
| Drizzle migration syntax error | Sai SQL, thiếu statement breakpoint, package khác version | Đọc migration SQL và stacktrace; dùng đúng CLI/cặp package tương thích |
| Profile không tự tạo | Trigger chưa có / user tồn tại trước migration | Kiểm tra trigger và auth user thời điểm tạo; backfill có kiểm soát |
| `permission denied for table books` | Thiếu GRANT | Kiểm tra custom migration `grant select/insert` |
| Có sách nhưng trả `[]` | RLS đúng đang chặn hoặc sai owner | Kiểm tra `visibility`, `owner_id`, session; đừng tắt RLS để “sửa nhanh” |
| Login được nhưng `/api/me` 401 | Cookie SSR chưa đồng bộ / sai URL | `useSsrCookies: true`, reload, kiểm tra cookie và Auth session |
| `/confirm` không chuyển trang | Email Redirect URL sai / callback lỗi | Cho phép `/confirm` trong Dashboard; xem console và Auth logs |
| Migration đã chạy, sửa SQL nhưng không có tác dụng | Migration đã được đánh dấu applied | Tạo **migration mới**, không sửa lịch sử đã áp dụng trên DB dùng chung |

**Nguyên tắc debug:** đọc lỗi đầu tiên trong terminal, xác định nó đến từ build, browser, Nitro API, PostgreSQL hay Supabase Auth; không chữa bằng cách tắt tất cả bảo vệ.

---

## 14. Hoàn tất, chạy lại từ đầu và lưu Git

### Kiểm tra cuối

```powershell
pnpm exec nuxt prepare
pnpm typecheck
pnpm build
pnpm dev
```

Trong PowerShell:

```powershell
git status
git add .
git commit -m "feat: initialize AI Book Reader foundation"
```

**Kiểm tra thật kỹ `git status` trước commit**: `.env` không được xuất hiện trong staged files. Nếu lỡ stage `.env`, chạy `git rm --cached .env`; nếu đã push secret lên remote, phải rotate key/mật khẩu.

**Không chạy `db:migrate` tự động mỗi lần Nuxt khởi động.** Migrations cần được áp dụng có kiểm soát khi deploy; không để mọi instance tự tranh nhau sửa schema.

### Definition of Done — Milestone 1

- [ ] Project Nuxt 3 chạy, Tailwind + shadcn-vue hiển thị đúng.
- [ ] Supabase Free project kết nối thành công.
- [ ] Drizzle schema/migrations đã commit; DB có `profiles`, `books`.
- [ ] RLS policies, GRANT và trigger được kiểm tra.
- [ ] Đăng ký/xác nhận/đăng nhập/đăng xuất chạy.
- [ ] User tạo và xem private book metadata.
- [ ] Admin tạo public book, guest có thể đọc metadata.
- [ ] User B không thể xem private book của user A.
- [ ] API auth trả HTTP 401 và admin trả 403 đúng điều kiện.
- [ ] Zod chặn input không hợp lệ.
- [ ] `pnpm db:check`, `pnpm typecheck`, `pnpm build` chạy thành công.
- [ ] `.env` được bảo vệ, không có secret trong frontend hoặc Git.

---

## 15. Nên học gì từ từng phần?

| Phần | Kiến thức nền | Bài tập tự làm |
|---|---|---|
| Nuxt `pages/` | File-based routing, SSR | Tạo `/about` giới thiệu app |
| Vue `<script setup>` | `ref`, `computed`, `watch`, event | Thêm hiển thị trạng thái loading đẹp hơn |
| Tailwind/shadcn | Utility CSS, component composition | Tạo light/dark header |
| Nitro `server/api` | REST, HTTP 200/201/400/401/403 | Thêm `GET /api/health` không lộ secret |
| Zod | Runtime validation | Chặn title chỉ chứa khoảng trắng (đã có `.trim()`) |
| Supabase Auth | Cookie, session, PKCE, JWT | Vẽ luồng login bằng tay |
| PostgreSQL/Drizzle | Primary key, foreign key, check, migration | Thêm trường `description` qua migration mới |
| RLS | Authorization, row-level isolation | Giải thích tại sao user B không thấy sách A |
| Git | Commit và lịch sử phiên bản | Tạo branch `feature/profile-edit` |

**Bài tập nâng cao có kiểm soát:** tạo trường `description` tối đa 500 ký tự. Sửa Drizzle schema → generate migration → review SQL → migrate → sửa DTO/Zod/API/UI → typecheck. Đừng làm trước khi hoàn tất 14 test case.

---

## 16. Phạm vi và quyết định dành cho Milestone 2

Milestone 1 mới có bản ghi sách, **không có file**. Ở Milestone 2 chúng ta sẽ bổ sung:

1. Bucket Supabase Storage **private** cho EPUB/PDF upload của người dùng.
2. `book_files` (metadata, checksum, storage path) và quyền đọc bằng signed URL ngắn hạn.
3. Thư viện public và private, reader epub.js/PDF.js, bookmark/reading progress.
4. Cơ chế chống file độc hại và quota storage; **không** chuyển file user upload thành public chỉ vì sách đã được hiển thị trong UI.

Milestone 3 mới bắt đầu gọi Gemini API (free tier), embedding và pipeline tóm tắt. Giữ **AI key** phía server, không nằm trong JS được gửi đến browser.

---

## 17. Tài liệu chính thức và thời điểm kiểm tra

Các hướng dẫn và chính sách bên dưới được kiểm tra trong ngày **02/11/2026**, nhưng các package CLI và free-tier quota có thể thay đổi:

1. Nuxt starter và template v3: <https://github.com/nuxt/starter>
2. shadcn-vue cài trên Nuxt + Tailwind v4: <https://www.shadcn-vue.com/docs/installation/nuxt>
3. `@nuxtjs/supabase` cấu hình và SSR cookies: <https://supabase.nuxtjs.org/getting-started/introduction>
4. Supabase Nuxt authentication/confirm page: <https://supabase.nuxtjs.org/getting-started/authentication>
5. Supabase quản lý `auth.users`, trigger profile: <https://supabase.com/docs/guides/auth/managing-user-data>
6. Supabase RLS, GRANT, role `authenticated`: <https://supabase.com/docs/guides/database/postgres/row-level-security>
7. Supabase giới hạn email SMTP mặc định: <https://supabase.com/docs/guides/auth/auth-smtp>
8. Drizzle kết nối Supabase: <https://orm.drizzle.team/docs/connect-supabase>
9. Drizzle custom migrations: <https://orm.drizzle.team/docs/kit-custom-migrations>
10. Drizzle migrate và lịch sử migration: <https://orm.drizzle.team/docs/drizzle-kit-migrate>
11. Supabase Free pricing: <https://supabase.com/pricing>

**Lưu ý thực thi:** Đây là tài liệu học có đoạn code hoàn chỉnh và cấu trúc kết nối nhất quán, nhưng chưa được chạy end-to-end với Supabase project của bạn trong môi trường này (vì không có credentials, mạng và tài khoản thật). Nếu phiên bản mới của một CLI thay đổi câu lệnh hoặc định dạng migration, ưu tiên tài liệu của đúng version được ghi trong `pnpm-lock.yaml`. Không xem phần checklist là đã vượt qua cho tới khi chính bạn chạy và kiểm tra.

---

### Ghi chú bản quyền & quyền riêng tư

Trong Foundation, các bản ghi sách chỉ là **metadata thử nghiệm**. Khi thêm sách thật, chỉ đưa lên thư viện công khai các tác phẩm bạn có quyền phân phối. File người dùng upload mặc định private; nội dung upload không nên tự động gửi cho một nhà cung cấp AI nếu người dùng chưa được thông báo về chính sách dữ liệu.
