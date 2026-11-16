# MARGIN. / AI Book Reader — Bộ giáo trình Milestone 1–5 (v2)

**Rà soát ngày 16/11/2026** · Tiếng Việt · Nuxt 3, TypeScript, Supabase Cloud Free, Drizzle, Gemini Free Tier. Dành cho người đang học fullstack, database và AI. Đây là bản chỉnh sửa trực tiếp của năm tài liệu cũ, không yêu cầu xây dựng project khác hoặc reset database.

## Đọc theo thứ tự

| File | Khi nào đọc | Kết quả |
|---|---|---|
| [06 — Security review & upgrade](06_SECURITY_REVIEW_AND_UPGRADE.md) | **Đọc đầu tiên nếu đã làm M1** | Chuyển từ v1 an toàn, kiểm tra `PUBLIC`, GRANT/RLS, helper Auth, các điều kiện trước khi tiếp tục |
| [01 — Foundation](01_Milestone_1_Foundation.md) | Bắt đầu hoặc đối chiếu phần đã làm | Nuxt, Auth, Drizzle, profiles/books, kiểm tra quyền |
| [02 — Library & Interactive Reader](02_Milestone_2_Library_Interactive_Reader.md) | Sau M1 | File EPUB/PDF, private bucket, reader ba cột, progress/notes/highlights |
| [03 — AI Ingestion & Summarization](03_Milestone_3_Ingestion_Summaries.md) | Sau M2 | Consent, worker, extraction, embedding pgvector, quota từ lần gọi đầu, summary chương |
| [04 — AI Companion](04_Milestone_4_Context_Aware_AI_Companion.md) | Sau M3 | Context-aware RAG, selected passage, streaming, citations, chat history |
| [05 — Security, Testing & Deployment](05_Milestone_5_Security_Test_Deploy.md) | Sau M4 | Test, CI/CD, Docker, security gates và giới hạn triển khai |

Tùy chọn: file `AI_Book_Reader_Full_Guide.md` ngoài ZIP tổng hợp tất cả các phần. Khi học nên mở từng file riêng trong VS Code (`Ctrl+Shift+V` để preview). File 06 là checklist/migration nâng cấp, không phải milestone thứ sáu.

## Chốt quy ước chung (không trộn các bản cũ/mới)

- Giữ Nuxt **3**, cấu trúc root `pages/`, `components/`, `server/`, `workers/`, `shared/`. UI theo thiết kế Margin: sidebar mục lục/notes, vùng đọc, AI companion; màu giấy trung tính và xanh sage là tùy chọn UI. Không ép đổi design system khi code đã chạy.
- `@nuxtjs/supabase@2.1.0` **pin exact**. Từ bản này `serverSupabaseUser()` là JWT claims (`sub`). Toàn bộ API trong v2 dùng **`requireUser(event)`** (M1), trả `User` đã được `auth.getUser()` xác minh nên sử dụng **`user.id`**. `useSupabaseUser().value?.sub` dùng phía UI. Không trộn `id`/`sub` hoặc tin `userId` client.
- Giữ version của Nuxt 3 và các dependency đang hoạt động, `pnpm-lock.yaml`, `packageManager`. Chưa được cung cấp project/lockfile thật nên không thể xác nhận toàn bộ peer deps. TypeScript 5.9.3 là baseline tương thích để kiểm tra lỗi SFC; không downgrade Vue/TS mù quáng. Chạy `pnpm list --depth 0` và `pnpm typecheck` sau mỗi checkpoint.
- Drizzle schema chỉ khai báo **một lần**; phần security migration chạy sau schema tương ứng. Không `drizzle-kit push` và không sửa migration đã apply. Bảng `auth.users`, `storage.objects` do Supabase quản lý. Với SQL tùy chỉnh, giữ marker `--> statement-breakpoint`.
- `DATABASE_URL` dùng cho migrate/worker hoặc truy vấn nội bộ sau authorization; không tự kế thừa user JWT. Browser và API nghiệp vụ sử dụng session-scoped client; service key chỉ dùng tác vụ cần thiết sau quyền đọc/sở hữu.
- `books` cấp INSERT theo cột từ M1: `title, author, owner_id, visibility`. Không để user tự gán `id`, `created_at`, `ai_status`, `ai_consent_at`. Bảng AI nội bộ không cấp quyền cho API roles.
- Bucket `book-files` private. M2 tạo `upload_members` allowlist do developer quản lý, được kiểm tra ở **Storage RLS và Nitro API**; M3/M4 dùng chung allowlist cho AI. Bản MVP cá nhân không nhận upload untrusted từ mọi tài khoản.
- M3 tạo quota tables + `workers/quota.ts`; M4 chỉ dùng lại, không generate trùng. Chat tối đa 10/user/day, summary 2/user/day, global theo env và quota thực tế; reserve 1 SDK call cho summary/selection/embedding và 2 cho retrieval chat. Không bảo đảm token quota hoặc number of retries của SDK; provider vẫn có thể 429. Không tự bật billing.
- LLM baseline: `gemini-3.5-flash-lite` (Standard Free Tier), embedding `gemini-embedding-001` 768 chiều. Google công bố deprecated 2.5 Flash và kế hoạch định tuyến từ 01/12/2026; đã bỏ tên model 2.5 khỏi code/env.
- Consent là bắt buộc trước khi gửi nội dung file sang Gemini; free tier có khả năng dùng dữ liệu để cải thiện dịch vụ. Không đưa sách không có quyền xử lý, dữ liệu nhạy cảm hoặc bí mật lên API.

