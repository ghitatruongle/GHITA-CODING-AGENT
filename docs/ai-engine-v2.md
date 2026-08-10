# AI Engine & Chat v1.1.0 — Track 4: tool repair, approvals, adaptive routing, pricing, caches, chat UI

Tài liệu cho các module v1.1.0 Track 4 (mục tiêu 28–34).

## 1. Tool-call repair (`packages/ai-engine/src/tool-calling/repair.ts`) — P49

- `parseToolArguments(raw)` — nhận object hoặc JSON string; tự sửa JSON lỗi phổ biến
  (markdown fences, trailing commas, unquoted keys).
- `repairToolCallArguments(raw, schema?)` — coerce type theo schema (string/number/
  boolean/array), điền `default` cho field required thiếu, báo issue cho field thiếu
  không có default.
- `isRetryableRepair(result)` — xác định call còn dùng được để retry an toàn.

## 2. Tool approval 2 pha (`packages/ai-engine/src/tool-calling/approvals.ts`) — P48

- `ToolApprovalManager.request(name, args, role)` — phase 1: thu thập (state `pending`);
  phase 2: `approve(id)` / `deny(id)` hoặc `decideAll('approved'|'denied')` (Accept All /
  Reject All).
- `sessionDefaults` per role: `ask` (mặc định) | `approve-all` | `deny-all`.
- `awaitDecision(id, timeout)` — chờ quyết định; hết thời gian → tự deny.
- `canExecute(req)` — deny-default: chỉ chạy khi state `approved`.

## 3. Adaptive bandit router (`packages/ai-engine/src/routing/adaptive-router.ts`) — P50

- `AdaptiveBanditRouter` — Thompson sampling (Beta posterior) theo arm
  (`provider:model`); chọn arm cao điểm nhất với xác suất thăm dò ε (mặc định 0.1).
- `observe(armId, 'success'|'error'|'timeout', latencyMs)` — cập nhật posterior +
  latency rolling.
- `ranking()` — expected reward giảm dần (dùng để báo cáo/so sánh cost-reward).
- `betaSample(alpha, beta)` — Beta qua Gamma (Marsaglia-Tsang), test deterministic.

## 4. Model roles routing (`packages/ai-engine/src/routing/model-roles.ts`) — P51

- `MODEL_ROLES`: smol / fast / plan / vision / advisor / orchestrator / critic /
  editor / browser / creative.
- `ModelRoleRouter.resolve(role)` — chọn model khả dụng đầu tiên trong chuỗi ưu tiên
  (`DEFAULT_ROLE_CHAINS`); `fallbackChain(role)` trả chuỗi đã lọc theo availability;
  `qualifyModelId(provider, model)`.
- Không có availability filter → dùng model đầu chuỗi.

## 5. Model pricing DB (`packages/ai-engine/src/cost/model-prices.ts`) — P52

- `ModelPricingDB` — bảng giá 8 model mặc định; `lookup(provider, model)` fuzzy
  (exact → provider+model → substring); `sync(fetcher)` thay toàn bộ từ upstream;
  `estimateCost(price, in, out)`.

## 6. Distributed cache (`packages/ai-engine/src/cache/distributed.ts`) — P53

- `DistributedCache` — 2 lớp (primary + secondary); miss primary → đọc secondary và
  promote ngược; write fan-out cả hai.
- `ObjectStoreCache` — snapshot/disk/S3 qua `ObjectStore` interface (TTL theo giây).
- `DualModeCache` — chạy song song exact cache + semantic cache, TTL chung, read
  exact trước rồi semantic.
- Toàn bộ backend injectable → test chạy offline.

## 7. Chat stream parts UI (`packages/shared/src/react-ui.ts`) — P44/P45

- `ChatStreamEvent` / `ChatMessagePart`: text | tool-call | file | source.
- `parseChatStreamEvent(line)` — JSON-lines parser.
- `appendEventToMessage(msg, event)` — pure append; `messageText(msg)`.
- `consumeChatStream(stream, handlers)` — framework-agnostic consumer.
- `useAIChat({ stream, initialMessages, onFinish, onPart })` — hook thật (thay stub):
  messages dạng parts, isLoading/error, handleSubmit/reload/stop, abort-safe.
- Sidecar emit: các event `chat_part` (text-delta/tool-call/file/source/done) được
  định nghĩa đúng kiểu `ChatStreamEvent` — desktop render per-part.

## 8. Workflow DAG visualizer (`packages/shared/src/react-ui.ts`) — P47

- `layoutDag(steps, edges)` — longest-path layering + xếp theo lớp (pure, testable).
- `WorkflowVisualizer` — component React thật: card theo node với màu trạng thái
  (pending/running/completed/failed) + `data-current` cho step đang chạy.

## Exports

```ts
// @ghita/ai-engine
import {
  ToolApprovalManager,
  repairToolCallArguments,
  AdaptiveBanditRouter,
  ModelRoleRouter,
  ModelPricingDB,
  DistributedCache,
  DualModeCache,
} from '@ghita/ai-engine';
// @ghita/shared
import { useAIChat, WorkflowVisualizer, consumeChatStream, layoutDag } from '@ghita/shared';
```

## Verify

```bash
pnpm --filter @ghita/ai-engine typecheck && pnpm --filter @ghita/ai-engine test   # 794 tests
pnpm --filter @ghita/shared typecheck && pnpm --filter @ghita/shared test        # 229 tests
pnpm --filter @ghita/ai-engine --filter @ghita/shared build
```
