# GHITA CODING AGENT v0.1.0 Upgrade Plan

## Overview

Nâng cấp từ v0.0.5 → v0.1.0 với 5 nhóm cải tiến: Debug bugs, thêm chức năng, ổn định Windows, UI/UX, AI/MCP/skills.

---

## Phase 1: Critical Bugs Fix (Week 1-2)

### Task 1.1: Fix Critical AI/MCP Bugs

**Files:**

- `packages/communication/src/server.ts:772` — fix field name `{ id, enabled }` → `{ skillId, enabled }`
- `packages/ai-engine/src/utils/configLoader.ts` — add `mcpServers` to `LocalConfig`
- `packages/agents/src/runtime.ts:72` — implement real `DEFAULT_RUNTIME` with LLM + skills

### Task 1.2: Fix Windows Critical Issues

**Files:**

- `apps/desktop/src-tauri/src/main.rs` — add panic hook + crash logging
- `apps/desktop/src-tauri/src/lib.rs:63,630,749` — replace `.expect()` with `Result` handling
- `apps/desktop/src-tauri/src/lib.rs:269-271` — implement Job Objects for sidecar cleanup
- `apps/desktop/src-tauri/src/terminal.rs:96-115` — add timeout to `child.wait()`

### Task 1.3: Fix UI Theme Bug

**Files:**

- `apps/desktop/src/components/chat/*` — remove hard-coded `rgba(15,23,42,...)`, use CSS variables

---

## Phase 2: Core Improvements (Week 3-4)

### Task 2.1: MCP Configuration

**Files:**

- Create `apps/desktop/mcp.json` — persistent MCP server config
- `packages/ai-engine/src/utils/configLoader.ts` — load MCP config from file
- `apps/desktop/src-tauri/src/lib.rs` — pass MCP config to sidecar on startup

### Task 2.2: Smart Router Activation

**Files:**

- `packages/ai-engine/src/orchestrator.ts:275` — use `smartRouter` in `resolveProvider()`
- `packages/ai-engine/src/routing/smart-router.ts` — implement routing logic

### Task 2.3: Context Compaction

**Files:**

- `packages/ai-engine/src/context/manager.ts:90` — implement `compactWithSummary()` with LLM summarization

### Task 2.4: Windows Process Management

**Files:**

- `apps/desktop/src-tauri/Cargo.toml` — add `windows` crate dependency
- `apps/desktop/src-tauri/src/lib.rs` — create Job Object for sidecar + shell processes
- `apps/desktop/src-tauri/src/terminal.rs` — cleanup `generations` map on session destroy

---

## Phase 3: Feature Completion (Week 5-6)

### Task 3.1: Mock Views → Real Implementations

**Files:**

- `apps/desktop/src/views/MarketplaceView.tsx` — real plugin discovery from registry
- `apps/desktop/src/views/QuotaView.tsx` — real usage tracking from provider APIs
- `apps/desktop/src/views/MonitoringView.tsx` — real telemetry collection
- `apps/desktop/src/views/CodeGraphView.tsx` — auto-detect workspace from terminalCwd

### Task 3.2: Agent Persistence

**Files:**

- `packages/agents/src/` — add file-based persistence for agents/tasks/groups
- `apps/desktop/src-tauri/src/lib.rs` — pass data directory to sidecar

### Task 3.3: Skill Approval Gate

**Files:**

- `packages/skills/src/types.ts` — add `dangerous` flag to `SkillDefinition`
- `packages/skills/src/index.ts` — check approval before executing dangerous skills
- `apps/desktop/src/components/chat/ChatToolApproval.tsx` — UI for skill approval

### Task 3.4: Terminal Session Persistence

**Files:**

- `packages/gui/src/manager.ts` — save/restore terminal tabs, shell, cwd
- `apps/desktop/src/components/Terminal.tsx` — persist session state

---

## Phase 4: UI Polish & Accessibility (Week 7-8)

### Task 4.1: Theme Consistency

**Files:**

- `apps/desktop/src/components/TabBar.tsx` — replace emoji with Lucide icons
- `apps/desktop/src/components/ui/Input.tsx` — fix focus-ring consistency
- `apps/desktop/src/views/SettingsView.tsx` — fix malformed "i️" character

### Task 4.2: UX Improvements

**Files:**

- `apps/desktop/src/components/chat/ChatInput.tsx` — visible keyboard shortcut for file attach
- `apps/desktop/src/views/SettingsView.tsx` — validation for MCP/hooks config forms
- `apps/desktop/src/components/chat/useChatModelSelector.ts` — refresh on-demand

### Task 4.3: Accessibility

**Files:**

- All interactive components — add ARIA labels
- All views — keyboard navigation support
- `apps/desktop/src/layouts/MainLayout.tsx` — screen reader support for status bar

---

## Phase 5: MCP Transport & Windows Fixes (Week 5-6, parallel)

### Task 5.1: MCP Transport Improvements

**Files:**

- `packages/ai-engine/src/mcp/transport.ts:36` — add `windowsHide`, quote args with spaces/backslashes
- `packages/ai-engine/src/mcp/transport.ts:36` — support string JSON-RPC IDs
- `packages/ai-engine/src/mcp/connection-manager.ts:229` — implement JSON-RPC `ping` health check
- `packages/ai-engine/src/mcp/connection-manager.ts:366` — consume `OFFICIAL_MCP_REGISTRY` in UI

### Task 5.2: Windows Path & Command Handling

**Files:**

- `packages/skills/src/helpers.ts:50` — fix `escapeShellArg()` Windows branch
- `packages/ai-engine/src/tools/custom-tools.ts:278` — handle `.bat`/`.cmd` with `cmd /c`
- `packages/ai-engine/src/tools/workspace-tools.ts:425` — replace `SIGTERM`/`SIGKILL` with Windows-compatible signals
- `packages/ai-engine/src/mcp/transport.ts:36` — quote arguments for paths with spaces

### Task 5.3: Windows Resource Management

**Files:**

- `apps/desktop/src-tauri/capabilities/default.json:50-56` — lock down `fs:scope`
- `apps/desktop/src-tauri/src/lib.rs:427-497` — atomic file writes (write-tmp + rename)
- `apps/desktop/src-tauri/src/lib.rs:47-62` — fix TOCTOU in `find_free_port()`
- `apps/desktop/src-tauri/src/computer_use.rs:89-164` — multi-monitor capture support

---

## Testing Strategy

- Unit tests cho mỗi bug fix (TDD)
- Integration tests cho MCP transport changes
- Windows-specific tests cho process management
- Manual testing trên Windows 10/11 cho UI changes
- E2E tests cho critical user flows

## Deployment

- Incremental releases: v0.1.0-alpha → v0.1.0-beta → v0.1.0
- Feature flags cho experimental features
- Rollback plan cho each phase

## Tech Stack Additions

- `windows` crate (Rust) cho Job Objects
- `tracing` + `tracing-subscriber` (Rust) cho logging
- `fs2` (Rust) cho file locking
- `pino` hoặc `winston` (Node) cho structured logging
