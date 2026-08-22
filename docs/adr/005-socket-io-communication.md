# ADR-005: Socket.IO for Real-time Communication

**Status:** Accepted
**Date:** 2026-05-19
**Deciders:** GHITA Team

## Context

Desktop and mobile apps need real-time bidirectional communication for remote control, pairing, and telemetry. Options: raw WebSocket, Socket.IO, gRPC.

## Decision

Use Socket.IO for desktop ↔ mobile communication:

- Automatic reconnection
- Room-based messaging
- Event-driven API
- Fallback to polling if needed

## Consequences

**Positive:**

- Reliable delivery with reconnection
- Room abstraction for multi-device
- Well-documented, large community
- Works through NAT/firewall

**Negative:**

- Larger protocol overhead than raw WebSocket
- Server dependency (not just protocol)
- Binary support requires extra setup
