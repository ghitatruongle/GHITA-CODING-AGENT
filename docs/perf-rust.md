# Rust hóa & Interim JS — Bảng hiệu năng before/after (v1.1.0 Track 8 A12)

> Số liệu đo trên máy dev (Windows, Node 24). Benchmark chuẩn: `node scripts/bench-cpu.mjs --json` (JS) · `node scripts/bench-native.mjs` (native addon).

## 1. Kết quả đo (máy dev) — JS + NATIVE

| Probe                       | Trước (JS naive) | JS interim (A3–A5) | **NATIVE addon (A7/A9/A11)**                        | Mục tiêu   |
| --------------------------- | ---------------- | ------------------ | --------------------------------------------------- | ---------- |
| **Scanner 5MB**             | 52–69 ms         | 10.8–13.7 ms       | **8.1–8.8 ms** (1.5× vs JS fast, **7.8× vs naive**) | <25 ms ✅  |
| **BM25 10k chunks (query)** | **4 230 ms** ⚠️  | 0.3–1.6 ms         | **0.13 ms** (build index 64–78 ms)                  | <300 ms ✅ |
| **PageRank 20k×30**         | 32 ms            | 2.9–6.7 ms         | **1.4 ms** (2.4× vs JS typed)                       | <10 ms ✅  |

> Số liệu native lưu tại `docs/perf-native.json` (chạy: `node scripts/bench-native.mjs`).

## 2. Crate Rust — core + napi addon (cargo test 12/12; addon build thành công)

| Crate              | Core (std-only)                                                               | Napi addon (feature `addon`)                                                                                                                     | Tests                   |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `crates/secscan`   | Streaming multi-pattern scan (memchr-style, skip minified, negative patterns) | `scanFast(content, rules) → {lines, ruleIndices, evidence}` — **1 combined regex named-groups** + memchr line tracking; findings qua Uint32Array | 4 ✅ + build `.node` ✅ |
| `crates/retrieval` | Inverted-index BM25 (DF precompute, lengths chính xác)                        | `Bm25Index` napi class: `new(chunks, k1?, b?)` + `query(q, topK?) → {ids: Uint32Array, scores: Float32Array}`                                    | 4 ✅ + build `.node` ✅ |
| `crates/codegraph` | PageRank CSR (`Vec<u32>`/`Vec<f32>`, dangling mass)                           | `pagerank(n, from, to, weight, damping?, iterations?) → Float32Array`                                                                            | 4 ✅ + build `.node` ✅ |

> Build addon trên Windows-gnu dùng `dyn-symbols` (napi-sys resolve symbol động qua GetProcAddress — không cần libnode.dll) + `@napi-rs/cli` (`pnpm --filter @ghita/memory exec napi build --cwd crates/<name> --platform --release --features addon`).

## 3. Bridge native-first/JS-fallback (`@ghita/native-bridge`)

- `loadNative('secscan', jsFallback)` → nạp `crates/<name>/target/release/index.node` nếu có,
  ngược lại trả JS fallback + `fallbackReason`.
- `registerNative(name, module)` cho addon nạp sẵn; `isAddonBuilt(name)`.
- 3/3 test pass; pattern dùng cho cả 3 module khi napi bindings được thêm.

## 4. Tích hợp native vào code thật (A7/A9/A11)

| Module                                    | Thay đổi                                                                                                                                           | Test                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/security/src/scanner/engine.ts` | `scanContent` → lazy-line; **`scanContentFast`**: native `scanFast` qua `@ghita/native-bridge` (JS fallback qua `SecurityScanner.forceJsScanFast`) | **135 pass** (fast ×2 + native-path test) |
| `packages/ingest/src/retrieval.ts`        | `HybridRetriever` native BM25 leg (`useNative` option, `usingNative()`); JS fallback `bm25Score`                                                   | **23 pass** (thêm native test)            |
| `packages/code-graph/src/repo-map.ts`     | `computePageRank` native `pagerank` qua bridge (`PageRankOptions.forceJs`); JS fallback CSR typed                                                  | **45 pass** (thêm native test)            |

## 5. CI gate

- `scripts/bench-cpu.mjs` — 5 phép đo JS, so sánh với `docs/perf-baseline.json` (ngưỡng +10%, min-of-3, bỏ naive reference).
- `scripts/bench-native.mjs` — đo 3 addon native, so sánh JS baseline (số liệu lưu `docs/perf-native.json`).
- Workflow: `.github/workflows/bench-cpu.yml` — nightly + PR: chạy bench-cpu + cargo test + build addons + bench-native.

## 6. Kết luận — Track 8 HOÀN THÀNH

- **A1–A5** (bench + interim JS): đạt mọi ngưỡng (scanner 13.7ms, BM25 0.3ms, PageRank 2.9ms).
- **A6–A11** (crate + napi + tích hợp): 3 addon **build thành công** (`.win32-x64-gnu.node`), lõi cargo test 12/12, tích hợp qua `@ghita/native-bridge` với JS fallback + test native path ở cả 3 module.
- **Số liệu native cuối:** scanner **8.1 ms** (7.8× vs naive) · BM25 query **0.13 ms** (≈32 500× vs naive 4 230 ms) · PageRank **1.4 ms** (2.4× vs JS typed).
- **Còn lại cho production:** tree-sitter grammars trong `codegraph` (parse AST native), build matrix CI (win/linux/mac) — đã ghi rõ trong mục roadmap của từng crate.
