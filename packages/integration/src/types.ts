// @ghita/integration -- Type Definitions

export interface ServiceHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs: number;
  readonly details?: Record<string, unknown>;
}

export interface EventHandler<T = unknown> {
  (event: T): void | Promise<void>;
}

export interface ServiceDefinition {
  readonly name: string;
  readonly version: string;
  readonly healthCheck?: () => Promise<ServiceHealth>;
}
