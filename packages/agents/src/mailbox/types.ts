// Persistent mailbox system for durable multi-agent coordination (pattern:
// orca mailbox with ack/replay + worker_done + decision gates). Messages
// survive process restarts via SQLite; each agent has a private inbox that
// supports at-least-once delivery with explicit acknowledgment.

/** A message in the mailbox system. */
export interface MailboxMessage {
  /** Unique message id (UUID). */
  id: string;
  /** Sender agent id. */
  from: string;
  /** Recipient agent id. */
  to: string;
  /** Message payload (JSON-serializable). */
  payload: unknown;
  /** Unix timestamp (ms) when the message was sent. */
  timestamp: number;
  /** Optional correlation id for request-reply patterns. */
  replyTo?: string;
  /** Monotonically increasing sequence number per sender (for ordering). */
  seq: number;
}

/** Delivery status of a message in a recipient's inbox. `in_flight` means
 * handed to a consumer but not yet acked; it is redelivered after the
 * visibility timeout so a crash cannot silently drop the message. */
export type DeliveryStatus = 'pending' | 'in_flight' | 'delivered' | 'acked';

/** A delivery record tracking message consumption. */
export interface DeliveryRecord {
  /** The message being delivered. */
  message: MailboxMessage;
  /** Current delivery status. */
  status: DeliveryStatus;
  /** Number of times this message has been delivered (for redelivery tracking). */
  deliveryCount: number;
  /** Unix timestamp (ms) of last delivery attempt. */
  lastDeliveredAt: number;
  /** Unix timestamp (ms) when acked (null if not yet acked). */
  ackedAt: number | null;
}

/** Outcome reported by a worker when it finishes processing. */
export type WorkerOutcome = 'succeeded' | 'failed';

/** A worker completion report. */
export interface WorkerDoneReport {
  /** The agent id that completed work. */
  agentId: string;
  /** Outcome of the work. */
  outcome: WorkerOutcome;
  /** Optional result payload. */
  result?: unknown;
  /** Optional error description (when outcome is 'failed'). */
  error?: string;
  /** Unix timestamp (ms). */
  timestamp: number;
}

/** A blocking question posed to an agent or human operator. */
export interface MailboxAsk {
  /** Unique ask id. */
  id: string;
  /** The agent that posed the question. */
  from: string;
  /** Target recipient (agent id or 'human'). */
  to: string;
  /** The question text. */
  question: string;
  /** Optional structured options for the answer. */
  options?: string[];
  /** Timeout in ms (0 = no timeout). */
  timeoutMs: number;
  /** Unix timestamp (ms) when the ask was created. */
  createdAt: number;
  /** Whether this ask has been answered. */
  answered: boolean;
  /** The answer (null if unanswered or timed out). */
  answer: string | null;
  /** Whether the ask timed out. */
  timedOut: boolean;
}

/** A decision gate that blocks task progression until resolved. */
export interface DecisionGate {
  /** Unique gate id. */
  id: string;
  /** The agent or orchestrator that created the gate. */
  createdBy: string;
  /** Description of what decision is needed. */
  description: string;
  /** Whether the gate has been resolved. */
  resolved: boolean;
  /** The resolution value (null if unresolved). */
  resolution: unknown;
  /** Unix timestamp (ms) when created. */
  createdAt: number;
  /** Unix timestamp (ms) when resolved (null if unresolved). */
  resolvedAt: number | null;
}

/** Configuration for the MailboxStore. */
export interface MailboxStoreConfig {
  /** Path to the SQLite database file. ':memory:' for in-memory (testing). */
  dbPath: string;
  /** Maximum messages to retain per inbox (0 = unlimited, default: 1000). */
  maxInboxSize?: number;
  /** Default timeout for asks in ms (default: 30000). */
  defaultAskTimeoutMs?: number;
}
