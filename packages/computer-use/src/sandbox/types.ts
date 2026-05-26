// =============================================================================
// GHITA CODING AGENT - DSO Types
// Type definitions for Dynamic Sandbox Orchestrator (Docker-based)
// =============================================================================

/**
 * Cấu hình cho một service container trong sandbox
 */
export interface SandboxServiceConfig {
  /** Docker image (ví dụ: 'postgres:16', 'node:22-alpine', 'mcr.microsoft.com/playwright:v1.48.0') */
  image: string;
  /** Tên container duy nhất */
  name: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Port mappings: { containerPort: hostPort } */
  ports?: PortMapping[];
  /** Volume mounts */
  volumes?: VolumeMount[];
  /** Lệnh khởi động tùy biến */
  command?: string[];
  /** Resource limits */
  limits?: ResourceLimits;
  /** Thời gian chờ khởi động (ms), mặc định 30s */
  startupTimeoutMs?: number;
  /** Health check endpoint (nếu có) */
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
  /** Port bên trong container */
  containerPort: number;
  /** Port trên host (nếu không chỉ định, Docker tự gán) */
  hostPort?: number;
  /** Protocol: 'tcp' | 'udp', mặc định 'tcp' */
  protocol?: 'tcp' | 'udp';
}

/**
 * Volume mount: host path → container path
 */
export interface VolumeMount {
  /** Đường dẫn trên host (hoặc tên volume) */
  hostPath: string;
  /** Đường dẫn bên trong container */
  containerPath: string;
  /** Chỉ đọc hay ghi được, mặc định false (read-write) */
  readOnly?: boolean;
}

/**
 * Giới hạn tài nguyên cho container
 */
export interface ResourceLimits {
  /** Số CPU cores (ví dụ: 2), mặc định 2 */
  cpuCores?: number;
  /** RAM giới hạn (MB), mặc định 2048 */
  memoryMb?: number;
  /** Đĩa tối đa (MB), mặc định unlimited */
  diskMb?: number;
}

/**
 * Thông tin container đang chạy
 */
export interface ContainerInfo {
  /** Docker container ID */
  id: string;
  /** Tên container */
  name: string;
  /** Docker image đã dùng */
  image: string;
  /** Trạng thái: 'created' | 'running' | 'stopped' | 'error' */
  status: 'created' | 'running' | 'stopped' | 'error';
  /** Port đã map ra host */
  ports: PortMapping[];
  /** Network ID */
  networkId?: string;
  /** Thời điểm tạo */
  createdAt: Date;
  /** Labels gán nhãn */
  labels: Record<string, string>;
}

/**
 * Thống kê tài nguyên container
 */
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
  /** Thời điểm đo */
  timestamp: Date;
}

/**
 * Log entry từ sandbox
 */
export interface SandboxLogEntry {
  /** Container ID liên quan */
  containerId: string;
  /** Tên container */
  containerName: string;
  /** Loại log: 'start' | 'stop' | 'error' | 'health' | 'resource' */
  event: 'start' | 'stop' | 'error' | 'health' | 'resource';
  /** Nội dung log */
  message: string;
  /** Metadata đính kèm */
  metadata?: Record<string, unknown>;
  /** Thời điểm */
  timestamp: Date;
}

/**
 * Label chuẩn dùng cho cleanup orphan containers
 */
export const GHITA_SANDBOX_LABEL = 'ghita-sandbox-id';

/**
 * Giá trị mặc định cho resource limits
 */
export const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits> = {
  cpuCores: 2,
  memoryMb: 2048,
  diskMb: 0, // 0 = unlimited
};

/**
 * Giá trị mặc định cho startup timeout
 */
export const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Giá trị mặc định cho health check
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 2_000;
export const DEFAULT_HEALTH_CHECK_RETRIES = 15;
