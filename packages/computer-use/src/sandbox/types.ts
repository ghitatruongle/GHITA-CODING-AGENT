// Type definitions for Dynamic Sandbox Orchestrator (Docker-based)

export interface SandboxServiceConfig {
  
  image: string;
  
  name: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Port mappings: { containerPort: hostPort } */
  ports?: PortMapping[];
  /** Volume mounts */
  volumes?: VolumeMount[];
  
  command?: string[];
  /** Resource limits */
  limits?: ResourceLimits;
  
  startupTimeoutMs?: number;
  
  healthCheck?: {
    url: string;
    intervalMs?: number;
    retries?: number;
  };
}

/**
 * Port mapping: container → host
 */
export interface PortMapping {
  
  containerPort: number;
  
  hostPort?: number;
  
  protocol?: 'tcp' | 'udp';
}

/**
 * Volume mount: host path → container path
 */
export interface VolumeMount {
  
  hostPath: string;
  
  containerPath: string;
  
  readOnly?: boolean;
}

export interface ResourceLimits {
  
  cpuCores?: number;
  
  memoryMb?: number;
  
  diskMb?: number;
}

export interface ContainerInfo {
  /** Docker container ID */
  id: string;
  
  name: string;
  
  image: string;
  
  status: 'created' | 'running' | 'stopped' | 'error';
  
  ports: PortMapping[];
  /** Network ID */
  networkId?: string;
  
  createdAt: Date;
  
  labels: Record<string, string>;
}

export interface ContainerStats {
  /** Container ID */
  containerId: string;
  /** CPU usage (%) */
  cpuPercent: number;
  /** RAM usage (MB) */
  memoryUsageMb: number;
  /** RAM limit (MB) */
  memoryLimitMb: number;
  /** Network I/O: bytes received */
  networkRxBytes: number;
  /** Network I/O: bytes sent */
  networkTxBytes: number;
  /** Block I/O: bytes read */
  blockReadBytes: number;
  /** Block I/O: bytes written */
  blockWriteBytes: number;
  
  timestamp: Date;
}

export interface SandboxLogEntry {
  
  containerId: string;
  
  containerName: string;
  
  event: 'start' | 'stop' | 'error' | 'health' | 'resource';
  
  message: string;
  
  metadata?: Record<string, unknown>;
  
  timestamp: Date;
}

export const GHITA_SANDBOX_LABEL = 'ghita-sandbox-id';

export const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits> = {
  cpuCores: 2,
  memoryMb: 2048,
  diskMb: 0, // 0 = unlimited
};

export const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 2_000;
export const DEFAULT_HEALTH_CHECK_RETRIES = 15;
