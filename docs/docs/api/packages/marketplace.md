---
id: packages-marketplace
title: @ghita/marketplace
sidebar_label: marketplace
---

# @ghita/marketplace

Community marketplace client & server.

```typescript
import { MarketplaceClient } from '@ghita/marketplace';

const mp = new MarketplaceClient({ registry: 'https://ghita.dev/marketplace' });
const skills = await mp.search('vercel');
await mp.install(skills[0].id);
```
