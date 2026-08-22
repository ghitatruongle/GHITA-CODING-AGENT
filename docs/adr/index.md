# ADR-0001: Use Tauri 2.x for Desktop Application

**Status:** Accepted
**Date:** 2026-05-19
**Context:** Desktop app architecture

## Decision

Use Tauri 2.x with React (TypeScript) as the desktop application framework, replacing Electron.

## Rationale

- **Binary size**: ~10MB vs ~150MB for Electron
- **Memory footprint**: ~50MB idle vs ~200MB for Electron
- **Security**: WebView2 (Windows) / WebKit (Linux/macOS) with native Rust backend
- **Sidecar model**: Node.js sidecar server for AI operations, separated from the webview
- **Updater**: Built-in auto-updater with signature verification (minisign)

## Consequences

- Requires WebView2 installation on Windows (handled silently)
- Less control over Chromium version compared to Electron
- Sidecar adds complexity for deployment

## Alternatives Considered

- Electron (rejected: too heavy)
- Neutralinojs (rejected: smaller ecosystem)
- Native Rust + egui (rejected: slower UI development)

---

# ADR-0002: Use Monorepo with Turborepo + pnpm

**Status:** Accepted
**Date:** 2026-05-19
**Context:** Project structure

## Decision

Use a pnpm workspace monorepo with Turborepo for task orchestration.

## Rationale

- **Dependency deduplication**: pnpm hard links reduce disk usage
- **Task caching**: Turborepo caches build outputs across branches
- **Clear boundaries**: 22 packages with explicit interfaces
- **Parallel execution**: Independent packages build in parallel

## Consequences

- More complex tooling setup
- Requires `pnpm --filter` for package-specific commands
- CI needs to handle workspace filtering

## Alternatives Considered

- Separate repositories (rejected: dependency management nightmare)
- Lerna + npm workspaces (rejected: pnpm is faster, Turborepo > Lerna)
- Yarn workspaces (rejected: pnpm strict peer deps catch issues earlier)

---

# ADR-0003: Multi-Provider AI Engine with Fallback Chains

**Status:** Accepted
**Date:** 2026-05-21
**Context:** AI orchestration

## Decision

Implement a custom AI engine with multi-provider routing, automatic fallback chains, and cost-aware model selection.

## Rationale

- **Reliability**: If OpenAI goes down, fall back to Anthropic, then Google, then Ollama
- **Cost control**: Track spend per session, enforce budgets
- **Flexibility**: 13+ providers supported through unified interface
- **No vendor lock-in**: Easy to add/remove providers without client changes

## Consequences

- Complexity in provider configuration and cost tracking
- Fallback chains add latency on provider failure
- Circuit breaker health tracking requires state management

## Alternatives Considered

- LiteLLM proxy (rejected: adds deployment complexity)
- Vercel AI SDK only (rejected: limited fallback capabilities)
- Direct API calls per provider (rejected: no orchestration)

---

# ADR-0004: Sentry for Error Tracking (Opt-In Telemetry)

**Status:** Accepted
**Date:** 2026-06-18
**Context:** Monitoring and error tracking

## Decision

Use Sentry (self-hosted or cloud) for error tracking with strict opt-in telemetry.

## Rationale

- **Industry standard**: Sentry is the most widely adopted error tracking solution
- **Performance monitoring**: Built-in transaction and span tracking
- **Source maps**: Automatic deobfuscation for minified code
- **Self-hosted option**: Can run Sentry on-premises for data sovereignty

## Consequences

- Requires DSN configuration for production
- Sample rate must be tuned to balance signal vs cost
- Users must explicitly opt-in (GDPR/CCPA compliance)

## Alternatives Considered

- LogRocket (rejected: session replay, not error-focused)
- Rollbar (rejected: limited performance features)
- Custom in-house solution (rejected: reinventing the wheel)

---

# ADR-0005: Socket.IO for Desktop ↔ Mobile Communication

**Status:** Accepted
**Date:** 2026-05-19
**Context:** Inter-device communication

## Decision

Use Socket.IO with PIN-based pairing for real-time communication between desktop and mobile apps.

## Rationale

- **Real-time**: WebSocket transport with HTTP long-polling fallback
- **Room-based**: Easy device grouping and broadcast
- **Auto-reconnect**: Built-in reconnection logic
- **Cross-platform**: Works on Tauri (Node.js sidecar) and React Native
- **Multi-channel plugin**: WebSocket primary, mDNS discovery, Bluetooth fallback

## Consequences

- Requires same-network or cloud relay for connectivity
- PIN-based pairing adds UX friction (but improves security)
- Socket.IO adds ~20KB to bundle size

## Alternatives Considered

