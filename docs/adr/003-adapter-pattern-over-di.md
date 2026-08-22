# ADR-003: Adapter Pattern over DI Container

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

Several packages need pluggable implementations (ComputerUse can run via Tauri native or Node.js, BrowserControl can use Playwright or CloakBrowser). We need a way to swap implementations without a heavy DI framework.

## Decision

Use the Adapter pattern with constructor injection:

- Define adapter interfaces (e.g., `ComputerUseAdapter`, `BrowserControlAdapter`)
- Controllers accept adapters via constructor with defaults
- No formal DI container (no Inversify, tsyringe, etc.)

## Consequences

**Positive:**

- Simple, no framework dependency
- Easy to understand and test
- Defaults work out of the box

**Negative:**

- Manual wiring in composition root
- No automatic lifetime management
- Adapter interfaces must be kept stable
