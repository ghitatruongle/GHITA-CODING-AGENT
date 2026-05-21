// ==============================================================================
// GHITA CODING AGENT - Event Stream Manager
// ==============================================================================

import { AgentEvent, AgentEventType } from './types.js';
import { logger } from '../logger.js';

export type EventSubscriber = (event: AgentEvent) => void | Promise<void>;

export class EventStream {
  private subscribers: Set<EventSubscriber> = new Set();
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize = 500) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Publish a new event to the stream
   */
  public emit(type: AgentEventType, payload: any, message?: string): AgentEvent {
    const event: AgentEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      message,
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify all subscribers
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(event);
      } catch (err: any) {
        logger.error(`[EventStream] Subscriber callback error: ${err.message}`, err);
      }
    });

    return event;
  }

  /**
   * Subscribe to the event stream. Returns an unsubscribe function.
   */
  public subscribe(callback: EventSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Unsubscribe a callback from the stream
   */
  public unsubscribe(callback: EventSubscriber): boolean {
    return this.subscribers.delete(callback);
  }

  /**
   * Replay historical events.
   * If sinceTimestamp is provided, only returns events after that time.
   */
  public replay(sinceTimestamp?: number): AgentEvent[] {
    if (!sinceTimestamp) {
      return [...this.eventHistory];
    }
    return this.eventHistory.filter((event) => event.timestamp > sinceTimestamp);
  }

  /**
   * Clear all stored event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
    logger.info('[EventStream] Historical events cleared.');
  }

  /**
   * Get active subscriber count
   */
  public getSubscriberCount(): number {
    return this.subscribers.size;
  }
}
