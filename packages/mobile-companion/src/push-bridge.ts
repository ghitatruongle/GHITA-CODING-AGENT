// @ghita/mobile-companion -- Push Notification Bridge

import type { PushNotification } from './types.js';

export class PushNotificationBridge {
  private readonly queue: PushNotification[] = [];

  enqueue(notification: PushNotification): void {
    this.queue.push(notification);
  }

  dequeue(): PushNotification | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }

  peek(): PushNotification | undefined {
    return this.queue[0];
  }
}
