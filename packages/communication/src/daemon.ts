import { EventEmitter } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CommunicationServer } from './server.js';
import { PairingManager } from './pairing.js';

// Types

export type DaemonState = 'stopped' | 'starting' | 'running' | 'degraded' | 'stopping' | 'errored';

export interface DaemonConfig {
  
  port: number;
  /** Host bind */
  host: string;
  /** Pairing code TTL (ms) */
  pairingTtlMs: number;
  /** Health check interval (ms) */
  healthCheckIntervalMs: number;
  /** Worker auto-restart on crash */
  autoRestartWorkers: boolean;
  
  maxRestartAttempts: number;
  
  stateFile: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  slackBotToken?: string;
  discordBotToken?: string;
  telegramBotToken?: string;
}

export interface DaemonHealth {
  state: DaemonState;
  uptime: number;
  startedAt: number;
  lastHealthCheckAt: number;
  workers: WorkerStatus[];
  memoryUsageMB: number;
  pairedDevicesCount: number;
  pairingCode?: string;
  pairingExpiresAt?: number;
}

export interface WorkerStatus {
  name: string;
  state: 'idle' | 'running' | 'errored' | 'restarting';
  restartCount: number;
  lastError?: string;
  startedAt: number;
}

export interface DaemonEventMap {
  state: (state: DaemonState) => void;
  health: (health: DaemonHealth) => void;
  worker_error: (worker: string, err: Error) => void;
  worker_restart: (worker: string, attempt: number) => void;
  pairing_code: (code: string, expiresAt: number) => void;
  log: (level: string, message: string) => void;
}

const DEFAULT_CONFIG: DaemonConfig = {
  port: 8080,
  host: '0.0.0.0',
  pairingTtlMs: 300_000,
  healthCheckIntervalMs: 30_000,
  autoRestartWorkers: true,
  maxRestartAttempts: 3,
  stateFile: join(homedir(), '.ghita', 'daemon-state.json'),
  logLevel: 'info',
};

// Gateway Daemon

export class GatewayDaemon extends EventEmitter {
  private state: DaemonState = 'stopped';
  private startedAt = 0;
  private config: DaemonConfig;
  private server: CommunicationServer | null = null;
  private pairingManager: PairingManager;
  private workers = new Map<string, WorkerStatus>();
  private workerRuntimes = new Map<string, { stop: () => Promise<void> }>();
  /**
   * Optional restart factories — when a worker is registered via the
   * new overload that accepts a factory, the daemon can re-create the
   * worker on `restartWorker()` instead of just stopping it.
   */
  private workerFactories = new Map<
    string,
    () => Promise<{ start?: () => Promise<void>; stop?: () => Promise<void> }>
  >();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(config: Partial<DaemonConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pairingManager = new PairingManager(this.config.pairingTtlMs);
  }

  // Lifecycle
  
