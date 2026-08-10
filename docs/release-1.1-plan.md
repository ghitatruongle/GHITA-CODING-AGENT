# Kế hoạch Release v1.1.0 — Track 13 & 14 (Build Installer + Phát hành 0 bug / 0 warning)

**Ngày:** 2026-08-10 · **Trạng thái: Track 13 ✅ · Track 14 ✅ HOÀN THÀNH (v1.1.0 đã phát hành public, 11 assets + latest.json)**
**Mục tiêu:** hoàn thiện installer, build installer đủ nền tảng, phát hành **v1.1.0 với 0 bug / 0 warning**.
**Tổng:** 2 Track · **8 phase** (4 + 4) · phụ thuộc chặt: Track 14 chỉ chạy sau Track 13 xanh.

> ✅ **TRACK 13 — ĐÃ THỰC THI (2026-08-10).** Deliverable: `docs/release-audit-report.md` (RL1) · `docs/release-bundler-checklist.md` (RL2) · `docs/release-pipeline-design.md` (RL3) · **`release/GHITA-CODING-AGENT-Setup-v1.1.0.exe` + `.sha256`** (RL4, checksum khớp, FileVersion 1.1.0). Blocking bug CR-019 (shim exports) đã fix. Ghi chú cho Track 14: **pin Node 22** khi build desktop (Node 24 + vite 6.4.2 → segfault 0xC0000005 giả lỗi).

---

## TRACK 13 — RELEASE BUILD & INSTALLER (4 phase)

| #   | Phase                                | Công việc (chỉ lập kế hoạch)                                                                                                                                                                                                                                                                                    | Deliverable / Tiêu chí hoàn thành                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RL1 | **Audit release gates hiện có**      | Rà các script/sản phẩm có sẵn (không sửa): `scripts/check-artifacts.mjs`, `sync-version.mjs`, `build-installer.mjs` (+ `--debug`), `updater-manifest.mjs`, `generate-icons.mjs`, `fix-ico.mjs`, `docker-compose.yml`, `tauri.conf.json` (bundle targets, icons, identifiers, CSP), `Cargo.toml` profile release | Bảng inventory: mỗi gate làm gì / input gì / output gì / đã chạy lần cuối bao giờ — **`docs/release-audit-report.md` ✅**                                                                                                                                                                                                |
| RL2 | **Hoàn thiện cấu hình bundler**      | Kiểm tra (không sửa) danh sách target: Windows NSIS + MSI, Linux AppImage + deb, macOS dmg (khi có runner); icons đủ kích thước; identifier/version nhất quán; updater endpoint + public key                                                                                                                    | Checklist target × nền tảng, ghi rõ mục nào cần chỉnh khi duyệt — **`docs/release-bundler-checklist.md` ✅** (mục cần chỉnh: ICNS chuẩn cho macOS + pin Node 22)                                                                                                                                                         |
| RL3 | **Pipeline build installer CI**      | Thiết kế (chưa viết) workflow `release-installer.yml`: build packages → build desktop (Windows/Linux/macOS matrix) → `build-installer.mjs` → upload artifact + dump SHA-256 → updater manifest                                                                                                                  | Sơ đồ pipeline + danh sách artifact dự kiến theo nền tảng — **`docs/release-pipeline-design.md` ✅** (kết luận: `release.yml` đã đủ, không viết workflow trùng)                                                                                                                                                          |
| RL4 | **Chạy toàn bộ gates trước release** | Thực thi (tại phase, sau khi bạn duyệt) theo thứ tự: `pnpm integrity` → build packages → `pnpm build:desktop` (debug) → `build-installer.mjs` → `updater-manifest` → đối chiếu artifact                                                                                                                         | **1 artifact/OS + bảng checksum**; bất kỳ gate đỏ → dừng release — **Windows ✅**: integrity PASS · packages 28/28 · vite build ✅ (Node 22, fix CR-019) · installer `release/GHITA-CODING-AGENT-Setup-v1.1.0.exe` (28.3 MB) + `.sha256` khớp · FileVersion 1.1.0 · updater-manifest đúng hành vi (bản ghi ký = CI-only) |

## TRACK 14 — RELEASE VERIFICATION & PUBLISH (4 phase)

| #   | Phase                         | Công việc                                                                                                                                                                                                                   | Deliverable / Tiêu chí hoàn thành                            |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| V1  | **Zero-warning audit**        | (chạy sau duyệt) Ma trận lệnh toàn repo, **mỗi lệnh phải 0 error & 0 warning**: `pnpm typecheck` (toàn bộ), build tất cả packages (`tsc -b` không warning), `pnpm lint`, knip (hoặc list accepted), `cargo clippy` (crates) | Bảng "command → exit 0, output 0 warning" 100%               |
| V2  | **Zero-bug verification**     | Chạy toàn bộ test suites 12 track: unit + property (fast-check) + cargo test + `evals-gate` + `e2e-smoke` + `desktop-smoke` (Windows) + bench CPU/RAM gates + `check-coverage-tiers`                                        | Toàn bộ xanh; bất kỳ đỏ → DỪNG release, quay Track 11        |
| V3  | **Version & artifact verify** | `sync-version.mjs --check` (mọi nơi 1.1.0) · CHANGELOG [1.1.0] hoàn chỉnh (12 track + Fixed + Quality Gates) · README badge · tags `v1.1.0` · registry `code-review-findings.md` → section "Release v1.1.0 — closed"        | Checklist verify 100%                                        |
| V4  | **Publish + post-release**    | `gh release create v1.1.0` + upload installer/checksum/updater manifest + release notes · post-publish smoke: cài từ artifact + startup + chat + edit gate · đóng ROADMAP mục v1.1.0                                        | GitHub Release với artifacts; smoke sau cài OK; roadmap đóng |

---

## Nguyên tắc

- **0 bug 0 warning là TIÊU CHÍ DỪNG**: V1/V2 chạy 1 lỗi/cảnh báo nào → không phát hành, quay lại Track 11.
- Track 13 RL1–RL3 là **audit + thiết kế** (đã xong); RL4 **đã chạy sau khi bạn duyệt qua /goal** (Windows artifact ✅); Track 14 (V1–V4) chạy **sau khi bạn duyệt**.
- Tận dụng tối đa script có sẵn — không viết lại wheel.

**Tổng phase v1.1.0: 133 (Track 1–12) + 8 (Track 13–14) = 141 phase** (xem cập nhật `Plan/v1.1.0-phase-breakdown.md`).
