# Kế hoạch Review & Fix Bug sâu toàn bộ code — v1.1.0 (Track 10–12)

**Ngày:** 2026-08-10 · **Phạm vi:** toàn bộ monorepo (21+ packages, 3 apps, crates, scripts).
**Mục tiêu:** rà sâu toàn bộ code → registry findings phân loại → fix theo mức ưu tiên → shield regression.
**Tổng:** 3 Track · **19 phase** (7 + 7 + 5).

---

## TRACK 10 — DEEP REVIEW & AUDIT (7 phase)

| #   | Phase                             | Nội dung                                                                                                                                                                                                                                                              | Deliverable / Tiêu chí hoàn thành               |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R1  | **Audit core packages (6)**       | ai-engine · skills · agents · memory · security · code-graph: type-safety, error handling, resource leak (timer/listener/cache), TODO/FIXME/HACK inventory (`scripts/count-smells.mjs`), dead code                                                                    | 6 report con → gộp findings                     |
| R2  | **Audit phần còn lại + apps (3)** | browser-control · ingest · marketplace · mcp · evals · native-bridge · terminal-session · resource-budget · shared · communication · computer-use + apps/desktop · mobile · vscode-extension: cùng checklist R1 + React hooks cleanup (useEffect deps, subscriptions) | 3 report con                                    |
| R3  | **Tooling sweep**                 | `pnpm knip` (unused exports/deps), eslint toàn repo, `pnpm doctor`, typedoc errors (`typedoc_error.log`), stale deps (`pnpm outdated`), deprecated API                                                                                                                | Danh sách nợ kỹ thuật có số liệu                |
| R4  | **Security audit**                | SSRF (proxy.rs is_prohibited_ip), path traversal (scanner/ingest/fs tools), injection (shell/SQL), secret handling (vault, journal redaction), permission boundaries (PolicyEngine vs MCP/sandbox), `scripts/audit-policy.mjs`                                        | Findings security riêng, severity critical/high |
| R5  | **Concurrency & async audit**     | race conditions (pairing, journal, flow resume), unhandled rejections, AbortSignal coverage (ingest/scanner/agent), timer/listener cleanup, shared mutable state                                                                                                      | Checklist chấm từng điểm                        |
| R6  | **Boundary & edge-case audit**    | Windows paths (\\, MAX_PATH, core.longpaths), unicode/CJK (splitters, terminal), file 0/1/N lớn, empty inputs, i18n completeness (`check-i18n.mjs`), locale keys                                                                                                      | Danh sách edge-case đã test                     |
| R7  | **Registry + triage**             | Gộp toàn bộ findings → `docs/code-review-findings.md` (id, module, severity, evidence, phase fix)                                                                                                                                                                     | Registry hoàn chỉnh, triage P0/P1/P2            |

## TRACK 11 — BUG FIX & HARDENING (7 phase)

| #   | Phase                     | Nội dung                                                                                                                                      | Deliverable / Tiêu chí hoàn thành |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| F1  | **Fix P0 (critical)**     | Crash/data-loss/security findings từ R4/R5: fix + test ngay; verify không hồi quy package liên quan                                           | P0 = 0 còn mở                     |
| F2  | **Fix P1 (correctness)**  | Logic sai, boundary, concurrency, async leak từ R1/R2/R5                                                                                      | P1 = 0 còn mở                     |
| F3  | **Fix P2 (quality)**      | Error message rõ ràng, cleanup, dead code, deprecate API (R3), edge-case từ R6                                                                | P2 giảm ≥80%                      |
| F4  | **Bug→test mapping**      | Mỗi bug fix kèm 1 test regression (đúng `mapping-gate`); danh sách `bugId → testFile`                                                         | 100% bug có test                  |
| F5  | **Property/fuzz testing** | `fast-check` cho parser (frontmatter, splitter, repair tool-call, act-cache key, CLI args) — bất biến: không crash, output hợp lệ, idempotent | ≥5 suite property                 |
| F6  | **E2E desktop + mobile**  | Smoke: startup <2s, chat stream, edit review gate, terminal, pairing/remote; mobile remote control; vscode-extension sync                     | Checklist E2E xanh                |
| F7  | **Release hardening**     | Integration gates (`pnpm integrity`, coverage tiers), CHANGELOG v1.1.0, docs cập nhật, registry đóng                                          | Gates xanh, registry đóng P0-P2   |

## TRACK 12 — QUALITY GATES & REGRESSION SHIELD (5 phase)

| #   | Phase                      | Nội dung                                                                                                                                  | Deliverable / Tiêu chí hoàn thành |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| G1  | **Bug-regression gate CI** | Workflow chạy: mọi PR chạy `bug→test` map (script `scripts/check-bug-tests.mjs` đọc findings registry + đối chiếu test files)             | Gate xanh/đỏ đúng luật            |
| G2  | **Property-test CI**       | Chạy suite fast-check (F5) nightly + mỗi PR chạm package liên quan                                                                        | 0 fail                            |
| G3  | **E2E smoke CI**           | Startup + chat + edit gate + terminal smoke trên headless desktop build (Windows CI)                                                      | Smoke xanh                        |
| G4  | **Coverage nâng floor**    | core packages: statements 50→60, branches 45→55 (tiered, `docs/coverage-tiers.json`); package mới (Track 8/9) có floor riêng              | coverage-tiers gate xanh          |
| G5  | **Đóng vòng & tổng kết**   | Rà registry lần cuối (0 mở P0-P2), docs `code-review-findings.md` → "closed" cho tất cả, CHANGELOG mục Bug Fixes v1.1.0, tổng kết số liệu | Registry 100% closed              |

---

## Phương pháp chung

- **Bug→test mapping:** mọi fix bắt buộc test regression — gate G1 tự kiểm.
- **Đo trước–sau:** findings có evidence (file:line), fix kèm số liệu (trước/sau).
- **Deny-default khi không chắc:** lỗi không rõ nguyên nhân → tách test tái hiện trước khi sửa.
- Tận dụng script có sẵn: `count-smells.mjs`, `audit-policy.mjs`, `check-coverage-tiers.mjs`, `mapping-gate.mjs`, `check-i18n.mjs`, `doctor.mjs`, `knip`.
- Tổng phase v1.1.0 mới: **114 + 19 = 133 phase** (xem `Plan/v1.1.0-phase-breakdown.md`).