## Trạng thái tương thích và giới hạn

Rà soát tĩnh theo tài liệu gốc và code snippets; đối chiếu source chính thức v2.1.0 và tài liệu quyền cột/RLS, rate limits. Kiểm tra cú pháp TypeScript/Vue script blocks bằng TypeScript parser (xem file `07_VALIDATION_REPORT.md`). Đây không phải kết quả `nuxt typecheck` đầy đủ, build hay chạy Supabase SQL. Thiếu source hiện tại, `pnpm-lock.yaml`, credentials test, file mẫu, DB và AI quota của bạn. Không thể cam kết không có bug hoặc lỗ hổng chưa biết. Ưu tiên làm từng checkpoint; không thực hiện toàn bộ migration một lần trên production.

Các đoạn code reader/AI là baseline giáo trình; một số tích hợp nâng cao được nêu dưới dạng bài tập (TOC đầy đủ, highlight PDF, exact CFI citation, summary phân cấp sách, conversational history, queue lease, sandbox/scan, revoke AI self-service). Không quảng cáo tính năng chưa triển khai. M5 phân biệt **portfolio local/trusted** với **public production**; chưa được phép mở upload/AI công khai nếu các gate chưa được chứng minh.

## Nguồn xác minh trọng tâm

- Module tag v2.1.0: https://github.com/nuxt-modules/supabase/tree/v2.1.0
- serverSupabaseUser: https://github.com/nuxt-modules/supabase/blob/v2.1.0/src/runtime/server/services/serverSupabaseUser.ts
- useSupabaseUser: https://github.com/nuxt-modules/supabase/blob/v2.1.0/src/runtime/composables/useSupabaseUser.ts
- Quyền cột PostgreSQL/Supabase: https://supabase.com/docs/guides/database/postgres/column-level-security
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Storage: https://supabase.com/docs/guides/storage/security/access-control
- Gemini: https://ai.google.dev/gemini-api/docs/pricing ; https://ai.google.dev/gemini-api/docs/rate-limits ; https://ai.google.dev/gemini-api/docs/embeddings

**Bước tiếp theo dành cho bạn:** mở `06_SECURITY_REVIEW_AND_UPGRADE.md`, thực hiện nhánh “M1 đã/chưa migrate”, xác nhận hai tài khoản A/B và HTTP 401/403. Không chạy lại việc tạo Nuxt từ đầu.
