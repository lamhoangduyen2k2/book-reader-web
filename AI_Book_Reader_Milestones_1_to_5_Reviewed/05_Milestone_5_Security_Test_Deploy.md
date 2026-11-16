# Milestone 5 — Security Hardening, Testing, CI/CD & Deployment

> **Bản rà soát v2 · 16/11/2026.** Đọc `00_README_START_HERE.md` trước. Mốc tương thích xác nhận: `@nuxtjs/supabase@2.1.0`; các dependency còn lại cần đối chiếu lockfile thực tế. Không ghi đè migrations đã apply. Code minh họa chưa chạy E2E trên project thật.


**Điều kiện:** M1–M4 đã có tính năng chạy được ở local. **Đầu ra:** kiểm thử chéo danh tính A/B/admin, xử lý lỗi, giới hạn AI, CI/typecheck/build, deploy Nuxt + worker, sao lưu và theo dõi. **Không deploy public cho người dùng upload nếu security gates chưa qua.**

> Dự án có các thành phần **privileged** (DATABASE_URL, Supabase server key) và **untrusted** (user-uploaded EPUB/PDF, chat text). Ưu tiên bảo mật quyền truy cập, cô lập parser, giới hạn tài nguyên và chống quota abuse hơn giao diện polish.

## 1. Threat model (tự học bảo mật theo luồng dữ liệu)

| Tài sản | Mối đe dọa | Hàng rào chính | Test |
|---|---|---|---|
| Private EPUB/PDF | User B đoán bookId, signed URL | `books` + `book_files` RLS; server check trước ký URL; bucket private | A/B/guest, direct Storage API |
| Profile roles | User tự làm admin | Không GRANT UPDATE profiles; admin chỉ trusted migration/SQL | thử UPDATE role qua Data API |
| Book visibility | User tạo public trái phép | M1 RLS `books_admin_insert_public` | user create public phải fail |
| Notes/highlights | User B đọc ghi chú A | user_id RLS; no admin client before auth | A/B cross read |
| Chat history | User B đoán sessionId A | chat_sessions/messages RLS; server check session ownership | B POST/GET A session |
| AI key/DB secrets | Lộ qua browser source/log/git | server-only env; no `NUXT_PUBLIC_*` | inspect bundle, grep repo |
| Uploaded EPUB | ZIP bomb, HTML script, external network | parser sandbox + bytes/count/ratio/timeout; CSP | malicious fixtures |
| Uploaded PDF | CPU/memory exhaustion/embedded actions | resource limits; no OCR; sandbox | scanned/encrypted/large PDF |
| AI calls | user gửi request vô hạn | atomic per-user + global quota, limit concurrency | parallel tests |
| Retrieved passages | lộ sách người khác qua privileged SQL | check book with user scoped client first + `book_id` SQL filter | B RAG A book |
| Spoilers | AI nhắc chương chưa đọc | chapter SQL filter + progress context | query future event |
| Prompt injection | sách chỉ đạo AI bỏ rule | no privileged tools; system prompt trusted; contextualization | injected EPUB passage |
| XSS | chapter/chat text chứa HTML | Vue interpolation, no `v-html`; EPUB sandbox, CSP | script string remains text |
| Data loss | backup DB nhưng thiếu Storage | backup DB **và** files, restore drill | restore sample |
| Deletion | file còn trong bucket sau khi xóa metadata | Storage API cleanup + DB cleanup; expiry signed URLs | deleted object unreachable |

**Phân biệt:** RLS không tự bảo vệ kết nối PostgreSQL `postgres`; signed URL là token truy cập trong thời gian hữu hạn; extension `vector` không thay thế kiểm tra ownership; client validation và route middleware không thay thế backend validation.

## 2. Trước production: sửa các chỗ demo của M2–M4

### 2.1. Upload/file

