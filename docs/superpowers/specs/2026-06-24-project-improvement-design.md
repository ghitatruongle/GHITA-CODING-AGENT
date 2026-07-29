# GHITA CODING AGENT — Project Improvement Design Spec

> **Date:** 2026-06-24
> **Status:** Draft — Pending Review
> **Approach:** 7 Parallel Streams
> **Timeline:** No pressure (solo developer)
> **Scope:** All packages + apps, including stub packages

---

## 1. Current State Assessment

### 1.1 Scores (out of 100,000)

| Area                     | Current Score | Target |
| ------------------------ | ------------- | ------ |
| Architecture & Structure | 90% (13,500)  | 97%    |
| Testing                  | 80% (12,000)  | 93%    |
| Security                 | 90% (9,000)   | 97%    |
| Code Quality             | 85% (8,500)   | 95%    |
| Multiplatform            | 80% (8,000)   | 93%    |
| Dependencies             | 90% (4,500)   | 97%    |
| Community                | 80% (4,000)   | 93%    |

### 1.2 What Exists Today

**Architecture:**

- 22 packages in monorepo, clean DAG dependency graph
- 6 stub packages: `a11y`, `i18n`, `migration`, `mobile-companion`, `integration`, `relay-server`
- Turborepo + pnpm workspace orchestration
- Adapter pattern for extensibility (no formal DI)
- Architecture docs in Docusaurus (architecture.md, data-flow.md, packages.md)
- ADR directory exists at `docs/adr/`

**Testing:**

- Vitest with `@vitest/coverage-v8`, 1,918 tests passing
- 80% line coverage gate enforced in CI
- Test types: unit, integration, E2E (Playwright), fuzz, performance, quality-loop
- Per-package `vitest.config.ts` files
- Playwright smoke tests in CI

**Security:**

- `packages/security`: InputSanitizer (10 rules, SSRF, DNS rebinding), CorsAuditor (7 checks), SecretRotator, AuditRunner
- AES-256-GCM encryption via CryptoHelper
- Tauri CSP: `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`
- `.ghita/security-blacklist.yaml` for terminal command blocking
- `.ghita/rules.yaml` for AST-Lock protection
- CI: CodeQL, dependency-review (blocks GPL/AGPL), weekly security-scan, SBOM generation
- Threat model documented in SECURITY.md

**Code Quality:**

- ESLint v9 flat config: `no-explicit-any: error`, `no-unused-vars: error`, `consistent-type-imports: error`
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Prettier (100 char width, single quotes, trailing commas)
- Husky pre-commit → lint-staged (Prettier + ESLint)
- Commitlint config exists (`@commitlint/config-conventional`) but **no `commit-msg` hook wired**
- `.editorconfig` for cross-editor consistency
- No complexity rules configured

**Multiplatform:**

- Desktop: Windows (MSI/NSIS), Linux (deb/AppImage), macOS (dmg/app) via Tauri v2
- Mobile: Android (APK, minSdk 28), iOS (basic Xcode config, CocoaPods)
- VS Code Extension
- Docker: multi-stage build, multi-arch (amd64+arm64)
- `Platform` type: `'windows' | 'linux' | 'android' | 'macos'` (missing `'ios'`)

**Dependencies:**

- pnpm 11.5.2 with lockfile
- Dependabot: npm (weekly), GitHub Actions (weekly), Cargo (monthly)
- Resolutions for security patches: ws, serialize-javascript, uuid, cross-spawn
- `dependency-review.yml` blocks GPL/AGPL licenses

**Community:**

- MIT license
- Discord community
- GitHub Issues templates
- CONTRIBUTING.md (bilingual EN/VN)
- PR template in CONTRIBUTING.md
- No contributor recognition system
- No example projects or starter templates

---

## 2. Design: 7 Parallel Streams

### Stream 1: Architecture & Structure

**Goal:** From 90% → 97%

#### 1a. Implement 6 Stub Packages

Each stub package gets a **minimal but functional implementation** — defined as: types exported, core class/function implemented with real logic (not just stubs), at least one test file, and a README. Not a full production implementation, but enough to be usable and testable.

