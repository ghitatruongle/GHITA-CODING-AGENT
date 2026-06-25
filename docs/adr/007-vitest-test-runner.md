# ADR-007: Vitest as Test Runner

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

The project needs a test runner that supports ESM, TypeScript, and works well in a monorepo. Options: Jest, Vitest, Mocha.

## Decision

Use Vitest with V8 coverage:
- Native ESM and TypeScript support
- Compatible with Jest API (easy migration)
- Fast due to Vite-based transformation
- Built-in coverage with v8 provider

## Consequences

**Positive:**
- No transpilation step for tests
- Fast test execution
- Jest-compatible API
- Good monorepo support

**Negative:**
- Smaller ecosystem than Jest
- Some Jest plugins may not work
- Coverage thresholds per-package require config
