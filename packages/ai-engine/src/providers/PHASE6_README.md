# Phase 6 — Apply Steps

Anh copy đoạn dưới và paste cuối file `packages/ai-engine/src/providers/index.ts`:

```typescript
// --- Phase 6: defineVendor + new providers ---
export { defineVendor, type VendorSpec } from './base-extended.js';
export { KimiProvider } from './kimi.js';
export { MiniMaxProvider } from './minimax.js';
export { DeepSeekProvider } from './deepseek.js';
export {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  listOAuthProviders,
  type OAuthProviderSpec,
} from './oauth-registry.js';
```

Vị trí: dòng cuối file (sau dòng `export { MistralProvider } from './mistral.js';`).
