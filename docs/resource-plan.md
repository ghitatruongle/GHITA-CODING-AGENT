# Kế hoạch tối ưu RAM & tài nguyên — v1.1.0 Track 9 (RESOURCE BUDGETING)

**Ngày:** 2026-08-10 · **Phase B1–B10** · Chi tiết gốc: `docs/rust-optimization-plan.md` (Track 9).

## 1. B1 — RAM benchmark suite (đã chạy, baseline lưu `docs/perf-ram-baseline.json`)

`node scripts/bench-ram.mjs [--baseline]` — 4 scenario đo heap delta + peak RSS:

| Scenario                | Heap delta  | Ghi chú                                                 |
| ----------------------- | ----------- | ------------------------------------------------------- |
| scanner 5MB             | **0.03 MB** | lazy-line + alternation (Track 8) — không còn mảng dòng |
| BM25 10k chunks (index) | 24.95 MB    | chi phí inverted index JS; bản native giảm mạnh (Vec)   |
| chat 200 messages       | 0.09 MB     | trong budget                                            |
| terminal 10k lines      | 3.58 MB     | trong budget                                            |
| Peak RSS (toàn bộ)      | 93 MB       | < target sidecar 300 MB                                 |

Gate: +10% (abs > 2MB), chạy nightly + PR (`bench-ram.yml`).

## 2. B2 — Resource budget registry (deny-default)

- `@ghita/resource-budget` — `BudgetRegistry.register/account/state/violations`:
  module **không đăng ký → bị deny**; hard-limit rollback về cap; soft-limit giữ giá trị.
- Config: `docs/resource-budget.json` (7 caps) + gate `scripts/check-resource-budget.mjs`.

| Module                   | Cap                          |
| ------------------------ | ---------------------------- |
| ai-engine.cache          | 128 MB (hard)                |
| ai-engine.semantic-cache | 100 MB (hard)                |
| code-graph.index         | 200 MB (soft → spill SQLite) |
| chat.history             | 10 MB (hard)                 |
| terminal.scrollback      | 8 MB (hard)                  |
| browser.screen-preview   | 5 MB (hard)                  |
| sidecar.journal          | 16 MB (hard)                 |

## 3. B3 — ai-engine cache byte-cap

`LRUCache` đã có `maxMemoryBytes` (config) — giờ **thực thi**: `set()` trừ/trừ bytes khi
replace, evict LRU tới khi dưới cap, `memoryBytes()`, `clear()` reset. Test: evict-by-bytes,
replace consistency (đã thêm 2 test vào `lru-cache.test.ts`).

## 4. B4 — code-graph index budget

`packages/code-graph/src/budget.ts` — `IndexBudgetTracker`: ước lượng bytes theo
node/edge (estimateNodeBytes/estimateEdgeBytes), cap 200 MB, `evict(count, drop, nodes)`,
`spillSuggestion` (nối `SQLiteGraphStore` đã có). Test: over-cap → spill, evict → under.

## 5. B5 — Chat/terminal caps + Low-RAM

`@ghita/resource-budget`: `ChatHistoryBudget` (maxMessages/maxChars/maxTotal),
`ScrollbackBudget` (maxLines/maxBytes + evict) — deny-default khi vượt cap. Desktop
Low-RAM mode hiện có giữ nguyên; các budget này là lớp dữ liệu cho UI.

## 6. B6 — Sidecar lazy-load audit

`scripts/audit-lazy-load.mjs` — kết quả: sidecar **đã có 10 dynamic import** (ai-engine,
skills, computer-use, browser-control…) — lazy-load sẵn; còn 2 static import (memory,
security) ghi nhận.

## 7. B7 — Memory monitor runtime

`@ghita/resource-budget` — `MemoryMonitor`: sampler theo interval (30s), caps heap/RSS,
`checkBudgets()` gắn `BudgetRegistry` → `onAlert('heap'|'rss'|'budget')` (nối được vào
`@ghita/monitoring` AlertEngine ở tầng app). Test: alert heap + budget overrun.

## 8. B8 — Zero-copy / streaming audit

`scripts/audit-zero-copy.mjs` — kết quả: `split(\n)` còn 3 (ingest), **JSON clone: 0**,
push-in-loop 34 (đã giảm mạnh nhờ Track 8: scanner lazy-line, BM25 inverted index,
PageRank TypedArray, native trả typed arrays).

## 9. B9 — Mobile screen preview budget

`ScreenPreviewBudget` (maxFps/maxBytesPerFrame/maxBufferedFrames) — deny frame vượt
fps/size. Test đầy đủ.

## 10. B10 — Enforcement + gates

- `scripts/check-resource-budget.mjs` — gate caps + deny-default (chạy trong
  `bench-ram.yml`).
- Workflow `.github/workflows/bench-ram.yml` — nightly + PR: RAM gate + budget gate +
  2 audits.

## Verify

```bash
pnpm --filter @ghita/resource-budget typecheck && pnpm --filter @ghita/resource-budget test   # 7 tests
pnpm --filter @ghita/code-graph test    # 49 tests (thêm budget ×4)
pnpm --filter @ghita/ai-engine test     # 794 tests (thêm byte-cap ×2)
node scripts/bench-ram.mjs --baseline   # PASS
node scripts/check-resource-budget.mjs  # OK
```

**Targets:** Desktop < 500 MB RSS · Sidecar < 300 MB · startup < 2 s (đo qua
`bench-startup.mjs` + audits trong CI).
