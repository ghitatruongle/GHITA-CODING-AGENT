# v1.0.0 Release Roadmap

## Current Status: v0.0.4 (Beta)

This document tracks the path to v1.0.0 production-ready release.

---

## Criteria for v1.0.0

### Must-Have (Blockers)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | All CI jobs pass (lint, typecheck, test, coverage) | ✅ | 20/20 tasks pass |
| 2 | Coverage ≥80% for all 22 packages | ⚠️ | Coverage-gate configured, needs verification on CI |
| 3 | E2E smoke tests pass on CI | ✅ | Playwright E2E job added to CI |
| 4 | Security audit clean | ✅ | npm audit job added, SECURITY.md complete |
| 5 | Tauri CSP tightened (no unsafe-inline) | ⚠️ | Documented in SECURITY.md, needs implementation |
| 6 | Tauri capabilities scoped (no ** wildcard) | ⚠️ | `capabilities/default.json` still uses `**` scope |
| 7 | Code signing for releases | ❌ | No signing in release.yml yet |
| 8 | macOS notarization | ❌ | Not configured |
| 9 | Sentry DSN configured for production | ⚠️ | Sentry client exists, needs production DSN |
| 10 | Telemetry opt-in UI in settings | ⚠️ | Policy documented in `docs/telemetry-policy.md` |

### Should-Have (Recommended)

| # | Criterion | Status |
|---|-----------|--------|
| 11 | iOS support | ❌ | Android only currently |
| 12 | Self-hosted Sentry option | ⚠️ | DSN configurable |
| 13 | Code of Conduct & Governance docs | ❌ | Missing |
| 14 | 3+ external contributors | ❌ | Solo maintainer |
| 15 | Migration guide from v0.x → v1.0 | ❌ | Missing |

### Nice-to-Have

| # | Criterion | Status |
|---|-----------|--------|
| 16 | Windows ARM64 builds | ❌ |
| 17 | Plugin marketplace public catalog | ⚠️ | Catalog exists, no public registry |
| 18 | i18n for all UI strings | ⚠️ | EN/VI/ZH partial |
| 19 | Voice I/O production-ready | ⚠️ | `@ghita/voice` package exists |

---

## Release Process

### Pre-Release (v0.0.5-rc1)

1. [ ] Fix Tauri CSP: replace `'unsafe-inline'` with nonces
2. [ ] Scope Tauri fs:capability to `$APPDATA` only
3. [ ] Add code signing to `release.yml`
4. [ ] Verify 80% coverage on all 22 packages via CI
5. [ ] Add Sentry DSN to `.env.example`
6. [ ] Run full E2E test suite (not just smoke)

### Release Candidate (v0.0.5-rc2)

7. [ ] Code signing + notarization for all platforms
8. [ ] Security audit by third party
9. [ ] Migration guide written
10. [ ] Public announcement draft

### v1.0.0

11. [ ] All must-haves ✅
12. [ ] Tag release: `git tag v1.0.0`
13. [ ] Trigger GitHub Release workflow
14. [ ] Announce on Product Hunt, Reddit, Discord

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| DEMO | 2026-05-19 | Initial demo |
| 0.0.1 | 2026-05-21 | Connection optimization |
| 0.0.2 | 2026-05-26 | VS Code-style editor, 13 AI providers |
| 0.0.3 | 2026-06-07 | Native AI runtime, security hardening |
| 0.0.4 | 2026-06-18 | Push notifications, multi-channel comms |
| **1.0.0** | TBD | **Production-ready** |
