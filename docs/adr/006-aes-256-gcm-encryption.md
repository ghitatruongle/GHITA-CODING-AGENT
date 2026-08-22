# ADR-006: AES-256-GCM for Encryption

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

API keys and sensitive data need encryption at rest. Options: AES-256-CBC, AES-256-GCM, ChaCha20-Poly1305.

## Decision

Use AES-256-GCM via Node.js `crypto` module:

- Authenticated encryption (integrity + confidentiality)
- Random 12-byte IV per encryption
- Auth tag verification prevents tampering
- Key derived via SHA-256 from user-provided secret

## Consequences

**Positive:**

- Authenticated encryption (no padding oracle attacks)
- Standard, well-audited algorithm
- Built into Node.js (no external dependency)

**Negative:**

- Key management is still responsibility of the application
- GCM nonce reuse is catastrophic (mitigated by random IV)
