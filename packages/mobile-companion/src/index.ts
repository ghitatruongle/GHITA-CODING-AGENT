// ==============================================================================
// GHITA CODING AGENT - Mobile Companion App (Phase 50)
// React Native shell types, remote agent control, push notifications, offline
// ==============================================================================

// --- Types ---

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error' | 'completed';

export interface AgentSession {
  id: string;
  agentId: string;
  name: string;
  status: AgentStatus;
  startedAt: number;
  lastActivityAt: number;
  messageCount: number;
}

export interface PushNotificationPayload {
  type: 'agent-update' | 'task-complete' | 'error' | 'mention';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface OfflineQueueEntry {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  queuedAt: number;
  retryCount: number;
  maxRetries: number;
}

export interface RemoteControlCommand {
  type: 'start' | 'stop' | 'pause' | 'resume' | 'message' | 'screenshot';
  sessionId: string;
  data?: Record<string, unknown>;
}

// --- Remote Agent Control ---

export class RemoteAgentController {
  private sessions = new Map<string, AgentSession>();
  private commandHistory: RemoteControlCommand[] = [];

  /**
   * Register a new agent session.
   */
  registerSession(session: AgentSession): void {
    this.sessions.set(session.id, session);
  }

  /**
   * Send a command to a remote agent.
   */
  sendCommand(command: RemoteControlCommand): { success: boolean; message: string } {
    const session = this.sessions.get(command.sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    this.commandHistory.push(command);

    switch (command.type) {
      case 'start':
        session.status = 'running';
        session.lastActivityAt = Date.now();
        break;
      case 'stop':
        session.status = 'idle';
        session.lastActivityAt = Date.now();
        break;
      case 'pause':
        session.status = 'paused';
        session.lastActivityAt = Date.now();
        break;
      case 'resume':
        session.status = 'running';
        session.lastActivityAt = Date.now();
        break;
      case 'message':
        session.messageCount++;
        session.lastActivityAt = Date.now();
        break;
      case 'screenshot':
        session.lastActivityAt = Date.now();
        break;
    }

    return { success: true, message: `Command '${command.type}' sent to session ${command.sessionId}` };
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'running' || s.status === 'paused',
    );
  }

  /**
   * Get session by ID.
   */
  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get command history.
   */
  getHistory(sessionId?: string): RemoteControlCommand[] {
    if (sessionId) {
      return this.commandHistory.filter((c) => c.sessionId === sessionId);
    }
    return [...this.commandHistory];
  }
}

// --- Push Notification Manager ---

export class PushNotificationManager {
  private notifications: PushNotificationPayload[] = [];
  private listeners: Array<(notification: PushNotificationPayload) => void> = [];

  /**
   * Handle an incoming push notification.
   */
  handleNotification(payload: PushNotificationPayload): void {
    this.notifications.push(payload);
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  /**
   * Get all notifications, optionally filtered by type.
   */
  getNotifications(type?: PushNotificationPayload['type']): PushNotificationPayload[] {
    if (type) {
      return this.notifications.filter((n) => n.type === type);
    }
    return [...this.notifications];
  }

  /**
   * Clear all notifications.
   */
  clearAll(): void {
    this.notifications = [];
  }

  /**
   * Register a notification listener.
   */
  onNotification(listener: (notification: PushNotificationPayload) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  get unreadCount(): number {
    return this.notifications.length;
  }
}

// --- Offline Queue ---

export class OfflineQueue {
  private queue: OfflineQueueEntry[] = [];

  /**
   * Add an action to the offline queue.
   */
  enqueue(action: string, payload: Record<string, unknown>, maxRetries = 3): string {
    const id = `offline-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.queue.push({ id, action, payload, queuedAt: Date.now(), retryCount: 0, maxRetries });
    return id;
  }

  /**
   * Process the queue — call this when connectivity is restored.
   */
  async process(
    handler: (entry: OfflineQueueEntry) => Promise<boolean>,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    const remaining: OfflineQueueEntry[] = [];

    for (const entry of this.queue) {
      try {
        const success = await handler(entry);
        if (success) {
          processed++;
        } else {
          entry.retryCount++;
          if (entry.retryCount < entry.maxRetries) {
            remaining.push(entry);
          } else {
            failed++;
          }
        }
      } catch {
        entry.retryCount++;
        if (entry.retryCount < entry.maxRetries) {
          remaining.push(entry);
        } else {
          failed++;
        }
      }
    }

    this.queue = remaining;
    return { processed, failed };
  }

  /**
   * Get queue length.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty.
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear the entire queue.
   */
  clear(): void {
    this.queue = [];
  }
}
