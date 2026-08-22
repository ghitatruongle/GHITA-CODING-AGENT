# CSP Hardening Plan

## Current State

The Tauri CSP in `apps/desktop/src-tauri/tauri.conf.json` uses:

```
style-src 'self' 'unsafe-inline';
```

This is required during development for dynamic style injections (CSS-in-JS, Tailwind, etc.).

## Hardening Steps

### Phase 1: Nonce-based CSP (Recommended)

1. Generate a random nonce per request in the Rust backend
2. Pass the nonce to the React frontend via Tauri event system
3. Apply the nonce to all `<style>` tags via `data-nonce` attribute
4. Replace `'unsafe-inline'` with `'nonce-{random}'`

**Before:**

```
style-src 'self' 'unsafe-inline';
```

**After:**

```
style-src 'self' 'nonce-{random}';
```

### Phase 2: Hash-based CSP (Alternative)

If nonce injection is too complex, use hash-based CSP:

1. Compute SHA-256 hashes of all inline styles at build time
2. Add hashes to CSP header
3. Remove `'unsafe-inline'`

### Phase 3: Strict CSP (Future)

1. Move all inline styles to external CSS files
2. Use CSS modules or Tailwind with purged output
3. Remove all inline style directives

## Implementation Notes

- The `'unsafe-inline'` directive in `style-src` is the only remaining CSP weakness
- `script-src 'self'` is already strict (no inline scripts)
- `object-src 'none'` and `frame-ancestors 'none'` are already set
- `form-action 'none'` prevents form-based data exfiltration

## Tracking

- Issue: CSP hardening requires Tauri Rust backend changes
- Priority: High (security improvement)
- ETA: Next sprint
