---
id: packages-communication
title: @ghita/communication
sidebar_label: communication
---

# @ghita/communication

WebSocket multiplexer, IPC, device pairing.

```typescript
import { SharedSocket, PairingProtocol } from '@ghita/communication';

const socket = new SharedSocket({ port: 1455, authToken: '...' });
await socket.start();

socket.on('device:paired', (device) => console.log('Paired:', device));
```