- [ ] Bucket `book-files` **private** và giới hạn 5 MiB + type allowlist.
- [ ] `upload-init` phải check book ownership bằng user-scoped Supabase client.
- [ ] `complete` phải check: owner, path prefix, kích thước, magic bytes, duplicate; cần cleanup orphan nếu complete thất bại.
- [ ] Xử lý file trong **container/process cô lập**, không có quyền gọi mạng ra ngoài (trừ lúc tải file từ Storage do process tin cậy kiểm soát), giới hạn RAM/CPU/thời gian, ZIP entry count, **tổng bytes giải nén** và **tỷ lệ nén** trước khi parse.
- [ ] Không duyệt `..`, symlink, remote URL hoặc script trong EPUB; không bật nội dung scripted trong epub.js.
- [ ] Đối với public books: kiểm tra giấy phép/quyền phân phối; không công khai sách cá nhân.
- [ ] Signed URL TTL nhỏ (ví dụ 60s), không log; **đã phát link thì không thể coi logout là thu hồi ngay**. Dùng URL mới cho lần đọc tiếp theo.

**GATE nghiêm ngặt:** M2/M3 trusted allowlist không phải sandbox. Giữ upload_members cho tài khoản bạn kiểm soát (cả Storage RLS và API); tắt public signups khi demo riêng. M3 `extractEpub` dùng JSZip có thể giải nén trước khi check `text.length`. Đây **không phải** biện pháp bảo vệ ZIP bomb. Không nhận upload EPUB từ Internet công khai trước khi thay parser bằng streaming bounded parser hoặc sandbox isolation được kiểm thử. Nếu không có sandbox, chỉ bật upload cho các tài khoản tin cậy khi làm portfolio demo.

### 2.2. AI/RAG

- [ ] Check quota **trước `embedContent` và `generateContent`/`generateContentStream`**; summary API cũng phải dùng quota.
- [ ] Global quota ít hơn hạn mức Free thực tế; check AI Studio trước khi bật demo.
- [ ] Không tự động chuyển sang paid model, không bật billing nếu chỉ muốn free.
- [ ] `selectedText` phải so với nội dung chương trên server; nếu không khớp thì từ chối hoặc fallback thành câu hỏi bình thường, không coi là evidence.
- [ ] Mọi retrieval query `WHERE book_id=$bookId` + `chapter_index` + embedding model. Không dùng query rộng toàn DB rồi filter JavaScript.
- [ ] No-spoiler chỉ dùng chương được phép theo progress; không gửi chapter sau vào prompt.
- [ ] Citations do backend lấy từ DB, không lấy tùy ý từ AI output.
- [ ] Log request id, model, token usage/count, status, duration; không log nguyên văn file/selected text/chat hoặc API keys.
- [ ] Worker không tự retry 429 vô hạn: exponential backoff + jitter + retry cap; `Retry-After` khi có.

### 2.3. Worker transaction & consistency

Giải quyết các vấn đề trong M3 `worker:once` trước production:

1. **Job lease**: thêm `locked_until`, `worker_id`, `last_heartbeat`; nếu worker chết thì job hết lease được requeue có giới hạn.
2. **Versioned index**: có `index_version` hoặc `content_hash` trên chapters/chunks; ghi sang version mới, chỉ chuyển `books.active_index_version` khi đủ chunks. Không xóa toàn bộ index cũ rồi xây lại trong thời gian người dùng chat.
3. **Partial failure**: nếu embedding thành công một nửa rồi fail, retry không tạo duplicate/đảo chunk index. Bảo vệ bằng unique `(book_id, index_version, chapter_index, chunk_index)`.
4. **Delete cascading**: khi xóa sách, xóa metadata DB **và file bằng Storage API**; database FK cascade không xóa file Storage thực.
5. **Concurrency cap**: chỉ 1–2 job indexing mỗi lúc ở free tier; không spawn worker không giới hạn.
6. **Privacy revoke**: người dùng tắt AI / xóa file => ngừng jobs, xóa indexed data, summaries và lịch sử nếu yêu cầu; có chính sách giữ dữ liệu rõ ràng.

