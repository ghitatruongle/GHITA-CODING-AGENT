# @ghita/communication

![Version](https://img.shields.io/badge/version-0.1.0-blue)

Desktop-to-mobile communication layer using Socket.IO and WebSockets, enabling real-time sync, screen sharing, and command relay between GHITA desktop and mobile.

## Key Features

- **Socket.IO channels** -- typed event channels for task sync, notifications, and file transfer.
- **Daemon process** -- background server that maintains persistent connections across desktop sessions.
- **Screen capture relay** -- streams desktop screenshots to connected mobile clients.
- **Guardrail pipeline** -- validates and sanitizes all inter-device messages before delivery.
- **Pairing protocol** -- secure device pairing with token-based authentication.

## Installation

```bash
pnpm install --filter @ghita/communication
```

## Usage

```typescript
import { CommunicationServer } from '@ghita/communication';

const server = new CommunicationServer({ port: 3001 });
await server.start();
server.on('task:update', (data) => console.log(data));
```

## API Docs

Generated via TypeDoc: `pnpm build:docs`
