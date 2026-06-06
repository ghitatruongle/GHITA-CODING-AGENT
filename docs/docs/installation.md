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
