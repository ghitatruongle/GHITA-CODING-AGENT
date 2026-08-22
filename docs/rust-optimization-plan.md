# Kế hoạch Rust hóa hiệu năng & Tối ưu RAM/Tài nguyên — v1.1.0

**Ngày:** 2026-08-10 · **Cấu trúc:** Phần A (ý tưởng & số liệu) + Phần B (2 Track triển khai, mỗi Track ≥10 Phase).

> 📌 **Định vị:** Kế hoạch này thuộc **v1.1.0** — bổ sung 2 Track 8–9 vào bản cập nhật 1.1.0 (sau 7 Track chức năng): **Track 8 = NATIVE ACCELERATION** (Rust hóa) · **Track 9 = RESOURCE BUDGETING** (RAM/tài nguyên). Toàn bộ phase A1–A12 / B1–B10 hoàn thành trong vòng đời v1.1.0 (W9–W10 là phase gates cuối của 1.1.0).

---

# PHẦN A — PHÂN TÍCH & Ý TƯỞNG

## A1. Bản đồ hiệu năng hiện trạng

| Vùng                              | Package                                   | Tần suất         | Đặc điểm                           |
| --------------------------------- | ----------------------------------------- | ---------------- | ---------------------------------- |
| AST parse + code-graph + repo-map | `code-graph`, `shared` (tree-sitter WASM) | Mỗi task agent   | WASM đơn luồng; PageRank JS        |
| Security scanner                  | `security` (line-regex)                   | Mỗi lần scan     | `split('\n')` mảng dòng + regex JS |
| Retrieval BM25/RRF/MMR            | `ingest`/`memory`                         | Mỗi truy vấn RAG | DF **O(N²)** JS                    |
| Semantic search                   | `memory` (Rust addon)                     | Mỗi truy vấn     | **Đã Rust** — mẫu để nhân rộng     |
| Computer-use / Terminal           | Tauri Rust + node-pty                     | —                | **Đã native** — giữ nguyên         |

## A2. Số liệu probe thực tế (JS)

| Probe                  | Khối lượng           | Kết quả                  |
| ---------------------- | -------------------- | ------------------------ |
| A. Security line-regex | 5 MB code            | **69 ms** · heap +6.3 MB |
| B. BM25                | 10k chunks (4.6 MB)  | **4 230 ms** ⚠️ O(N²)    |
| C. PageRank            | 20k nodes × 30 iters | 32 ms                    |
| RSS node (probe)       | —                    | 94.8 MB                  |

## A3. 3 MỤC RUST HÓA (ý tưởng)

| #   | Mục                       | Cách làm                                               | CPU trước → sau                    | RAM trước → sau            |
| --- | ------------------------- | ------------------------------------------------------ | ---------------------------------- | -------------------------- |
| 1   | Scanner (`security`)      | `memchr` + `regex::bytes` streaming + `rayon`          | 69 → ~5 ms /5MB                    | 600 → <80 MB (repo 100 MB) |
| 2   | Retrieval (`ingest`)      | Inverted index + tokenizer UTF-8 + heap top-k          | 4 230 → ~20 ms /10k                | >300 → ~30 MB (100k)       |
| 3   | Code-graph (`code-graph`) | `tree-sitter` crate + rayon; CSR + PageRank `Vec<f32>` | WASM → 10–15×; PageRank 32 → ~3 ms | index 5–10× giảm           |

## A4. Targets RAM (ý tưởng)

Desktop < 500 MB · Sidecar < 300 MB · index code-graph < 120 MB · scan 100 MB repo < 100 MB · startup < 2 s.

---

# PHẦN B — 2 TRACK TRIỂN KHAI

## TRACK A — NATIVE ACCELERATION (Rust hóa + interim JS) — 12 Phase

