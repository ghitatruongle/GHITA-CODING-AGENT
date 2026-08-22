---
id: installation
title: Installation
sidebar_label: Installation
sidebar_position: 2
---

# Installation

Chi tiết cài đặt cho từng nền tảng.

## Desktop (Tauri)

**Yêu cầu:**

- Node.js ≥ 20
- Rust ≥ 1.70
- pnpm ≥ 10

**Linux thêm:**

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

**macOS thêm:**

```bash
xcode-select --install
```

**Build:**

```bash
pnpm install
pnpm --filter @ghita/desktop tauri build
```

Output: `apps/desktop/src-tauri/target/release/bundle/`

## Mobile (Android)

**Yêu cầu:**

- Android Studio
- JDK 17
- Android SDK 34

**Build:**

```bash
pnpm --filter @ghita/mobile android
```

## VSCode Extension

```bash
pnpm --filter @ghita/vscode-extension package
code --install-extension apps/vscode-extension/vsix/*.vsix
```

---

## Cẩm nang thiết lập Môi trường Phát triển Native (Advanced Native Setup Guide)

Để xây dựng và kiểm thử hoàn chỉnh các thành phần native của dự án GHITA (như Tauri desktop shell hay Bluetooth di động Android), hãy làm theo hướng dẫn dưới đây.

### 1. Thiết lập Môi trường Desktop (Tauri & Rust)

Ứng dụng desktop GHITA sử dụng **Tauri v2** làm giao diện vỏ và gọi các hàm hệ thống thông qua Rust.

- **Cài đặt Rust Toolchain**:
  - Truy cập [rustup.rs](https://rustup.rs/) để cài đặt Rustup.
  - Đảm bảo phiên bản Rust ≥ 1.70. Kiểm tra bằng cách chạy: `rustc --version` và `cargo --version`.
- **Thao tác chuột/phím (Computer Use) & Terminal**:
  - Ứng dụng cần quyền truy cập trợ năng để mô phỏng sự kiện chuột/bàn phím. Trên macOS, bạn cần cấp quyền cho ứng dụng trong mục **System Settings → Privacy & Security → Accessibility**.
  - Trên Linux, đảm bảo bạn đã cài đặt các thư viện `xtst` và `x11` để biên dịch module chụp màn hình native.

### 2. Thiết lập Môi trường Mobile (Android & BLE)

Ứng dụng di động đồng hành sử dụng React Native và giao tiếp không dây qua **Bluetooth Classic** hoặc **Bluetooth Low Energy (BLE)**.

- **Android SDK & NDK**:
  - Cài đặt Android Studio và thiết lập biến môi trường `ANDROID_HOME` chỉ đến thư mục SDK.
  - Trong Android SDK Manager, cài đặt:
    - **Android SDK Platform 34**
    - **Android SDK Build-Tools 34.0.0**
    - **Android NDK (Side by side)** (Khuyên dùng bản LTS mới nhất để biên dịch Bluetooth native module).
- **Cấu hình Bluetooth Emulator (Quét giả lập)**:
  - Trình giả lập Android Emulator tiêu chuẩn của Google Play Services không hỗ trợ BLE thực tế.
  - Để kiểm thử Bluetooth trên Emulator:
    1.  Sử dụng một thiết bị thật kết nối qua ADB (`adb devices`), OR
    2.  Sử dụng **Genymotion** hoặc thiết lập một công cụ chuyển tiếp Bluetooth qua USB (USB Bluetooth Passthrough) sang máy ảo Emulator.
    3.  Đảm bảo đã bật cờ quét Bluetooth trong AndroidManifest và chấp nhận ghép đôi. Trên Android 12+ (API 31+), cờ `neverForLocation` đã được thiết lập giúp quét Bluetooth mà không cần cấp quyền vị trí thô.

### 3. Tối ưu hóa Monorepo & Khắc phục lỗi build

- **Lỗi chiếm dụng cổng (Port Conflict)**:
  - Mặc định sidecar daemon Node.js chạy trên cổng `8080` (hoặc cổng tự động dò tìm kế tiếp). Nếu cổng bị chiếm dụng, daemon sẽ tự động chọn cổng trống kế tiếp và thông báo qua tệp tin `.ghita/port.json`.
- **Làm sạch và đồng bộ lại dependencies**:
  ```bash
  pnpm clean:all
  pnpm install
  ```