## 2.4. CSRF, cache và cookies SSR

M1 đã tạo `server/middleware/security.ts`; **không tạo thêm middleware same-origin.ts**. Test POST không Origin/sai Origin -> 403; đúng origin nhưng thiếu login -> 401; Auth outage -> 503. `APP_ORIGIN` đặt đúng HTTPS domain; proxy không cache SSR/API, không prerender route cá nhân. Login/logout phải reset client state. Signed URL là capability có TTL; logout không thu hồi tức thì. Không cho CORS arbitrary origin. Cookie Secure/SameSite theo cấu hình module (v2.1.0); kiểm tra trên domain HTTPS cuối cùng.

## 3. Bộ test bằng Vitest (unit) và Supabase RLS integration

### 3.1. Cài test tool

```powershell
pnpm add -D vitest @playwright/test dotenv-cli
pnpm exec playwright install chromium
```

Thêm scripts (giữ scripts M1):

```json
{
  "scripts": {
    "test:unit": "vitest run tests/unit",
    "test:e2e": "playwright test",
    "check": "pnpm exec nuxt prepare && pnpm typecheck && pnpm test:unit && pnpm build"
  }
}
```

### 3.2. Test hàm thuần (không cần Supabase)

Tạo `tests/unit/chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chunkText } from '../../workers/chunk'

describe('chunkText', () => {
  it('covers entire text and bounds chunk size', () => {
    const input = 'a'.repeat(5000)
    const result = chunkText(input, 1600, 200)
    expect(result.length).toBeGreaterThan(1)
    expect(result.every(x => x.length <= 1600)).toBe(true)
  })
  it('rejects invalid overlap', () => {
    expect(() => chunkText('abc', 10, 10)).toThrow()
  })
})
```

Tách `validateStoragePath(userId, bookId, path)` thành function riêng để unit test các trường hợp `../`, prefix của B, path có hơn 3 segment và extension lạ. Tách `normalizeSelectedText` và kiểm tra false positive/whitespace.

### 3.3. Integration tests quyền: dùng thật 2 user

**Không chạy integration tests trên production**. Tạo **Supabase test project riêng** và 2 user A/B (đăng ký/xác nhận email). Không lưu mật khẩu test trong repo; dùng `.env.test.local` trong `.gitignore`.

`tests/integration/rls-books.test.ts` (cần project test đã seed book A/B):

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const baseUrl = process.env.TEST_SUPABASE_URL!
const publishable = process.env.TEST_SUPABASE_PUBLISHABLE_KEY!
const privateBookOfA = process.env.TEST_BOOK_A_PRIVATE_ID!
let a: SupabaseClient
let b: SupabaseClient

beforeAll(async () => {
  a = createClient(baseUrl, publishable, { auth: { persistSession: false } })
  b = createClient(baseUrl, publishable, { auth: { persistSession: false } })
  const loginA = await a.auth.signInWithPassword({
    email: process.env.TEST_USER_A_EMAIL!, password: process.env.TEST_USER_A_PASSWORD!,
  })
  const loginB = await b.auth.signInWithPassword({
    email: process.env.TEST_USER_B_EMAIL!, password: process.env.TEST_USER_B_PASSWORD!,
  })
  if (loginA.error || loginB.error) throw new Error('Test logins unavailable')
})