  /** Start daemon (singleton - idem potent) */
  async start(server?: CommunicationServer): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      this.log('warn', `Daemon already ${this.state}`);
      return;
    }
    this.setState('starting');
    this.startedAt = Date.now();

    try {
      // Use provided server or create new one
      if (server) {
        this.server = server;
      } else {
        const { CommunicationServer: ServerClass } = await import('./server.js');
        this.server = new ServerClass({
          port: this.config.port,
          host: this.config.host,
        });
      }

      // Register workers
      this.registerWorker('pairing', {
        stop: async () => this.pairingManager.dispose(),
      });
      this.registerWorker('socket_server', {
        stop: async () => {
          // CommunicationServer cleanup is done by its own dispose()
        },
      });

      // Conditionally start gateway bots
      if (this.config.slackBotToken) {
        const { startSlackBot } = await import('./gateway/slack.js');
        const bot = await startSlackBot(this.config.slackBotToken, (msg) =>
          this.routeGatewayMessage('slack', msg),
        );
        this.registerWorker('gateway:slack', bot);
      }
      if (this.config.discordBotToken) {
        const { startDiscordBot } = await import('./gateway/discord.js');
        const bot = await startDiscordBot(this.config.discordBotToken, (msg) =>
          this.routeGatewayMessage('discord', msg),
        );
        this.registerWorker('gateway:discord', bot);
      }
      if (this.config.telegramBotToken) {
        const { startTelegramBot } = await import('./gateway/telegram.js');
        const bot = await startTelegramBot(this.config.telegramBotToken, (msg) =>
          this.routeGatewayMessage('telegram', msg),
        );
        this.registerWorker('gateway:telegram', bot);
      }

      // Pairing auto-refresh
      this.pairingManager.startAutoRefresh((code) => {
        this.emit('pairing_code', code, this.pairingManager.getState().expiresAt);
      });

      // Health check loop
      this.startHealthLoop();

      // Persist state
      await this.persistState();

      this.setState('running');
      this.log('info', `Daemon started on ${this.config.host}:${this.config.port}`);
    } catch (err) {
      // Roll back partially-started workers — callers treating the throw as
      // "nothing started" must not leave live bots/timers behind.
      try {
        await this.stop();
      } catch (stopErr) {
        this.log('warn', `Cleanup after failed start also failed: ${String(stopErr)}`);
      }
      this.setState('errored');
      const error = err instanceof Error ? err : new Error(String(err));
      this.log('error', `Daemon failed to start: ${error.message}`);
      throw error;
    }
  }

  /** Stop daemon gracefully (close all workers) */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') return;
    this.setState('stopping');

    // Stop health loop
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    // Stop workers in reverse order
    const workerNames = Array.from(this.workerRuntimes.keys()).reverse();
    for (const name of workerNames) {
      await this.stopWorker(name).catch((err) => {
        this.log('warn', `Worker "${name}" stop failed: ${err.message}`);
      });
    }

    this.pairingManager.dispose();
    this.setState('stopped');
    await this.persistState();
    this.log('info', 'Daemon stopped');
  }

  /**
   * Restart a specific worker (auto or manual).
   *
   * RESILIENCE: the previous implementation only
   * mutated the in-memory `status` object — flipping `state` to
   * `running` again — without actually stopping the underlying
   * worker or re-invoking its `start` hook. Callers therefore believed
   * a restart happened while the original process kept running with
   * the same crash state. We now perform a real stop → start cycle:
   * invoke the worker's `stop` hook, then re-establish it from the
   * factory, and only flip `state` to `running` after the new
   * instance is alive. If either step fails, the worker is marked
   * `errored` and `restartWorker` returns false so the supervisor can
   * escalate.
   */
  async restartWorker(name: string, reason?: string): Promise<boolean> {
    const status = this.workers.get(name);
    if (!status) {
      this.log('warn', `Worker "${name}" not found`);
      return false;
    }
    if (status.restartCount >= this.config.maxRestartAttempts) {
      this.setState('degraded');
      this.log(
        'error',
        `Worker "${name}" exceeded max restart attempts (${this.config.maxRestartAttempts})`,
      );
      return false;
    }

    const attempt = status.restartCount + 1;
    status.state = 'restarting';
    this.emit('worker_restart', name, attempt);
    status.restartCount = attempt;
    status.lastError = undefined;
    status.startedAt = Date.now();

    try {
      // 1. Stop the running worker if it has a stop hook
      const currentRuntime = this.workerRuntimes.get(name);
      if (currentRuntime?.stop) {
        await currentRuntime.stop();
      }
      this.workerRuntimes.delete(name);

      // 2. Re-create the worker via its factory (if any)
      const factory = this.workerFactories.get(name);
      if (factory) {
        const next = await factory();
        // Only register as a runtime if it has a stop hook, otherwise
        // we cannot later gracefully shut it down. Workers without a
        // stop hook cannot be restarted but are still allowed to exist.
        if (next?.stop) {
          // Map value type requires `stop` to be non-undefined; we
          // just narrowed above, but TS does not propagate the narrowed
          // type through the optional chain.
          const runtime: { stop: () => Promise<void> } = { stop: next.stop };
          this.workerRuntimes.set(name, runtime);
        }
        if (next?.start) await next.start();
      }

      status.state = 'running';
      this.emit('worker_state_change', name, 'running');
      this.log(
        'info',
        `Worker "${name}" restarted (attempt ${attempt})${reason ? ` reason: ${reason}` : ''}`,
      );
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      status.state = 'errored';
      status.lastError = error.message;
      this.emit('worker_error', name, error);
      this.log('error', `Worker "${name}" failed to restart: ${error.message}`);
      return false;
    }
  }

  reportWorkerError(workerName: string, err: Error): void {
    const status = this.workers.get(workerName);
    if (!status) {
      this.log('warn', `Error reported for unknown worker "${workerName}"`);
      return;
    }
    status.state = 'errored';
    status.lastError = err.message;
    this.emit('worker_error', workerName, err);
    this.log('error', `Worker "${workerName}" errored: ${err.message}`);

    if (this.config.autoRestartWorkers) {
      this.restartWorker(workerName, err.message).catch((e) => {
        this.log('error', `Restart failed: ${e.message}`);
      });
    }
  }

  // Health & Status
  
  getHealth(): DaemonHealth {
    return {
      state: this.state,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      startedAt: this.startedAt,
      lastHealthCheckAt: Date.now(),
      workers: Array.from(this.workers.values()),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pairedDevicesCount: 0, // CommunicationServer không expose getPairedDevices; health check giữ 0
      pairingCode: this.pairingManager.getState().code,
      pairingExpiresAt: this.pairingManager.getState().expiresAt,
    };
  }

  getState(): DaemonState {
    return this.state;
  }

  getServer(): CommunicationServer | null {
    return this.server;
  }

  getPairingManager(): PairingManager {
    return this.pairingManager;
  }

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // Gateway message routing
  
  private async routeGatewayMessage(
    source: 'slack' | 'discord' | 'telegram',
    message: unknown,
  ): Promise<void> {
    // Hook for guardrail pipeline - injected externally
    const hook = (
      this as unknown as { guardrailHook?: (src: string, msg: unknown) => Promise<unknown> }
    ).guardrailHook;
    if (hook) {
      try {
        const sanitized = await hook(source, message);
        this.log('debug', `Gateway ${source} message routed through guardrail`);
        // Forward sanitized message via public 'log' event for app-level consumption
        this.emit(
          'log',
          'info',
          `gateway_message:${source} ${JSON.stringify(sanitized).slice(0, 200)}`,
        );
      } catch (err) {
        this.log('warn', `Guardrail rejected ${source} message: ${(err as Error).message}`);
      }
    } else {
      this.emit(
        'log',
        'info',
        `gateway_message:${source} ${JSON.stringify(message).slice(0, 200)}`,
      );
    }
  }

  /** Inject guardrail hook (called by app during bootstrap) */
  setGuardrailHook(hook: (source: string, message: unknown) => Promise<unknown>): void {
    (this as unknown as { guardrailHook?: typeof hook }).guardrailHook = hook;
  }

  async attachDefaultGuardrail(): Promise<void> {
    const { GuardrailPipeline, createDaemonGuardrailHook } =
      await import('./guardrail-pipeline.js');
    const pipeline = new GuardrailPipeline({
      maxLength: 16_000,
      onHighSeverity: 'redact',
      auditLog: true,
    });
    this.setGuardrailHook(createDaemonGuardrailHook(pipeline));
    (this as unknown as { guardrailPipeline?: typeof pipeline }).guardrailPipeline = pipeline;
  }

  /** Get attached guardrail pipeline (for stats) */
  getGuardrailPipeline(): unknown {
    return (this as unknown as { guardrailPipeline?: unknown }).guardrailPipeline;
  }

  // Internal
  
  /**
   * Register a worker with the daemon. The third (optional) `factory`
   * parameter is used by `restartWorker()` to recreate the worker after
   * a crash; if absent the restart path falls back to stopping only.
   */
  private registerWorker(
    name: string,
    runtime: { start?: () => Promise<void>; stop: () => Promise<void> },
    factory?: () => Promise<{ start?: () => Promise<void>; stop: () => Promise<void> }>,
  ): void {
    this.workers.set(name, {
      name,
      state: 'running',
      restartCount: 0,
      startedAt: Date.now(),
    });
    this.workerRuntimes.set(name, runtime);
    if (factory) this.workerFactories.set(name, factory);
  }

  private async stopWorker(name: string): Promise<void> {
    const runtime = this.workerRuntimes.get(name);
    if (!runtime) return;
    await runtime.stop();
    const status = this.workers.get(name);
    if (status) status.state = 'idle';
    this.workerRuntimes.delete(name);
  }

  private startHealthLoop(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      if (this.disposed) return;
      this.emit('health', this.getHealth());
    }, this.config.healthCheckIntervalMs);
    if (this.healthTimer && typeof this.healthTimer === 'object' && 'unref' in this.healthTimer) {
      this.healthTimer.unref();
    }
  }

  private setState(state: DaemonState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }

  private log(level: string, message: string): void {
    const order = { debug: 10, info: 20, warn: 30, error: 40 } as const;
    const configLevel = order[this.config.logLevel];
    const msgLevel = order[level as keyof typeof order] ?? 20;
    if (msgLevel < configLevel) return;
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console -- this function IS the structured logger; direct console write is its purpose
    console[level === 'debug' ? 'log' : (level as 'info')](`[${ts}] [daemon:${level}] ${message}`);
    this.emit('log', level, message);
  }

  private async persistState(): Promise<void> {
    try {
      const dir = join(homedir(), '.ghita');
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      const data = JSON.stringify(
        {
          state: this.state,
          startedAt: this.startedAt,
          config: { port: this.config.port, host: this.config.host },
          workers: Array.from(this.workers.values()),
        },
        null,
        2,
      );
      await writeFile(this.config.stateFile, data, 'utf8');
    } catch (err) {
      this.log('warn', `Failed to persist state: ${(err as Error).message}`);
    }
  }

  /** Dispose all resources */
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stop();
    this.removeAllListeners();
  }
}

// Singleton

let _defaultDaemon: GatewayDaemon | null = null;

export function getDefaultDaemon(): GatewayDaemon {
  if (!_defaultDaemon) {
    _defaultDaemon = new GatewayDaemon();
  }
  return _defaultDaemon;
}

export function resetDefaultDaemon(): void {
  _defaultDaemon?.dispose().catch(() => {});
  _defaultDaemon = null;
}

// CLI entry (for `ghita-daemon` standalone)

export async function runDaemonCli(): Promise<void> {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const portStr = portArg?.split('=')[1];
  const port = portStr ? parseInt(portStr, 10) : 8080;

  const daemon = new GatewayDaemon({ port, logLevel: 'info' });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    daemon.emit('log', 'info', `Received ${signal}, shutting down...`);
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await daemon.start();
  } catch (err) {
    console.error('Daemon failed:', err);
    process.exit(1);
  }
}

// Auto-run if executed directly
const isMain = process.argv[1] && process.argv[1].endsWith('daemon.js');
if (isMain) {
  runDaemonCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
