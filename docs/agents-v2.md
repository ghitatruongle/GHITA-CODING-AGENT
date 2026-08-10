# Agents v1.1.0 — Track 5: HITL, lifecycle, worktrees, review, declarative agents

Tài liệu cho `packages/agents/src/track5` (mục tiêu 35–41).

## 1. Human-in-the-loop first-class (`hitl.ts`) — P35

- `RequestHumanInputManager.request({question, urgency, options, format, webhookUrl})` —
  dừng loop chờ người trả lời; `answer(id)`/`cancel(id)`; `awaitAnswer(id)`; tự timeout.
- `buildRequestHumanInputTool(manager)` — tool `request_human_input` chuẩn schema cho
  tầng tool-calling (12-factor-agents pattern).

## 2. Lifecycle API (`lifecycle.ts`) — P36

- `AgentLifecycleManager.launch/pause/resume/cancel/get/enumerate` — trạng thái
  idle→running→paused→completed/error/cancelled; executor injectable; hook
  `onStateChange`; `count()` theo trạng thái.

## 3. Worktree isolation (`worktree.ts`) — P56

- `WorktreeManager.create(repoDir, name, {base})` — `git worktree add -b ghita-agent/<name>`
  dưới `.ghita/worktrees/`; `merge(name)`; `remove(name, {force})`; git runner injectable
  (test không cần repo thật).

## 4. Fanout swarm (`fanout.ts`) — P57

- `runFanout(prompt, deps, {count})` — 1 prompt → N worktrees song song → so sánh
  (heuristic: output dài nhất) → merge best, gỡ các worktree thừa.

## 5. Git-aware checkpoint (`autocommit.ts`) — P59

- `GitAutoCommitPolicy({mode: ask|always|never})` — quyết định commit tại checkpoint;
  `apply(git, label)` bỏ qua khi working tree sạch; `createGitOps(repoDir, git)` helper.

## 6. PR review pipeline (`review.ts`) — P60

- `PRReviewPipeline(reviewers, validator, gate)` — gate check → N reviewer song song →
  **validation vòng 2** (chặn false-positive) → report (criticalCount/blocked);
  `renderReviewReport()` markdown.

## 7. Declarative subagents (`declarative.ts`) — P61

- `parseAgentDefinition(md, fallback)` — frontmatter: description / allowed-tools /
  model / concurrency; `loadAgentDefinitions(dir)` (agents/\*.md); `dispatchAgentTasks`
  (concurrency giới hạn); `isToolAllowed` (deny ngoài allowlist).

## 8. Flow persistence + HITL trong flow (`flow-persist.ts`) — P62

- `MemoryFlowStateStore` / `SqliteFlowStateStore` (better-sqlite3) — trạng thái per-node;
- `runFlowNodeWithResume(store, nodeId, execute)` — resume idempotent (node completed
  không chạy lại);
- `withHumanFeedback(manager, nodeId, question, options)` — block/await pattern trong flow.

## 9. Error compaction (`error-compact.ts`) — P63

- `classifyError(err)` — taxonomy: timeout / rate-limit / parse / network / permission /
  tool-error / model-error / unknown + remedy; `compactErrorForContext(err, attempt)`;
  `backoffForAttempt(attempt)` (exponential, cap 30s).

## 10. Remote job status (`remote.ts`) — P64

- `RemoteJobStatusProvider(lifecycle)` — `listJobs()` cho mobile dashboard;
  `applyAction({jobId, action: resume|cancel|approve})`; `recentActions()`.

## Exports

```ts
import {
  RequestHumanInputManager,
  buildRequestHumanInputTool,
  AgentLifecycleManager,
  WorktreeManager,
  runFanout,
  GitAutoCommitPolicy,
  PRReviewPipeline,
  parseAgentDefinition,
  SqliteFlowStateStore,
  runFlowNodeWithResume,
  withHumanFeedback,
  classifyError,
  compactErrorForContext,
  RemoteJobStatusProvider,
} from '@ghita/agents';
```

## Verify

```bash
pnpm --filter @ghita/agents typecheck   # 0 lỗi
pnpm --filter @ghita/agents test        # 130 tests pass (gồm ~22 test Track 5 mới)
pnpm --filter @ghita/agents build
```