describe('books RLS isolation', () => {
  it('allows A to read its private book', async () => {
    const { data, error } = await a.from('books').select('id')
      .eq('id', privateBookOfA)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })
  it('does not reveal A private book to B', async () => {
    const { data, error } = await b.from('books').select('id')
      .eq('id', privateBookOfA)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('does not reveal A book_files to B', async () => {
    const { data, error } = await b.from('book_files').select('storage_path')
      .eq('book_id', privateBookOfA)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('B cannot update its profile role to admin', async () => {
    const { data: user } = await b.auth.getUser()
    expect(user.user?.id).toBeTruthy()
    const { error } = await b.from('profiles').update({ role: 'admin' })
      .eq('id', user.user!.id)
    expect(error).not.toBeNull()
    const {data: profile} = await b.from('profiles').select('role').eq('id', user.user!.id).single()
    expect(profile?.role).toBe('user')
  })
  it('rejects forged status/consent even for an owned private book', async () => {
    const {data: user} = await a.auth.getUser()
    const {error} = await a.from('books').insert({
      title: 'forged-test', author: 'fixture', owner_id: user.user!.id,
      visibility: 'private', ai_status: 'ready', ai_consent_at: new Date().toISOString(),
    })
    expect(error).not.toBeNull()
  })
  it('denies writes to upload allowlist and internal chunks', async () => {
    const {data: user} = await b.auth.getUser()
    const result = await b.from('upload_members').insert({user_id: user.user!.id})
    expect(result.error).not.toBeNull()
    const chunks = await b.from('book_chunks').select('id').limit(1)
    expect(chunks.error).not.toBeNull()
  })
})
```

**Bắt buộc:** test project đã migrate đến hết M4, tài khoản B trong integration test là user thường không có admin hay upload_members. Khi kiểm thử HTTP ownership (404), tạo thêm tài khoản B-trusted hoặc cấp allowlist B tạm thời; kiểm thử nonmember (403) trước khi cấp, và thu hồi sau test. Xác nhận lỗi status/consent bằng cả SQL `has_column_privilege` và test Data API.

**Chạy** `pnpm test:unit` trước, sau đó `pnpm exec dotenv -e .env.test.local -- pnpm exec vitest run tests/integration/rls-books.test.ts` trên test project với biến môi trường `TEST_*` được nạp riêng (Vitest không tự load `.env.test.local` trong mọi cấu hình; dùng `dotenv-cli` hoặc `dotenv/config` và file env explicit). Nếu `profiles.role` UPDATE không có quyền nhưng PostgREST báo lỗi khác version, test chỉ cần xác nhận **không thể đổi role**, query lại để chắc chắn `role='user'`.

**Hướng dẫn cách đánh giá:** SQL Editor Supabase dùng role quản trị nên có thể bypass RLS; **không sử dụng SQL Editor để “chứng minh” user B không đọc được dữ liệu của A**. Dùng session/jwt thật như test trên.

### 3.4. HTTP tests — bảng kiểm tra bắt buộc

| Case | Request | Expected |
|---|---|---|
| 1 | Guest GET public books | 200, chỉ public |
| 2 | Guest GET private file URL | 404 |
| 3 | A GET private B file URL | 404 |
| 4 | A POST upload-init cho book B | 404 |
| 5 | A giả user_id B khi tạo highlight | RLS từ chối |
| 6 | A POST tạo sách visibility=public | 403 nếu không admin |
| 7 | A POST tạo chat session book B | 404 |
| 8 | B đọc session/chat của A | 404 hoặc empty (không leak) |
| 9 | 2 chat requests cạnh tranh ở quota=9 | Chỉ 1 được tính thành công |
| 10 | 11th chat request | 429 trước khi gọi embedding |
| 11 | Selected text giả | 422 |
| 12 | Spoiler future chapter khi noSpoilers=true | 422 / retrieval bị giới hạn |
| 13 | EPUB ZIP bomb fixture | parser bị từ chối/terminated, không OOM cả web |
| 14 | PDF không có text layer | job failed an toàn, website vẫn đọc PDF |
| 15 | Response chứa `<script>` | Vue render text, không execute |
| 16 | Logout rồi dùng signed URL vừa cấp | URL **có thể vẫn hoạt động** đến hết TTL — phải chấp nhận như thuộc tính signed URL |
| 17 | B gọi `GET /api/books/:id/file` cùng private ID A nhưng sửa headers | 404 |
| 18 | Direct `select book_chunks` qua client publishable | permission denied; không trả text |

## 4. E2E Playwright smoke test

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

`tests/e2e/public-library.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
test('public library loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Public Library' })).toBeVisible()
})
```

Nếu đã thay UI sau M2 thì chỉnh heading selector theo UI thật; **test luồng**, không phụ thuộc CSS quá chi tiết. Viết tiếp login, reader navigation, highlight, AI disabled state, chat streaming (mock provider để CI không tiêu token).

## 5. CI/CD — bắt đầu bằng pipeline KHÔNG cần secrets

Nếu bạn đang dùng GitLab, tạo `.gitlab-ci.yml` (không đụng docker.sock/deploy server khi chưa cần):

```yaml
stages: [verify]

