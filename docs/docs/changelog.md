---
id: changelog
title: Changelog
sidebar_label: Changelog
sidebar_position: 5
---

# Changelog

## 0.0.3 (current)

### Sprint 7 — UX & Automation (5 phases)

- **P32** — Error Monitoring (Sentry): grouping, perf tracing, alert rules (`@ghita/monitoring`)
- **P33** — Rate Limiting & Quotas: per-user limits, token tracking, overage billing (`@ghita/quotas`)
- **P34** — Security Audit: XSS/SQLi/command injection detection, CORS audit, key rotation (`@ghita/security`)
- **P35** — Documentation Site: Docusaurus setup với tutorials, API reference, contributing guide

### Sprint 6 — Performance & Reliability (4 phases)

- **P27** — Request Batching: gộp nhiều request cùng provider (`@ghita/ai-engine/batch`)
- **P28** — Load Balancer: round-robin/random/least-loaded giữa các key (`@ghita/ai-engine/loadbalancer`)
- **P29** — WebSocket Multiplexer: gộp channel qua 1 connection
- **P30** — Memory Compression: tier-based migration + summarization (`@ghita/memory/compression`)

### Earlier sprints

- **Sprint 1-2** — Foundation: shared types, agent orchestrator, skill registry
- **Sprint 3-4** — Knowledge layer: RAG, memory, guardrails
- **Sprint 5** — Marketplace & community

## 0.0.2

- Initial desktop app release
- 15+ LLM providers
- Basic memory + skills

## 0.0.1

- Proof of concept
- Single-provider chat