| Package                   | Purpose                     | Key Exports                                                                            |
| ------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `@ghita/a11y`             | Accessibility utilities     | `AccessibilityChecker`, `AriaValidator`, `ColorContrastAnalyzer`, `ScreenReaderHelper` |
| `@ghita/i18n`             | Internationalization engine | `I18nManager`, `TranslationLoader`, `LocaleDetector`, `formatMessage()`                |
| `@ghita/migration`        | Data migration framework    | `MigrationRunner`, `MigrationRegistry`, `VersionDetector`, `rollbackMigration()`       |
| `@ghita/mobile-companion` | Mobile helper modules       | `BluetoothPairing`, `NetworkDiscovery`, `PushNotificationBridge`, `DeviceCapabilities` |
| `@ghita/integration`      | Cross-package wiring        | `GhitaCore` (facade), `EventBus`, `ServiceRegistry`, `HealthCheck`                     |
| `@ghita/relay-server`     | WebSocket relay for pairing | `RelayServer`, `RoomManager`, `ConnectionBroker`, `RateLimiter`                        |

**Implementation pattern for each:**

```
packages/<name>/
  src/
    index.ts          # Barrel export
    types.ts          # Type definitions
    <module>.ts       # Core implementation
    __tests__/
      <module>.test.ts
  package.json        # workspace:* deps
  tsconfig.json       # extends tsconfig.base.json
  vitest.config.ts
  README.md
```

**Dependency rules:**

- `a11y`, `i18n`, `migration` → depend only on `@ghita/shared`
- `mobile-companion` → depends on `shared`, `communication`
- `relay-server` → depends on `shared`, `communication`, `security`
- `integration` → depends on `shared` only (facade pattern, consumers pass in concrete deps)

#### 1b. Architecture Decision Records (ADR)

Create ADRs for key decisions already made:

| ADR     | Title                                 | Status   |
| ------- | ------------------------------------- | -------- |
| ADR-001 | Monorepo with pnpm + Turborepo        | Accepted |
| ADR-002 | Tauri v2 for desktop (not Electron)   | Accepted |
| ADR-003 | Adapter pattern over DI container     | Accepted |
| ADR-004 | Zustand for state management          | Accepted |
| ADR-005 | Socket.IO for real-time communication | Accepted |
| ADR-006 | AES-256-GCM for encryption            | Accepted |
| ADR-007 | Vitest as test runner                 | Accepted |
| ADR-008 | Parallel Streams improvement approach | Accepted |

Location: `docs/adr/` (already exists)

#### 1c. Dependency Graph Visualization

Add a script to generate dependency graph:

- Tool: `madge` or `turbo graph`
- Output: Mermaid diagram in docs, auto-generated on CI
- Include in Docusaurus site

#### 1d. Wire Commitlint Hook

> **Note:** This is also referenced in Stream 4b. Implementation should happen once — coordinate with Stream 4.

Add `commit-msg` hook to `.husky/`:

```bash
# .husky/commit-msg
npx --no -- commitlint --edit $1
```

---

### Stream 2: Testing

**Goal:** From 80% → 93%

#### 2a. Increase Coverage to 90%+

- **Coverage target is per-package** (matching current CI behavior which checks each package individually)
- Set coverage threshold from 80% → 85% (incremental), then → 90%
- Focus on uncovered code in:
  - `packages/ai-engine` (routing, caching, enterprise features)
  - `packages/communication` (reconnection, guardrail pipeline)
  - `packages/computer-use` (sandbox validation, operators)
  - `packages/memory` (cross-session search, freshness)
- Add `istanbul` comments for intentional uncovered code (`/* istanbul ignore next */`)

#### 2b. Visual Regression Testing

- Tool: Playwright screenshot comparison
- Location: `tests/e2e/visual/`
- Test cases:
  - Main layout renders correctly
  - Code editor with syntax highlighting
  - Terminal with output
  - Chat panel with messages
  - Settings panel
  - Mobile-responsive layouts
- CI: Upload diff images as artifacts on failure
- Config: `maxDiffPixels: 100`, `threshold: 0.2`

#### 2c. Mutation Testing

- Tool: StrykerJS
- Config: `stryker.config.mjs` at root
- Focus on critical packages: `security`, `ai-engine`, `communication`
- Thresholds: mutation score ≥ 70% (initial), ≥ 80% (target)
- CI: Run on PRs, fail if below threshold
- Exclude: test files, generated code, stubs

