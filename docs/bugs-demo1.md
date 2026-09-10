# GHITA v1.2.0-demo1 — Bug Log (P1.2/P1.3)

> Mỗi bug: tái hiện → nguyên nhân → fix + regression test → FIXED. Nguồn: gates + profiling + code audit trong demo1.

## BUG-001: Native split_fixed panic trên text không phải ASCII → abort cả ingest worker (splitter native vô hiệu + crash với tiếng Việt/CJK/emoji)

- Matrix row: D1 (Memory/RAG ingest), A24
- BẰNG CHỨNG THẬT (2026-08-31): `packages/ingest/src/edge-cases.test.ts` chạy trên máy có addon build sẵn →
  `thread '<unnamed>' panicked at retrieval\src\splitters.rs:166:31: end byte index 40 is not a char boundary; it is inside '词'` → `non-unwinding panic. aborting` → chết cả test worker (ERR_IPC_CHANNEL_CLOSED), turbo test EXIT=1.
- Tái hiện: `splitFixed(CJK.repeat(50), { chunkSize: 40, overlap: 4 })` khi addon `retrieval` đã build.
- Nguyên nhân: `crates/retrieval/src/splitters.rs` `split_fixed` cắt `&text[start..end]` theo BYTE offset; `end` rơi giữa UTF-8 sequence → panic. napi-rs biến panic thành abort (hàm extern "C" không unwind được). CI Linux xanh vì addon không build trong test job → JS fallback.
- Hệ quả phụ: JS clamp `overlap ≤ chunkSize/2` (splitters.ts:51) nhưng native path KHÔNG clamp (JS truyền raw overlap) → semantics khác nhau; và native không `break` khi end≥length → thừa chunk cuối so với JS.
- Fix: viết lại `split_fixed` đếm theo UTF-16 code unit (= JS `.length`), clamp overlap, char-boundary an toàn (không tách surrogate pair), break đúng JS. `fixed_split` delegate sang nó.
- Regression test: 5 test Rust mới trong `crates/retrieval/src/splitters.rs` (CJK, clamp, count parity, single char) + `edge-cases.test.ts` (đã có, giờ phải xanh với addon build).
- Trạng thái: FIXED — verified: Rust 24/24 + ingest JS 32/32 + parity 20/20 với addon rebuild

## BUG-004: Native split_markdown chỉ nhận `## ` (H2), JS nhận H1–H3 và re-wrap `## ` → kết quả chunk khác nhau giữa máy dev (native) và CI (fallback)

- Matrix row: D1
- BẰNG CHỨNG THẬT: `packages/ingest/src/ingest.test.ts > splitters > splitMarkdown keeps heading context` FAIL trên máy này ("expected false to be true") — input `# Title\n\n...` native trả chunk không có `## Title` vì native chỉ coi `## ` là heading.
- Nguyên nhân: `crates/retrieval/src/splitters.rs` split_markdown cũ dùng `line.starts_with("## ")`; JS dùng regex `^(#{1,3})\s+(.+)$` + wrap `## ${heading}`.
- Fix: viết lại split_markdown Rust mirror JS (H1–H3, trim, heading rỗng bỏ qua, oversized → fixed windows CÓ overlap; thêm tham số overlap vào `split_markdown_native` + JS caller truyền `options.overlap ?? 100`).
- Regression test: 6 test Rust mới (h1 wrap, emoji+CJK heading, H4 không phải heading, heading-only part, single char, oversized overlap) + ingest.test.ts + edge-cases.test.ts.
- Trạng thái: FIXED — verified: Rust pass + ingest JS 32/32 + parity 20/20

## BUG-002/003: splitCode/splitRecursive chưa có đường native — RESOLVED BY DECISION (Track 3, có đo lường)

- Điều tra P3.1 (docs/rust-demo1-design.md): JS splitCode 0.4ms/8k dòng, splitRecursive 0.3ms/2k đoạn — DƯỚI 1MS, port native không mang lại giá trị; hơn nữa bench chứng minh native string-slicing CHẬM HƠN JS cho họ splitter (V8 slice là view, Rust phải copy+transcode qua FFI: 3.2ms vs 0.3ms trên 228k ký tự).
- Hành động: KHÔNG port; thay vào đó đảm bảo parity semantics (đã có wiring splitFixed/Markdown native đúng JS sau BUG-001/004). Ghi quyết định + số đo vào design doc để mốc sau không điều tra lại.
- Trạng thái: CLOSED-BY-DECISION

## BUG-005: Tính năng auto-update KHÔNG tới được người dùng — command `check_update` đăng ký trong Rust nhưng không có UI nào gọi

- Matrix row: D12
- BẰNG CHỨNG: `grep check_update` toàn `apps/desktop/src` → 0 caller frontend; command chỉ tồn tại ở `src-tauri/src/lib.rs:739,1745`. Plugin `tauri-plugin-updater` có trong Cargo.toml nhưng vô dụng vì không có đường bấm.
- Fix: thêm row "Updates" trong SettingsView (section ℹ Info) — nút `check-update-btn` invoke `check_update`, hiển thị kết quả vào `update-status`; i18n 4 key × 6 locale (check-i18n PASS).
- Regression test: `views-render.test.tsx > SettingsView check-update button invokes check_update and shows the result` (assert invoke('check_update') + status render).
- Trạng thái: FIXED

