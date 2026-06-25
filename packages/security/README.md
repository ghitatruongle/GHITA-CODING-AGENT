# @ghita/security

![Version](https://img.shields.io/badge/version-0.0.4-blue)

Security audit toolkit for GHITA Coding Agent -- input sanitization, XSS prevention, CORS review, API key rotation, and sandbox policy enforcement.

## Key Features

- **Input sanitization** -- strips dangerous payloads from user input and AI responses.
- **XSS prevention** -- validates DOM-bound content and script-tag patterns.
- **CORS auditing** -- reviews allowed origins and blocks wildcard or overly permissive rules.
- **Secret rotation** -- automated API key and credential rotation with expiry tracking.
- **Sandbox policies** -- enforces execution boundaries for untrusted agent actions.

## Installation

```bash
pnpm install --filter @ghita/security
```

## Usage

```typescript
import { sanitize, auditCORS } from '@ghita/security';

const clean = sanitize('<script>alert(1)</script>');
const report = auditCORS(['*'], ['https://trusted.example.com']);
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