#### 2d. Fuzz Testing Expansion

- Expand `tests/fuzz/input-sanitization.test.ts` to cover:
  - All InputSanitizer rules with random inputs
  - CORS auditor with malformed configs
  - JSON parsing with malformed payloads
  - Token counter with edge cases
- Tool: `fast-check` property-based testing library
- Location: `tests/fuzz/` and per-package `__tests__/fuzz/`

#### 2e. Integration Tests for Critical Paths

- Location: `tests/integration/`
- Test cases:
  - Full agent lifecycle: create → configure → run → collect results
  - Skill execution: load → validate → execute → return result
  - Memory operations: store → search → retrieve → delete
  - Communication: pair → connect → send message → disconnect
  - AI Engine: route → fallback → retry → succeed
- Mock external APIs (OpenAI, Anthropic) with MSW

---

### Stream 3: Security

**Goal:** From 90% → 97%

#### 3a. Bug Bounty Program

- Platform: GitHub Security Advisories (already configured)
- Scope: All packages, apps, CI/CD workflows
- Severity levels: Critical (72h SLA), High (7d), Medium (30d), Low (90d)
- Rewards: Recognition in SECURITY.md acknowledgements
- Process: Private disclosure → Triage → Patch → Coordinated disclosure

#### 3b. Penetration Testing Checklist

Create `docs/security/penetration-testing-checklist.md`:

| Category         | Tests                                                       |
| ---------------- | ----------------------------------------------------------- |
| Input Validation | XSS, SQL injection, command injection, path traversal, SSRF |
| Authentication   | Pairing code brute force, session fixation, token leakage   |
| Authorization    | Privilege escalation, IDOR, skill permission bypass         |
| Communication    | MitM on Socket.IO, replay attacks, message tampering        |
| Computer Use     | Sandbox escape, unauthorized input, screen capture leakage  |
| API Keys         | Memory dumps, log exposure, env variable leakage            |
| Dependencies     | Known CVEs, license compliance, typosquatting               |

#### 3c. CSP Hardening

Current issue: `style-src 'unsafe-inline'` in development.

Plan:

1. Generate nonce per request in Tauri backend
2. Replace `'unsafe-inline'` with nonce-based CSP
3. Use `crypto.randomBytes(16)` for nonce generation
4. Pass nonce to React via Tauri event system
5. Apply nonce to all `<style>` tags via `data-nonce` attribute

**Before:**

```
style-src 'self' 'unsafe-inline';
```

**After:**

```
style-src 'self' 'nonce-{random}';
```

#### 3d. Automated Security Audit in CI

Enhance existing `security-scan.yml`:

- Add `semgrep` for custom security rules
- Add `trivy` for container scanning
- Add `gitleaks` for secret detection in git history
- Add `npm audit` with `--audit-level=moderate` (lower from high)
- Fail CI on any new critical/high findings

#### 3e. CORS Hardening

- Remove LAN address allowance from production builds (keep for dev only)
- Add CORS preflight caching (`Access-Control-Max-Age`)
- Implement origin validation callback instead of static list
- Add rate limiting on CORS-allowed origins

---

### Stream 4: Code Quality

**Goal:** From 85% → 95%

#### 4a. ESLint Complexity Rules

Add to `eslint.config.js`:

```javascript
rules: {
  // Existing rules...
  'complexity': ['error', { max: 15 }],
  'max-depth': ['error', { max: 4 }],
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', { max: 5 }],
  'max-nested-callbacks': ['error', { max: 3 }],
}
```

**Incremental rollout:**

1. Start with `warn` level
2. Fix existing violations
3. Promote to `error` level

#### 4b. Wire Commitlint Hook

> **Note:** This task is shared with Stream 1d. Implementation happens once — see Stream 1d for the hook script.

Also add commitlint to `lint-staged.config.json` for pre-commit validation.

#### 4c. SonarQube Integration

- Option A: SonarCloud (free for open source)
- Option B: Self-hosted SonarQube in Docker

**Configuration:**

- `sonar-project.properties` at root
- Quality gate: coverage ≥ 80%, duplications ≤ 3%, no new critical issues
- CI: Run on PRs, post comments with analysis results
- Focus on: code smells, bugs, vulnerabilities, cognitive complexity

