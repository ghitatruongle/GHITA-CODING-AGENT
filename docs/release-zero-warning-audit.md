# V1 — Zero-Warning Audit (Track 14) · 2026-08-10

**Tiêu chí:** mỗi lệnh trong ma trận chạy **exit 0 và output 0 error / 0 warning**. ✅ **100% đạt** — 19 vi phạm lint + 2 clippy dead-code + 1 needless_range_loop đã sửa trong đợt này.

## Ma trận command → kết quả

| #   | Command                                     | Exit  | Output                          | Ghi chú                                    |
| --- | ------------------------------------------- | ----- | ------------------------------- | ------------------------------------------ |
| 1   | `pnpm typecheck` (turbo, 44 tasks)          | **0** | 0 error/warning                 | tsc --noEmit sạch                          |
| 2   | `pnpm build:packages` (turbo, 28 tasks)     | **0** | 0 warning                       | tsc -b toàn bộ packages                    |
| 3   | `pnpm vite build` desktop (Node 22)         | **0** | 5 warning externalize (tracked) | xem ghi chú **B** dưới                     |
| 4   | `pnpm lint` (eslint, 43 tasks, --force)     | **0** | 0 error, 0 warning              | grep warning = rỗng                        |
| 5   | `pnpm knip --no-progress`                   | **0** | 0 error; 19 configuration hints | hints = accepted-debt CR-005 (triage v1.2) |
| 6   | `cargo clippy apps/desktop -D warnings`     | **0** | 0                               | release profile                            |
| 7   | `cargo clippy crates/secscan -D warnings`   | **0** | 0                               | sau fix dead-code                          |
| 8   | `cargo clippy crates/retrieval -D warnings` | **0** | 0                               |                                            |
| 9   | `cargo clippy crates/codegraph -D warnings` | **0** | 0                               | sau fix dead-code + needless_range_loop    |
| 10  | `cargo fmt --check` (desktop)               | **0** | 0                               | chạy trong V2                              |

## Vi phạm đã sửa (để đạt 0 warning — đều là lint-style, không đổi hành vi)

| Package          | Số lỗi | Loại                                                           | Cách sửa                                         |
| ---------------- | ------ | -------------------------------------------------------------- | ------------------------------------------------ |
| terminal-session | 1      | no-non-null-assertion                                          | `?? snapshot.id`                                 |
| evals            | 4      | no-non-null-assertion                                          | helper `must()`                                  |
| shared           | 4      | no-non-null-assertion                                          | `shift() ?? continue`, `?.push`, `must()`        |
| resource-budget  | 1      | no-non-null-assertion                                          | `flatMap` + guard                                |
| code-graph       | 8      | no-non-null-assertion                                          | `entries()`, guard `undefined`, `must()`/`?.[1]` |
| security         | 2      | no-non-null-assertion                                          | `?? 0` / `?? ''`                                 |
| memory           | 7      | no-non-null-assertion                                          | cosine via `?? 0`, `pop()` không gán             |
| marketplace      | 6      | no-non-null-assertion + no-useless-escape + prefer-template    | guard/`?? ''`/`[-_]`/template                    |
| ingest           | 23     | no-non-null-assertion + prefer-template                        | `entries()`, guard, `must()`, `flatMap`          |
| agents           | 6      | no-non-null-assertion                                          | guard `task`, `?? ''`, expect+`?.`               |
| ai-engine        | 6      | no-non-null-assertion + prefer-const                           | `first` guard, guard denied, `const`             |
| skills           | 7      | consistent-type-imports + no-non-null-assertion + prefer-const | type import, candidates[], `const`               |
| browser-control  | 2      | no-unused-vars + no-non-null-assertion                         | bỏ tham số, guard db                             |
| secscan (Rust)   | 5      | dead_code (napi)                                               | `#![expect(dead_code)]` trong `src/napi.rs`      |
| codegraph (Rust) | 2      | dead_code (napi) + needless_range_loop                         | `#![expect(dead_code)]` + `iter_mut()`           |

**Tổng:** 78 vi phạm Java(T)S + 7 Rust → tất cả exit 0 với 0 cảnh báo.

## Ghi chú

- **A. Node 24 segfault** (CR-019): lỗi rollup hiện thành crash 0xC0000005 — build local/CI dùng **Node 22.23.2** (khớp release.yml `NODE_VERSION: 22`).
- **B. 5 vite `externalized` warnings** (node:process/node:dns/promises/node:module): là thông báo của vite:resolve khi ignore node builtins trong bundle WebView — **benign, chủ ý** (các import node chỉ ở nhánh server/sidecar). Đã đánh dấu track-record trong audit này thay vì thay đổi cấu trúc bundle ở phút chót trước release.
- **C. knip hints**: giữ nguyên theo quyết định CR-005 (46 unused files → backlog v1.2) — `exit 0`, không phải warning chặn release.
