# RL2 — Checklist cấu hình Bundler (Track 13)

> **Ngày:** 2026-08-10 · **Trạng thái:** ✅ HOÀN THÀNH (kiểm tra read-only — chưa sửa cấu hình; mục nào cần chỉnh ghi rõ "CẦN CHỈNH")

Nguồn: `apps/desktop/src-tauri/tauri.conf.json`, `scripts/generate-icons.mjs`, `scripts/fix-ico.mjs`, `scripts/build-installer.mjs`, `.github/workflows/release.yml`.

## 1. Ma trận target × nền tảng

| Nền tảng | Target                 | Cấu hình hiện có                                                                                                                                                                                      | Trạng thái                                                         |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Windows  | **NSIS**               | `bundle.targets: nsis` · `windows.nsis.installMode=currentUser` · languages English+Vietnamese · webview `downloadBootstrapper` silent · `build-installer.mjs` build `--bundles nsis` → single `.exe` | ✅ Sẵn sàng                                                        |
| Windows  | **MSI**                | `bundle.targets: msi` · CI `build-windows` upload `bundle/msi/*.msi`                                                                                                                                  | ✅ Sẵn sàng (yêu cầu WiX trên runner — có sẵn trên windows-latest) |
| Linux    | **AppImage**           | `bundle.targets: appimage` · CI cài `libwebkit2gtk-4.1 libgtk-3 libayatana-appindicator3 librsvg2 libxdo`                                                                                             | ✅ Sẵn sàng                                                        |
| Linux    | **deb**                | `bundle.targets: deb` · CI upload `bundle/deb/*.deb`                                                                                                                                                  | ✅ Sẵn sàng                                                        |
| macOS    | **dmg**                | `bundle.targets: dmg` · CI matrix `x86_64-apple-darwin` + `aarch64-apple-darwin` · upload `bundle/dmg/*.dmg`                                                                                          | ✅ Sẵn sàng (cần runner macOS + cert khi ký)                       |
| macOS    | **app bundle updater** | `bundle/macos/*.app.tar.gz` (+ `.sig`) là artifact updater                                                                                                                                            | ✅ Sẵn sàng                                                        |
| Android  | APK release            | `build-android` job (keystore từ secrets)                                                                                                                                                             | ✅ Sẵn sàng                                                        |
| iOS      | `.app` + dSYM          | `build-ios` (sign disabled, artifact CI)                                                                                                                                                              | ✅ Sẵn sàng                                                        |

## 2. Icons

| Item                                                     | Yêu cầu           | Trạng thái                                                                                                                     |
| -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png` | Tauri bắt buộc    | ✅ Có (đã generate)                                                                                                            |
| `icon.ico` (Windows, multi-size)                         | Proper ICO        | ✅ Có (`fix-ico.mjs`, sizes 16–256)                                                                                            |
| `icon.icns` (macOS)                                      | Proper ICNS       | ⚠ **CẦN CHỈNH** — hiện là PNG placeholder; phải convert bằng `iconutil -c icns` trên macOS runner trước khi release chính thức |
| Bộ Windows Store (10 size)                               | MSIX/Store        | ✅ Có                                                                                                                          |
| `android/`, `ios/`                                       | splash + launcher | ✅ Có                                                                                                                          |

## 3. Identifier / version / updater

| Item                     | Giá trị                                                                                         | Trạng thái                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `identifier`             | `com.ghita.coding-agent`                                                                        | ✅ Nhất quán (tauri.conf, Cargo, native)                                              |
| Version                  | `1.1.0` mọi nơi (crate, gradle versionCode `1001000`, pbxproj, snapcraft, i18n, constants)      | ✅ `pnpm integrity` verified 2026-08-10                                               |
| Updater endpoint         | `https://github.com/ghitatruongle/GHITA-CODING-AGENT/releases/latest/download/latest.json`      | ✅ Đúng repo release                                                                  |
| Pubkey                   | Có trong `plugins.updater.pubkey`                                                               | ✅ Đúng (khớp key dùng để ký .sig)                                                    |
| `createUpdaterArtifacts` | `true`                                                                                          | ✅ (CI export `TAURI_SIGNING_PRIVATE_KEY` + password; local build tự tắt rồi restore) |
| Signing secrets CI       | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, Android keystore (4 secrets) | ✅ Khớp tên trong release.yml                                                         |

## 4. Mục "cần chỉnh khi được duyệt" (gọn)

1. **macOS icon.icns**: thêm bước convert ICNS chuẩn trên macOS runner (hoặc trong `generate-icons.mjs` cho macOS bằng `iconutil`) — không chặn build, nhưng nên làm trước Track 14 publish.
2. **Pin Node 22 cho build installer local** (máy này đang Node 24 → segfault giả). Khuyến nghị: dùng `node-v22.23.2-win-x64` portable (đã tải tại `C:\Users\Acer\.zcode\tools\node22`) hoặc cập nhật `.nvmrc`/CI — để V1 (zero-warning) dùng đúng toolchain CI.

Không còn mục nào khác cần chỉnh: targets, icons, identifier, version, updater endpoint + pubkey đều đầy đủ và nhất quán.