| #   | Phase                               | Nội dung                                                                                                                                                   | Deliverable / Tiêu chí hoàn thành                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A1  | **Baseline CPU bench + CI gate**    | `scripts/bench-cpu.mjs`: 3 probe (scanner 5MB, BM25 10k, PageRank 20k) chạy trong CI; lưu `docs/perf-baseline.json`                                        | Gate chống regression CPU >10%                                |
| A2  | **Rust workspace + native bridge**  | `crates/` (workspace Cargo), pattern napi-rs theo `memory/semantic/rust`; package `@ghita/native-bridge`: `loadNative(name)` (resolve addon → fallback JS) | `pnpm build:native` build 3 target OS; bridge load/addon test |
| A3  | **JS interim: scanner streaming**   | Bỏ `split('\n')` → đọc block 1MB, regex trên buffer; giữ API `SecurityScanner`                                                                             | Scan 5MB: 69 → <25 ms; test cũ xanh                           |
| A4  | **JS interim: BM25 inverted index** | Precompute DF 1 lần + `Map<token, postings>`; thay lõi `bm25Score`                                                                                         | 10k chunks: 4 230 → <300 ms                                   |
| A5  | **JS interim: PageRank TypedArray** | `Float64Array` + CSR bằng `Uint32Array` trong `computePageRank`                                                                                            | 20k nodes: 32 → <10 ms                                        |
| A6  | **`secscan` crate core**            | Streaming scan engine: `memchr` multi-pattern + `regex::bytes`; block 1MB; rules từ JSON                                                                   | Unit test Rust; scan 5MB <10 ms (release)                     |
| A7  | **`secscan` napi + tích hợp**       | `rayon` song song file (giữ thứ tự theo chunk index), findings qua `Uint32Array` offset; tích hợp `SecurityScanner` với JS fallback                        | Benchmark before/after trong CI; 5MB ~5 ms                    |
| A8  | **`retrieval` crate core**          | Tokenizer UTF-8 (unicode-segmentation), inverted index, DF precompute, BM25                                                                                | Unit test Rust; 10k chunks <50 ms                             |
| A9  | **`retrieval` napi + tích hợp**     | RRF + MMR (cosine `Vec<f32>`) + top-k binary heap; `Uint32Array`+`Float32Array`; thay lõi `HybridRetriever`; index lifecycle (rebuild khi ingest)          | Benchmark CI; 10k chunks ~20 ms                               |
| A10 | **`codegraph` crate core**          | Bundle grammar (C/TS/JS/Python/Rust/Go), `tree-sitter` parse + `rayon` theo file; trích symbol/import                                                      | Unit test Rust; 10k file TS <5 s                              |
| A11 | **`codegraph` napi + tích hợp**     | Graph CSR `Vec<NodeId>` + edges; PageRank `Vec<f32>`; symbols qua typed arrays; thay `parseFiles`/`repo-map` (giữ fallback)                                | Benchmark CI; PageRank 20k ~3 ms; MCP server không đổi        |
| A12 | **Perf gates + docs + release**     | CI `bench-cpu` regression <10%; cập nhật `docs/perf-rust.md` (bảng before/after); coverage/mapping-gate; i18n                                              | Hoàn thiện v1.1.0 có số liệu                                  |

## TRACK B — RESOURCE BUDGETING (RAM & tài nguyên) — 10 Phase

| #   | Phase                                    | Nội dung                                                                                                                                                                                                | Deliverable / Tiêu chí hoàn thành         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| B1  | **RAM bench suite + baseline**           | `scripts/bench-ram.mjs`: 4 scenario (mở repo 10k file, scan 100MB, RAG 100k chunks, chat 200 turns); snapshot `process.memoryUsage` + RSS; lưu `docs/perf-baseline.json`                                | Baseline số thật; CI gate regression >10% |
| B2  | **Resource budget registry**             | `docs/resource-budget.json`: cap deny-default per module (ai-engine cache ≤128MB, index ≤200MB, semantic addon 100MB, chat 200 msg, scrollback…) + validator script `scripts/check-resource-budget.mjs` | Registry + validator test                 |
| B3  | **ai-engine cache caps**                 | LRU cap 128MB; dual cache TTL; KeyManager buffer bounded; CacheWarmer tôn trọng budget                                                                                                                  | Cap test; RSS đo được giảm                |
| B4  | **code-graph index cap + spill**         | Cap 200MB; evict LRU → spill SQLite (`SQLiteGraphStore` đã có); tái nạp theo yêu cầu                                                                                                                    | Index 10k file RSS <120 MB                |
| B5  | **Chat/terminal caps + Low-RAM động**    | Chat cap 200 (có) + độ dài message; scrollback động theo Low-RAM; Monaco worker count giảm ở Low-RAM                                                                                                    | Low-RAM mode giảm ≥25% RSS                |
| B6  | **Sidecar lazy-load audit + startup**    | Rà lại `server.mjs` lazy-load; memory journal bounded; mục tiêu startup <2 s                                                                                                                            | Startup bench <2 s                        |
| B7  | **Memory monitor runtime**               | Sampler định kỳ (mỗi 30s) + cảnh báo vượt budget qua `@ghita/monitoring` AlertEngine + indicator UI                                                                                                     | Cảnh báo e2e test                         |
| B8  | **Streaming/zero-copy audit**            | Hot paths trả TypedArray (native); JS interim: tránh object churn ở token counting, scanner, retrieval; batch read file                                                                                 | Heap giảm theo probe                      |
| B9  | **Mobile remote memory**                 | ScreenPreview frame budget (fps/resolution theo network), socket buffer cap, không giữ frame cũ                                                                                                         | Mobile RSS target                         |
| B10 | **Enforcement + gates + docs + release** | CI `bench-ram` regression <10%; validator budget chạy mỗi PR; cập nhật `docs/resource-plan.md`; i18n                                                                                                    | Hoàn thiện v1.1.0                         |

---

## Timeline tóm tắt (≈ 12–14 tuần)

| Tuần   | Track           | Phase                                         |
| ------ | --------------- | --------------------------------------------- |
| W1–W2  | A1–A5 · B1–B2   | Baselines, bench, JS interim, budget registry |
| W3–W4  | A6–A7 · B3–B5   | secscan native; cache/index/chat caps         |
| W5–W6  | A8–A9 · B6–B7   | retrieval native; lazy-load, memory monitor   |
| W7–W8  | A10–A11 · B8–B9 | codegraph native; zero-copy, mobile           |
| W9–W10 | A12 · B10       | Gates, docs, hoàn thiện v1.1.0                |

**Nguyên tắc:** deny-default tài nguyên · native-first + JS fallback · đo trước – đo sau · tận dụng code đã Rust (Tauri, memory addon).