verify:
  image: node:22-bookworm-slim
  stage: verify
  variables:
    NUXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co"
    NUXT_PUBLIC_SUPABASE_KEY: "sb_publishable_placeholder"
  script:
    - npm install -g pnpm@11.15.1
    # Ví dụ khớp môi trường pnpm@11.15.1; nếu repo ghi packageManager khác,
    # dùng đúng phiên bản đó và commit lockfile tương ứng.
    - pnpm install --frozen-lockfile
    - pnpm exec nuxt prepare
    - pnpm typecheck
    - pnpm test:unit
    - pnpm build
```

**Đọc kỹ:** Dòng pnpm@11.15.1 là ví dụ theo môi trường bạn đã sử dụng; **phải khớp** `package.json > packageManager` và lockfile của repo thật. Nếu project khác version, đổi CI theo version đã pin, không chạy install bằng hai pnpm major khác nhau. CI không nên dùng API key live hoặc DATABASE_URL cho unit/typecheck khi không cần; integration tests chạy ở job riêng với test project, secrets lưu ở GitLab CI variables **masked + protected**.

Nếu dùng GitHub Actions, pipeline tương tự nhưng cấu hình workflow trong `.github/workflows/verify.yml` và secrets GitHub. Không cần cài plugin/connector để dùng CI.

### Check secrets

```powershell
# Kiểm tra file .env có bị Git track không
 git ls-files .env .env.production .env.test.local
# Kỳ vọng: không in ra gì
 git status --short
```

Kiểm tra source và bundle sau build không chứa `GEMINI_API_KEY`, `DATABASE_URL`, `NUXT_BOOKS_ADMIN_KEY` giá trị thật. Dùng gitleaks/trufflehog trong CI nếu có thể; `pnpm audit --prod` để rà dependencies, nhưng audit sạch **không chứng minh** ứng dụng an toàn.

## 6. Docker deploy — hai process tách biệt

### 6.1. Server Nuxt

**`Dockerfile`** mẫu học tập:

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.15.1
COPY . .
RUN pnpm install --frozen-lockfile
RUN NUXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NUXT_PUBLIC_SUPABASE_KEY=sb_publishable_placeholder pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
RUN npm install -g pnpm@11.15.1
COPY . .
# Giáo trình: cài cả dev deps để dùng tsx. Production nên bundle worker riêng.
RUN pnpm install --frozen-lockfile
USER node
CMD ["node", "--import", "tsx", "workers/process-book.once.ts"]
```

**GATE:** pnpm@11.15.1 là ví dụ, phải sửa CI và cả hai Docker build stages cho khớp `packageManager`. Node image phải khớp packageManager; nếu Corepack không hỗ trợ pnpm đã pin, cài bản Corepack phù hợp hoặc `npm install -g pnpm@11.15.1` (đổi theo repo). Build không có secret, chỉ placeholder public URL/key nếu module yêu cầu; runtime inject giá trị thật. Docker mẫu chưa phải parser sandbox. `tsx` được cài devDependency và worker image cài đủ deps là ví dụ phục vụ học. Khi lên production, build bundle worker/standalone artifact và dùng non-root user, hạn chế network/CPU/memory; không lấy toàn source/secret vào image nếu không cần.

**`.dockerignore`**:

```text
node_modules
.nuxt
.output
.git
.env
.env.*
!.env.example
```

