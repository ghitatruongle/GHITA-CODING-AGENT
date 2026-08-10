// ==============================================================================
// GHITA CODING AGENT - Terminal session primitives (v1.1.0 Track 7 P74/P75)
// ==============================================================================
// Buffer serialize/restore (addon-serialize style), flow control (XOFF/XON)
// and resize with pixel-size — desktop + mobile remote reuse these.
// ==============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TerminalSnapshot {
  id: string;
  /** Serialized VT sequences (addon-serialize output) for full restore. */
  buffer: string;
  cols: number;
  rows: number;
  cwd: string;
  createdAt: number;
  restoredAt?: number;
}

export interface TerminalSessionStore {
  save(snapshot: TerminalSnapshot): void;
  get(id: string): TerminalSnapshot | undefined;
  latest(sessionId: string): TerminalSnapshot | undefined;
  list(): TerminalSnapshot[];
  remove(id: string): boolean;
}

/** In-memory store (tests, short sessions). */
export class MemoryTerminalSessionStore implements TerminalSessionStore {
  private snapshots = new Map<string, TerminalSnapshot>();
  private latestBySession = new Map<string, string>();

  save(snapshot: TerminalSnapshot): void {
    this.snapshots.set(snapshot.id, snapshot);
    const sessionId = snapshot.id.split(':')[0] ?? snapshot.id;
    this.latestBySession.set(sessionId, snapshot.id);
  }

  get(id: string): TerminalSnapshot | undefined {
    return this.snapshots.get(id);
  }

  latest(sessionId: string): TerminalSnapshot | undefined {
    const id = this.latestBySession.get(sessionId);
    return id ? this.snapshots.get(id) : undefined;
  }

  list(): TerminalSnapshot[] {
    return [...this.snapshots.values()];
  }

  remove(id: string): boolean {
    return this.snapshots.delete(id);
  }
}

/** Bounded JSON-file store for durable terminal restore across restarts. */
export class FileTerminalSessionStore implements TerminalSessionStore {
  private snapshots = new Map<string, TerminalSnapshot>();

  constructor(
    private readonly file: string,
    private readonly maxSnapshots = 20,
  ) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf-8')) as TerminalSnapshot[];
      for (const s of parsed) this.snapshots.set(s.id, s);
    } catch {
      this.snapshots.clear();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const latest = [...this.snapshots.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, this.maxSnapshots);
    writeFileSync(this.file, JSON.stringify(latest, null, 2));
  }

  save(snapshot: TerminalSnapshot): void {
    this.snapshots.set(snapshot.id, snapshot);
    this.persist();
  }

  get(id: string): TerminalSnapshot | undefined {
    return this.snapshots.get(id);
  }

  latest(sessionId: string): TerminalSnapshot | undefined {
    return [...this.snapshots.values()]
      .filter((s) => s.id.startsWith(`${sessionId}:`))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  list(): TerminalSnapshot[] {
    return [...this.snapshots.values()];
  }

  remove(id: string): boolean {
    const removed = this.snapshots.delete(id);
    if (removed) this.persist();
    return removed;
  }
}

// ── Flow control (XOFF/XON) ──────────────────────────────────────────────────

export type FlowAction = 'pause' | 'resume';

export interface FlowControlOptions {
  /** XOFF byte (default \x13). */
  xoff?: number;
  /** XON byte (default \x11). */
  xon?: number;
}

/** XOFF/XON flow control for terminal output (node-pty handleFlowControl). */
export class FlowControl {
  private paused = false;
  private readonly xoff: number;
  private readonly xon: number;

  constructor(options: FlowControlOptions = {}) {
    this.xoff = options.xoff ?? 0x13;
    this.xon = options.xon ?? 0x11;
  }

  /** Feed a byte chunk; returns {action, remaining} when a control byte is seen. */
  feed(chunk: Buffer): { action?: FlowAction; rest: Buffer } {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === this.xoff) {
        this.paused = true;
        return { action: 'pause', rest: chunk.subarray(i + 1) };
      }
      if (byte === this.xon) {
        this.paused = false;
        return { action: 'resume', rest: chunk.subarray(i + 1) };
      }
    }
    return { rest: chunk };
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** True when new output should be withheld (backpressure). */
  shouldBackpressure(): boolean {
    return this.paused;
  }
}

// ── Resize with pixel size ───────────────────────────────────────────────────

export interface TerminalSize {
  cols: number;
  rows: number;
  /** Pixel size (node-pty resize(cols, rows, pixelSize)). */
  pixelWidth?: number;
  pixelHeight?: number;
}

export interface ResizePolicyOptions {
  minCols?: number;
  minRows?: number;
  maxCols?: number;
  maxRows?: number;
}

export class TerminalResizeManager {
  private size: TerminalSize;
  private readonly policy: Required<
    Pick<ResizePolicyOptions, 'minCols' | 'minRows' | 'maxCols' | 'maxRows'>
  >;

  constructor(initial: TerminalSize, policy: ResizePolicyOptions = {}) {
    this.size = initial;
    this.policy = {
      minCols: policy.minCols ?? 2,
      minRows: policy.minRows ?? 1,
      maxCols: policy.maxCols ?? 500,
      maxRows: policy.maxRows ?? 300,
    };
  }

  /** Resize with clamped cols/rows; pixel size passes through. */
  resize(next: TerminalSize): TerminalSize {
    const cols = clamp(next.cols, this.policy.minCols, this.policy.maxCols);
    const rows = clamp(next.rows, this.policy.minRows, this.policy.maxRows);
    this.size = {
      cols,
      rows,
      pixelWidth: next.pixelWidth,
      pixelHeight: next.pixelHeight,
    };
    return this.size;
  }

  get(): TerminalSize {
    return { ...this.size };
  }

  /** Fit from pixel dimensions + font metrics (approximation). */
  fitFromPixels(
    width: number,
    height: number,
    charWidth: number,
    charHeight: number,
  ): TerminalSize {
    const cols = Math.max(2, Math.floor(width / Math.max(1, charWidth)));
    const rows = Math.max(1, Math.floor(height / Math.max(1, charHeight)));
    return this.resize({ cols, rows, pixelWidth: width, pixelHeight: height });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