#### 4d. Stricter Linting Rules

Add additional ESLint rules:

- `no-implicit-coercion: error`
- `no-return-assign: error`
- `no-sequences: error`
- `no-throw-literal: error`
- `no-unmodified-loop-condition: error`
- `no-useless-call: error`
- `no-useless-concat: error`
- `no-useless-return: error`
- `prefer-template: error`
- `no-var: error`

---

### Stream 5: Multiplatform

**Goal:** From 80% → 93%

#### 5a. iOS Build Pipeline Polish

- Fix `build-ios.yml` workflow for reliable builds
- Add iOS-specific tests (CocoaPods dependency resolution)
- Add iOS simulator E2E tests in CI
- Update `Platform` type to include `'ios'`
- Add iOS-specific error handling in `packages/communication`
- Test Bluetooth pairing on iOS

#### 5b. Linux Packaging

Add Snap and Flatpak configurations:

**Snap:**

- `snap/snapcraft.yaml`
- Auto-publish to Snap Store on tag push
- Channels: stable, beta, edge

**Flatpak:**

- `flatpak/com.ghita.CodingAgent.yml`
- Publish to Flathub

#### 5c. macOS Code Signing

- Add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` secrets
- Add notarization step in `build-desktop.yml`
- Use `tauri-plugin-updater` with signed updates
- Add Developer ID Application certificate

#### 5d. Cross-Platform Testing Matrix

Expand CI matrix:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node: [20, 22]
    include:
      - os: ubuntu-latest
        rust-target: x86_64-unknown-linux-gnu
      - os: windows-latest
        rust-target: x86_64-pc-windows-msvc
      - os: macos-latest
        rust-target: aarch64-apple-darwin
```

---

### Stream 6: Dependencies

**Goal:** From 90% → 97%

#### 6a. Renovate Bot

Replace Dependabot with Renovate for npm ecosystem (keep Dependabot for GitHub Actions and Cargo):

**`renovate.json`:**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchPackagePatterns": ["*"],
      "groupName": "dev-dependencies",
      "matchDepTypes": ["devDependencies"],
      "schedule": ["every weekend"]
    },
    {
      "matchPackagePatterns": ["*"],
      "groupName": "production-dependencies",
      "matchDepTypes": ["dependencies"],
      "schedule": ["every weekday"]
    }
  ],
  "automerge": true,
  "automergeType": "pr",
  "platformAutomerge": true
}
```

**Advantages over Dependabot:**

- Grouping related updates
- Custom schedules per dependency type
- Auto-merge with CI passing
- Better monorepo support

#### 6b. Lockfile Automation

- Add `pnpm-lock.yaml` refresh CI job (weekly)
- Add `--frozen-lockfile` check on PRs
- Auto-commit lockfile updates via Renovate

#### 6c. License Scanning

- Tool: `license-checker` or `licensee`
- CI: Scan all dependencies, fail on incompatible licenses
- Allowed: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD
- Denied: GPL-3.0, AGPL-3.0, SSPL
- Generate `licenses.json` report as CI artifact

#### 6d. Auto-Update Channel

Implement Tauri updater with channels:

| Channel   | Purpose             | Trigger                 |
| --------- | ------------------- | ----------------------- |
| `stable`  | Production releases | Manual tag              |
| `beta`    | Pre-release testing | Auto on `v*-beta*` tags |
| `nightly` | Latest builds       | Auto on `main` push     |

- Use GitHub Releases for hosting update artifacts
- Sign updates with Tauri updater key
- Add channel selector in app settings

---

### Stream 7: Community & Open Source

**Goal:** From 80% → 93%

#### 7a. Example Projects

Create `examples/` directory with:

| Example                        | Description                       |
| ------------------------------ | --------------------------------- |
| `examples/custom-skill/`       | Complete custom skill with tests  |
| `examples/agent-workflow/`     | Multi-agent collaboration example |
| `examples/remote-control/`     | Android remote control setup      |
| `examples/browser-automation/` | Playwright automation example     |
| `examples/computer-use/`       | Desktop automation example        |
| `examples/mcp-server/`         | Custom MCP server integration     |

Each example has: `README.md`, `package.json`, working code, tests.

#### 7b. Starter Templates

Create `templates/` directory:

| Template                | Description                            |
| ----------------------- | -------------------------------------- |
| `templates/skill/`      | Skill scaffold with `create-skill` CLI |
| `templates/agent/`      | Agent configuration template           |
| `templates/mcp-server/` | MCP server template                    |

Add `pnpm create ghita-skill` CLI command.

#### 7c. Contributor Recognition

- Add `.all-contributorsrc` config
- Add contributors table to README.md
- Auto-update via `all-contributors` bot
- Categories: code, docs, design, testing, bug, ideas, review

#### 7d. Onboarding Guide

Create `docs/onboarding/`:

| Document                   | Audience                                        |
| -------------------------- | ----------------------------------------------- |
| `getting-started.md`       | New users                                       |
| `development-setup.md`     | New contributors                                |
| `architecture-overview.md` | Contributors wanting to understand the codebase |
| `first-contribution.md`    | First-time contributors                         |
| `skill-development.md`     | Skill developers                                |
| `plugin-development.md`    | Plugin developers                               |

#### 7e. Changelog Automation

- Tool: `release-please` (Google)
- Config: `release-please-config.json`
- Auto-generate CHANGELOG.md from conventional commits
- Auto-create release PRs with version bumps
- Integrate with existing `changelog.yml` workflow

---

## 3. Cross-Stream Dependencies

```
Stream 1 (Architecture) ──┐
                          ├──→ Stream 2 (Testing) ──→ Stream 3 (Security)
