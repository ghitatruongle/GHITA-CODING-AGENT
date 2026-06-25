# @ghita/browser-control

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Browser automation package built on Playwright with stealth capabilities, enabling GHITA agents to navigate, extract, and interact with web pages programmatically.

## Key Features

- **Playwright-powered automation** -- full browser control with headless and headed modes.
- **Stealth / anti-detection** -- integrates `playwright-stealth` to reduce bot-detection fingerprint.
- **DOM extraction** -- structured extraction of text, tables, forms, and interactive elements.
- **Tab management** -- multi-tab orchestration with isolated contexts per task.
- **AI-assisted browsing** -- coordinates with computer-use for vision-guided page interaction.

## Installation

```bash
pnpm install --filter @ghita/browser-control
```

## Usage

```typescript
import { BrowserController } from '@ghita/browser-control';

const browser = new BrowserController({ headless: true });
await browser.navigate('https://example.com');
const content = await browser.extractDOM();
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