## INCIDENT-ENV (không phải bug sản phẩm): `pnpm install --offline` làm mất optional native deps

- 2026-08-31: khi thêm dep `@ghita/native-bridge` cho packages/memory, `pnpm add` fail do network chập chờn; `pnpm install --offline` tỉa lockfile (−2941 dòng) và xóa gói optional native `@rollup/rollup-win32-x64-msvc` → vitest chết.
- Khắc phục: khôi phục lockfile từ git, khai báo dep thủ công, `pnpm install` khi network ổn (lockfile đã có native-bridge), rồi full reinstall `rm -rf node_modules && pnpm install`.
- Bài học: KHÔNG dùng `pnpm install --offline` khi lockfile có optional platform deps; network lỗi thì retry `pnpm add` thường.

## BUG-006: JS `splitFixed` fallback cắt đôi surrogate pair → chunk chứa lone surrogate (emoji hỏng); chunkSize≤0 lặp vô hạn; overlap âm nhảy qua ký tự

- Matrix row: D1
- BẰNG CHỨNG (fuzz review 2026-08-31): `splitters.fuzz.test.ts > surrogate safety > splitFixed JS never emits lone surrogates` FAIL — `slice(start,end)` theo UTF-16 index cắt giữa cặp 🚀 khi chunkSize lẻ; native pass, JS fail.
- Fix: JS thêm đường code-point-safe khi text chứa surrogate (mirror đúng thuật Rust: greedy theo UTF-16 width, rewind giữ nguyên cặp), giữ fast path slice cho text thuần BMP (không mất perf); guard `chunkSize<=0 → []`; clamp `overlap ∈ [0, chunkSize/2]` ở CẢ hai đường (splitMarkdown native call cũng truyền overlap đã clamp).
- Regression test: `splitters.fuzz.test.ts` (93 test: 50 vòng BMP fuzz + 25 shape×option parity + surrogate safety 2 chiều).
- Trạng thái: FIXED — 145/145 ingest splitter tests xanh

## BUG-007: Rust `split_markdown` xử lý heading whitespace-only ('##   ') khác JS → divergence native↔JS

- Matrix row: D1
- BẰNG CHỨNG (fuzz review): `splitters.fuzz.test.ts > splitMarkdown opts#0..4 shape#8` FAIL cả 5 option set — JS regex match với capture trim về '' (mở section mới, heading falsy); Rust cũ trả None → gộp '##   ' vào body.
- Fix: `markdown_heading` trả `Some("")` khi regex match capture rỗng; điều kiện flush/wrap dùng truthiness kiểu JS (`head_truthy`) thay vì `is_some()`.
- Regression test: Rust unit `markdown_whitespace_only_heading_matches_js` + fuzz shape#8 xanh cả 5 option set.
- Trạng thái: FIXED — Rust 31/31 + fuzz 145/145

## REVIEW-001 (không phải bug code): 6 advisory critical/high MỚI CÔNG BỐ sau 1.1.5 làm fail gate audit:policy

- BẰNG CHỨNG (review pass 2026-08-31): `pnpm audit --prod` trả browserslist ×2 (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g — đường apps__mobile>@notifee>react-native>babel-preset) và fast-uri ×4 (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp — đường docs>@docusaurus>webpack). Không advisory nào thuộc code demo1 hay runtime app — tất cả build-time tooling.
- Hành động: thêm 6 entry allowlist (expires 2026-12-31, allowedPaths ['apps__mobile>'] / ['docs>']) theo đúng khuôn js-yaml/image-size có trước. **OWNER NÊN XÉT LẠI** — có thể xóa entry nếu muốn upgrade tooling thay vì accept.
- CẢNH BÁO KÈM: entry GHSA-mh99-v99m-4gvg (glob traversal screenshot-desktop/RN 0.76) **hết hạn 2026-09-01 (ngày mai)** — gate sẽ fail từ 01/09 nếu không migrate parents hoặc gia hạn có lý do.
- Trạng thái (2026-09-10): OWNER DUYỆT bằng tin nhắn ("làm cho xanh hết... sửa soát hết luôn") → giữ 6 entry mới; GHSA-mh99-v99m-4gvg được GIA HẠN tới 2026-12-31 (lý do: migrate screenshot-desktop / nâng RN về dependabot PR mở tại beta5); phát hiện thêm 2 advisory mới trong lúc xanh hóa — GHSA-2883-xcg3-v3hh (js-yaml, đường apps__mobile+docs build tooling) và GHSA-w27v-7q3p-w38r (svgo, docs webpack/cssnano) — cũng build-time-only, đã thêm allowlist cùng khuôn. audit-policy=0, dogfood 18/18. LƯU Ý: DB advisory sống — gate có thể đỏ lại bất kỳ lúc nào khi có advisory mới công bố; xử lý lặp lại theo khuôn hoặc nâng tooling ở beta5.