- WebRTC (rejected: complex signaling, overkill for text commands)
- gRPC (rejected: no browser support, harder to debug)
- REST polling (rejected: high latency, wasteful)

---

# ADR-0006: Skill System with AST-Lock Protection

**Status:** Accepted
**Date:** 2026-05-26
**Context:** AI skill registry

## Decision

Implement a skill registry with AST-Lock symbol protection to prevent accidental refactoring of critical code.

## Rationale

- **Safety**: Critical symbols (`SecurityGate`, `calculateInternal`) are protected from modification
- **Auto-healing**: SCTI trajectory detection catches and reverts unauthorized changes
- **Extensibility**: 20+ built-in skills + marketplace for third-party
- **Runtime adapters**: Skills work across Tauri, Node.js, and test environments

## Consequences

- AST parsing adds build overhead
- Locked symbols require workflow to unlock for intentional changes
- Skill security hash pinning requires user awareness

## Alternatives Considered

- No protection (rejected: accidental refactors in large codebase)
- Git pre-commit hooks only (rejected: doesn't catch in-editor changes)
- TypeScript readonly types (rejected: doesn't prevent code modification)

---

# ADR-0007: React Native for Mobile Companion (minSdk=28)

**Status:** Accepted
**Date:** 2026-05-19
**Context:** Mobile app architecture

## Decision

Use React Native with minSdk=28 (Android 9 Pie) for the mobile companion app.

## Rationale

- **Code sharing**: Shared TypeScript types with desktop via `@ghita/shared`
- **Native modules**: Bluetooth, screen capture, and Socket.IO have RN libraries
- **Development speed**: Fast iteration with Metro bundler
- **Type safety**: TypeScript across the entire stack

## Consequences

- Android 9+ only (excludes ~15% of Android users globally)
- Native module updates require Gradle rebuilds
- No iOS support in current scope

## Alternatives Considered

- Flutter (rejected: less TypeScript ecosystem integration)
- Native Kotlin (rejected: no code sharing with desktop)
- Capacitor/Cordova (rejected: limited native module support)

---

# ADR-0008: Playwright-Stealth for Browser Automation

**Status:** Accepted
**Date:** 2026-06-02
**Context:** Browser control

## Decision

Use Playwright with stealth modifications (CloakBrowser) for AI-driven browser automation.

## Rationale

- **Multi-tab**: Isolated browser contexts per AI session
- **Anti-detection**: Stealth modifications prevent bot detection
- **Accessibility tree**: Rich DOM understanding for AI agents
- **Cross-browser**: Chromium, Firefox, WebKit support

## Consequences

- Stealth modifications require maintenance as detection evolves
- Browser instances consume significant memory (~100MB per tab)
- CloakBrowser may break on sites with strict integrity checks

## Alternatives Considered

- Puppeteer (rejected: Chrome-only, fewer anti-detection features)
- Selenium (rejected: slower, harder to manage contexts)
- Custom browser automation (rejected: reinventing Playwright)

---

# ADR-0009: Rust Native Modules for Performance

**Status:** Accepted
**Date:** 2026-06-07
**Context:** Performance optimization

## Decision

Use Rust native modules for performance-critical operations: screenshot capture, input simulation, and memory vector operations.

## Rationale

- **Performance**: Rust is 10-100x faster than Node.js for image processing
- **Memory safety**: No buffer overflows in security-sensitive code
- **Tauri integration**: Rust is the native language of Tauri
- **Screenshots crate**: `screenshots` crate provides efficient cross-platform capture

## Consequences

- Requires Rust toolchain for builds
- Rust developers needed for native module maintenance
- Cross-compilation complexity for multi-platform releases

## Alternatives Considered

- Node.js native addons via N-API (rejected: harder to maintain)
- WASM modules (rejected: not needed for Tauri, which is already Rust)
- Pure Node.js (rejected: too slow for image processing)

---

# ADR-0010: Coverage Gate at 80% for All Packages

**Status:** Accepted
**Date:** 2026-06-18
**Context:** Quality assurance

## Decision

Enforce a minimum 80% line coverage threshold for all 22 packages in CI.

## Rationale

- **Quality floor**: Prevents code from being merged without adequate tests
- **Consistent standards**: All packages held to the same bar
- **CI automation**: Automatic gate prevents regressions
- **Artifact upload**: Coverage reports preserved for 14 days for review

## Consequences

- May slow down PR merging for packages with low existing coverage
- Some packages (marketplace, relay-server) have naturally harder-to-test code
- 80% line coverage doesn't guarantee meaningful test quality

## Alternatives Considered

- 90% threshold (rejected: too high for early-stage project)
- Branch coverage instead of line (rejected: harder to achieve, less intuitive)
- No coverage gate (rejected: quality degrades over time without enforcement)
