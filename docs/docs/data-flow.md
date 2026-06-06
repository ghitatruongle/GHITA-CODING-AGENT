---
id: data-flow
title: Data Flow
sidebar_label: Data Flow
sidebar_position: 3
---

# Data Flow

End-to-end flow khi user gửi 1 message đến agent.

## Sequence diagram

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Desktop UI
  participant A as Agents
  participant AI as AI Engine
  participant S as Skills
  participant M as Memory
  participant LLM as LLM Provider

  U->>UI: Nhập message
  UI->>A: sendMessage(text, context)
  A->>M: recall relevant memories
  M-->>A: top-K memories
  A->>AI: chat(messages + memories, options)
  AI->>LLM: HTTP request
  LLM-->>AI: completion
  AI-->>A: ChatResponse
  A->>S: executeSkill(plan)
  S-->>A: skill result
  A->>M: save(memory entry)
  A-->>UI: final response + actions
  UI-->>U: render
```

## Message lifecycle

1. **Parse** — User input được parse thành `ChatMessage[]`
2. **Augment** — Inject memory context, skills, system prompt
3. **Route** — Smart router chọn provider + model phù hợp
4. **Cache** — Check response cache (Phase 26)
5. **Batch** — Nếu cùng provider, gộp request (Phase 27)
6. **Load balance** — Round-robin/random giữa các keys (Phase 28)
7. **Send** — HTTP request tới LLM provider
8. **Stream** — Nhận streaming response (SSE)
9. **Trace** — Performance span được ghi (Phase 32)
10. **Bill** — Usage tracker ghi nhận (Phase 33)
11. **Save** — Memory layer lưu lại (Phase 30)
12. **Audit** — Security audit log (Phase 34)
13. **Render** — UI hiển thị
