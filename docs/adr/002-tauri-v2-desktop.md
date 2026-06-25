# ADR-002: Tauri v2 for Desktop (not Electron)

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

The desktop app needs a cross-platform framework that can access native APIs (screenshots, keyboard/mouse input, terminal PTY) while keeping bundle size small and memory usage low.

## Decision

Use Tauri v2 with Rust backend + React frontend:
- Rust for native operations (computer-use, terminal, proxy)
- React + TypeScript for UI
- Tauri IPC for frontend ↔ backend communication
- Node.js sidecar for AI engine and package execution

## Consequences

**Positive:**
- ~10MB bundle size vs ~150MB for Electron
- Lower memory usage
- Rust safety for native operations
- Built-in CSP and security model

**Negative:**
- Requires Rust knowledge
- Tauri ecosystem is smaller than Electron
- Sidecar adds complexity for Node.js integration