Stream 4 (Code Quality) ──┘         │
                                    ├──→ Stream 5 (Multiplatform)
                                    │
Stream 6 (Dependencies) ────────────┘
                                    │
Stream 7 (Community) ──────────────┘ (can run independently)
```

**Key dependencies:**

- Stub packages (Stream 1) need tests (Stream 2)
- Security hardening (Stream 3) needs code quality (Stream 4) for reliable audits
- Multiplatform (Stream 5) needs dependency management (Stream 6) for platform-specific deps
- Community (Stream 7) is mostly independent

---

## 4. Success Criteria

| Area          | Metric                        | Current | Target |
| ------------- | ----------------------------- | ------- | ------ |
| Architecture  | Stub packages implemented     | 0/6     | 6/6    |
| Architecture  | ADRs documented               | 0       | 8      |
| Testing       | Line coverage                 | 80%     | 90%    |
| Testing       | Visual regression tests       | 0       | 10+    |
| Testing       | Mutation score                | N/A     | 70%+   |
| Security      | CSP `'unsafe-inline'` removed | No      | Yes    |
| Security      | Pen test checklist            | No      | Yes    |
| Security      | Bug bounty active             | No      | Yes    |
| Code Quality  | Complexity rules              | No      | Yes    |
| Code Quality  | Commitlint hook               | No      | Yes    |
| Multiplatform | iOS build passing             | Unknown | Yes    |
| Multiplatform | Linux Snap package            | No      | Yes    |
| Dependencies  | Renovate configured           | No      | Yes    |
| Dependencies  | License scanning in CI        | No      | Yes    |
| Community     | Example projects              | 0       | 6      |
| Community     | Contributors table            | No      | Yes    |

---

## 5. Risks & Mitigations

| Risk                                 | Impact | Mitigation                                                |
| ------------------------------------ | ------ | --------------------------------------------------------- |
| Stub packages add maintenance burden | Medium | Keep minimal, clear interfaces                            |
| Mutation testing is slow             | Low    | Run only on critical packages, use incremental mode       |
| CSP nonce adds complexity            | Medium | Use Tauri's built-in CSP injection                        |
| Renovate + Dependabot conflict       | Low    | Use Renovate for npm only, keep Dependabot for GH Actions |
| iOS build requires macOS runner      | Low    | Already configured in CI                                  |
| SonarQube setup complexity           | Medium | Use SonarCloud (free for OSS)                             |

---

## 6. Open Questions

1. Should stub packages have full implementations or just interfaces + minimal stubs?
2. Should SonarQube be self-hosted or SonarCloud?
3. Should Renovate fully replace Dependabot or coexist?
4. What level of mutation testing coverage is acceptable for initial rollout?

---

_Spec written: 2026-06-24. Pending user review._
