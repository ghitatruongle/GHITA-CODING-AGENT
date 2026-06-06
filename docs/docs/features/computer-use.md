---
id: computer-use
title: Computer Use
sidebar_label: Computer Use
sidebar_position: 3
---

# Computer Use

Cho phép agent điều khiển desktop (mouse, keyboard, screenshot) thông qua natural language.

## API chính

```typescript
import { ComputerUse } from '@ghita/computer-use';

const cu = new ComputerUse();

// Screenshot
const screen = await cu.screenshot();

// Click
await cu.click(100, 200);

// Type
await cu.type('Hello world');

// Keyboard shortcut
await cu.hotkey('ctrl', 's');

// Wait & find
const button = await cu.findOnScreen('Submit button');
await cu.clickAt(button.coords);
```

## Workflows

```typescript
// Tự động đăng nhập
await cu.fill('username@example.com', { field: 'email' });
await cu.fill('myPassword', { field: 'password', secure: true });
await cu.clickOnText('Sign in');
```

## Safety

- Có **confirmation prompt** trước mỗi action có thể phá hoại (delete, sudo, ...)
- **Audit log** lưu lại mọi action (Phase 34)
- **Sandbox mode** chạy trong VM khi bật

Xem `@ghita/browser-control` cho browser automation.
