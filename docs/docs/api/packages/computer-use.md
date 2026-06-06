---
id: packages-computer-use
title: @ghita/computer-use
sidebar_label: computer-use
---

# @ghita/computer-use

Desktop control (mouse, keyboard, screen capture).

```typescript
import { ComputerUse } from '@ghita/computer-use';

const cu = new ComputerUse();
const screen = await cu.screenshot();
await cu.click(100, 200);
await cu.type('Hello');
```
