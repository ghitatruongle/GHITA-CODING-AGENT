---
id: packages-browser-control
title: @ghita/browser-control
sidebar_label: browser-control
---

# @ghita/browser-control

Playwright-based browser automation.

```typescript
import { BrowserController } from '@ghita/browser-control';

const browser = new BrowserController();
await browser.launch({ headless: false });
await browser.goto('https://example.com');
await browser.click('#submit');
const text = await browser.extract('.result');
await browser.close();
```
