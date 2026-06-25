# ADR-004: Zustand for State Management

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

The desktop React app needs global state management for UI state, chat sessions, settings, communication status, and more. Options considered: Redux, Zustand, Jotai, React Context.

## Decision

Use Zustand with persistence middleware:
- Single store (`appStore.ts`) with selectors
- localStorage persistence for settings
- No boilerplate (vs Redux)
- Works with React Suspense

## Consequences

**Positive:**
- Minimal boilerplate
- Built-in persistence
- Good TypeScript support
- Small bundle size

**Negative:**
- Single store can grow large
- No built-in devtools (though available as middleware)
- Less ecosystem than Redux
