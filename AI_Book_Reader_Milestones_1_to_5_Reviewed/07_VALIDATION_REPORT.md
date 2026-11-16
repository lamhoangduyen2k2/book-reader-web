# Validation report — v2, 16/11/2026

## Tài liệu đầu vào

Đã đọc và đối chiếu chính các file hướng dẫn gốc: `AI_Book_Reader_Milestone_1_Foundation_Guide.md`, bốn file `01_Milestone_2_Library_Interactive_Reader.md`, `02_Milestone_3_Ingestion_Summaries.md`, `03_Milestone_4_Context_Aware_AI_Companion.md`, `04_Milestone_5_Security_Test_Deploy.md` trong bộ hướng dẫn cũ, cùng README và tài liệu Security Review cũ. Phiên bản `@nuxtjs/supabase@2.1.0` được xác định từ ảnh kết quả pnpm list của người học. Không có source repo, package.json/pnpm-lock.yaml thực tế, DB dump hoặc credentials.

## Những kiểm tra thực hiện trên tài liệu v2

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| Đối chiếu source Nuxt Supabase tag v2.1.0 | Xác nhận | serverSupabaseUser dùng getClaims; config types/URL/key; không dùng API theo tag main |
| TypeScript parser (TS/JS và script Vue) | 64 khối, không có parse diagnostics | Chỉ cú pháp, không resolve imports hoặc kiểm tra type theo package |
| JSON và YAML parser | 4 khối JSON, 2 khối YAML, không lỗi parse | Không kiểm tra schema/config runtime |
| Markdown fences | Cân bằng trong các tài liệu được quét | Không phải test Markdown renderer |
| Tìm lệnh gọi trực tiếp `serverSupabaseUser` trong các khối TS/Vue | 0 | M1–M5 dùng `requireUser`; không thay nhầm User.id thành JWT.sub |
| Đối chiếu luồng dependency qua milestone | Đã rà soát | M1 auth/Origin, M2 upload_members, M3 AI quota, M4 reuse, M5 deploy/test |
| Đối chiếu quyền INSERT và AI consent | Đã rà soát tĩnh | DB grants theo cột, RLS, migration upgrade và test case trực tiếp |
| Kiểm tra Gemini pricing | Đối chiếu 16/11/2026 | 3.5 Flash-Lite Standard free input/output và embedding-001; quota thực tế cần xem dashboard |

## Chưa kiểm chứng bằng môi trường thực tế

| Kiểm tra | Trạng thái |
|---|---|
| pnpm install --frozen-lockfile, dependency versions, peer deps | Chưa chạy trên repo thật |
| nuxt prepare, nuxt typecheck, nuxt build | Chưa chạy với toàn source và package versions thật |
| PostgreSQL/Drizzle migration trên Supabase project test | Chưa chạy; SQL review tĩnh, không có PostgreSQL integration instance |
| Auth signup/confirm/cookie/JWT, RLS/GRANT với 2+ user | Chưa chạy; cần session thật |
| EPUB/PDF render, text selection/locator, actual parser limits | Chưa chạy file fixtures; không nhận upload untrusted |
| SDK Gemini, quota/concurrency, retrieval và streaming | Chưa gọi API live; không xác nhận quota của project |
| Production deploy, sandbox, pentest, backup/restore | Chưa nghiệm thu |

**Không coi cú pháp hợp lệ là bằng chứng chương trình đúng hoặc đã an toàn.** Không được đánh dấu test của người dùng là pass thay họ. Cần chạy bài test milestone và kiểm tra mã nguồn/lockfile thật để hoàn tất kiểm chứng tương thích. Các phần nâng cao chưa có code hoàn chỉnh đã được ghi rõ là bài tập/gate, không phải tính năng production-ready.

## Kết quả cần ghi từ môi trường của bạn

```text
Node version:
pnpm version:
Nuxt version:
Vue version:
TypeScript version:
Supabase module: 2.1.0
Supabase JS version:
Postgres / Drizzle versions:
Gemini SDK version:
EPUB/PDF parser versions:
Commit hash + lockfile hash:
Latest migration applied:
M1 typecheck/build:
RLS A/B/admin test:
M2 Storage and reader fixture test:
M3 worker/summary/quota test:
M4 RAG/streaming/citations tests:
M5 deployment/security gates:
```

Giữ report này cập nhật sau từng checkpoint. Nếu còn bất kỳ gate bảo mật chưa đạt, chỉ dùng môi trường local/trusted, không mở upload/AI toàn Internet.