**Quan trọng:** `COPY . .` trong build stage **không được** đưa `.env` vào context; `.dockerignore` ở trên chặn. `.env.production` là secret runtime, không copy vào image. Không mở public port cho DB Supabase.

### 6.2. `compose.yaml` mẫu

```yaml
services:
  web:
    build:
      context: .
      target: runner
    restart: unless-stopped
    env_file: .env.production
    environment:
      HOST: 0.0.0.0
      PORT: '3000'
    ports:
      - '127.0.0.1:3000:3000'
    read_only: true
    tmpfs:
      - /tmp
    mem_limit: 512m

  worker:
    build:
      context: .
      target: worker
    profiles: [jobs]
    env_file: .env.worker
    restart: 'no'
    read_only: true
    tmpfs:
      - /tmp
    mem_limit: 512m
```

**Chạy:**

```bash
docker compose build
docker compose up -d web
docker compose --profile jobs run --rm worker
```

Tạo `.env.worker` riêng, chỉ chứa `DATABASE_URL`, `NUXT_BOOKS_API_URL`, `NUXT_BOOKS_ADMIN_KEY`, `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`, `AI_GLOBAL_DAILY_LIMIT`, `AI_GLOBAL_MINUTE_LIMIT`; không đưa cookie user, secret không liên quan. Hai file env phải trỏ cùng DB/project Gemini và cùng giới hạn. Giữ cả hai ngoài Git.

Worker trong ví dụ chạy **một job/lần**, không có scheduler tự động. Nếu muốn xử lý queue thường xuyên, chạy định kỳ bằng cron/systemd timer (tránh chạy trùng và kiểm soát concurrency) hoặc nâng lên worker service lâu dài có claim/lease. Không cấu hình auto-restart lặp vô hạn của một one-shot process.

**HTTPS:** đứng trước web bằng Caddy/nginx/TLS reverse proxy. Cấu hình Domain + redirect URLs trong Supabase Auth, cookie secure, CSRF strategy, CORS theo origin thực tế. Không chạy production qua plain HTTP. Test SSR cookies/auth trên domain cuối cùng.

**Đối với Supabase Free:** DB và Storage vẫn trên cloud Supabase; Docker Compose **không** tự cài database/Storage. Nếu dùng server riêng, bạn trả chi phí tài nguyên host/network dù Gemini API có free tier.

## 7. Giới hạn triển khai & runtime env

`.env.production` (lưu trên server, chmod 600, không commit):

```dotenv
NODE_ENV=production
APP_ORIGIN=https://reader.example.com
AI_GLOBAL_DAILY_LIMIT=100
AI_GLOBAL_MINUTE_LIMIT=5
NUXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=YOUR_PUBLISHABLE_KEY
NUXT_BOOKS_API_URL=https://PROJECT.supabase.co
NUXT_BOOKS_ADMIN_KEY=YOUR_SERVER_ONLY_KEY
NUXT_GEMINI_API_KEY=YOUR_FREE_AI_KEY
NUXT_GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=YOUR_FREE_AI_KEY
GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
DATABASE_URL=postgresql://...
```

Nuxt runtime config ghi `booksAdminKey`, `booksApiUrl`, `geminiApiKey`, `geminiTextModel` ở private section; public chỉ có publishable key/url. Nếu deploy trên serverless, không chạy blocking long worker trong function timeout. Không log dotenv hay password; rotate nếu bị commit.

## 8. Production database migrations

Không chạy `pnpm db:migrate` tự động từ mỗi Nuxt replica khi khởi động. Quy trình:

1. Backup database + lưu dữ liệu Storage quan trọng; xem giới hạn backup của Supabase Free.
2. Chọn thời điểm triển khai, đọc migration SQL (đặc biệt GRANT/RLS/triggers).
3. Dùng CI job kiểm soát quyền hoặc máy quản trị chạy migration **một lần**.
4. Test schema/RLS/policies trên **test project** trước.
5. Deploy app và worker đúng commit/version migration.
6. Test login, private book isolation, signed URL, AI quota 429, streaming.

Không thay đổi migration cũ đã áp dụng; tạo migration mới. Với `supabase_auth_admin`/Auth triggers: nếu thay function owner/permissions, đăng ký user có thể thất bại; test signup trên test project trước.

## 9. Monitoring, privacy và backup

Theo dõi hằng ngày khi demo:
- Tỷ lệ HTTP `401/403/404/429/500/503`, API latency, lỗi signed URL.
- Database size / Storage GB / egress / row count chunks.
- Worker `pending/processing/failed`, attempts, processing time, memory.
- Gemini RPM/TPM/RPD và lỗi `RESOURCE_EXHAUSTED`; số embeddings tạo/bộ sách.
- Không log toàn văn private books/chat hay authorization header.

Backup cần **hai luồng**: `pg_dump` PostgreSQL (metadata/chunks/roles/policies cần test restore) **và** tệp thực từ Supabase Storage. DB dump không chứa bytes của EPUB/PDF. Kiểm tra quy trình restore định kỳ trong một project test (không ghi đè prod). Đặt retention và cơ chế xóa tài khoản/sách đúng chính sách. Mở link Storage đã ký có thể tiếp tục dùng đến expiry, nên không coi DB deletion là thu hồi link tức thời.

## 10. Security gate cuối và checklist ra mắt

### Critical (thiếu một mục = KHÔNG mở public)

- [ ] Không có secret trong `NUXT_PUBLIC_*`, Git, image layers, frontend bundle.
- [ ] M1 `profiles/books` grants + RLS kiểm thử A/B/admin; role admin không thể tự cấp.
- [ ] M2 upload bytes/path/size check; ZIP/PDF parser cô lập tài nguyên và chống resource exhaustion đã kiểm tra.
- [ ] Storage bucket private, chính sách chỉ owner upload; signed URL chỉ ký sau auth/visibility check.
- [ ] M3 private book cần AI consent, policy dữ liệu free AI hiển thị rõ; có thể tắt/xóa AI.
- [ ] M3–M4 quota server-side atomic **trước bất kỳ API call Google nào**; global cap và không tự bật paid.
- [ ] M4 retriever `WHERE book_id`/chapter/embedding_model ở DB; không thể lấy chunk của user B.
- [ ] Backend không cho user tự chọn role/owner trên bảng đặc quyền hoặc trực tiếp gọi admin client.
- [ ] E2E/Integration RLS test hai danh tính, và test concurrency.

### Operational

- [ ] Build/typecheck/test trên CI đúng lockfile.
- [ ] HTTPS + Supabase Auth redirect URLs cập nhật đúng domain.
- [ ] DB migrations được áp dụng có review, không chạy lại ngầm.
- [ ] Worker job lease/idempotency/rollback đã giải quyết.
- [ ] Logging tối thiểu, backup DB + Storage và restore drill.
- [ ] User hiểu giới hạn PDF scan/OCR, quota Free và chế độ không spoiler chỉ là tính năng hỗ trợ.

## 11. Definition of Done

Bạn chỉ hoàn thành **public-production M5** khi: build production chạy, người dùng đọc và chat đúng quyền, A/B cross-account không có data leak, bot không vượt quota thử nghiệm, upload file không thể khiến worker web crash, dữ liệu được backup/restore, và toàn bộ security checklist đã có **bằng chứng test** chứ không chỉ tick theo cảm giác. Nếu chưa có bounded parser/sandbox, quota storage/signup và revoke consent workflow, chỉ chạy portfolio được giới hạn tài khoản qua allowlist; không đánh dấu public-ready.

## Tài liệu chính thức

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/security/signing-keys
- https://supabase.com/docs/guides/storage/schema/design
- https://supabase.com/docs/guides/database/backups
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://nuxt.com/docs/3.x/getting-started/deployment
- https://playwright.dev/docs/intro
- https://vitest.dev/guide/
