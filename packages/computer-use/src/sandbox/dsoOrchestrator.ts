// =============================================================================
// GHITA CODING AGENT - DSO: Dynamic Sandbox Orchestrator
// Tạo và quản lý mạng Docker Bridge Network + nhiều container cô lập
// Dùng Dockerode để điều phối Docker Engine từ Node.js
// =============================================================================

import Docker from 'dockerode';
import type {
  SandboxServiceConfig,
  ContainerInfo,
  PortMapping,
  VolumeMount,
  ResourceLimits,
  ContainerStats,
} from './types.js';
import {
  GHITA_SANDBOX_LABEL,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  DEFAULT_HEALTH_CHECK_RETRIES,
} from './types.js';
import { SandboxLogger } from './sandboxLogger.js';
import { randomBytes } from 'node:crypto';

/**
 * DSO — Dynamic Sandbox Orchestrator
 *
 * Tự động tạo Docker Bridge Network, khởi chạy nhiều container phụ (DB, Web Server, Playwright)
 * dưới sự giám sát của Agent. Gán nhãn ghita-sandbox-id cho mọi resource để cleanup tự động.
 */
export class DSOOrchestrator {
  private docker: Docker;
  private logger: SandboxLogger;
  private sandboxId: string;
  private networks: Map<string, string> = new Map(); // name → networkId
  private containers: Map<string, ContainerInfo> = new Map(); // containerId → info

  constructor(dockerSocket?: string) {
    this.docker = dockerSocket ? new Docker({ socketPath: dockerSocket }) : new Docker();
    this.logger = new SandboxLogger();
    this.sandboxId = randomBytes(8).toString('hex');
  }

  // =========================================================================
  // Tác vụ 1: Tạo Docker Bridge Network
  // =========================================================================

  /**
   * Tạo mạng cầu ảo (Docker Bridge Network) liên kết các container sandbox
   * @param name Tên network (sẽ được prefix với ghita-)
   * @returns Network ID
   */
  async createNetwork(name: string): Promise<string> {
    const networkName = `ghita-${this.sandboxId}-${name}`;

    // Kiểm tra network đã tồn tại chưa
    const existing = this.networks.get(name);
    if (existing) {
      return existing;
    }

    try {
      const network = await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Internal: false, // Cho phép truy cập mạng ngoài
        Labels: {
          [GHITA_SANDBOX_LABEL]: this.sandboxId,
          'ghita-network-role': name,
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'true', // Inter-container communication
          'com.docker.network.bridge.enable_ip_masquerade': 'true',
        },
      });

      const networkId = network.id;
      this.networks.set(name, networkId);
      this.logger.log({
        containerId: networkId,
        containerName: networkName,
        event: 'start',
        message: `Network "${networkName}" created successfully`,
        timestamp: new Date(),
      });

      return networkId;
    } catch (err: unknown) {
      const error = err as Error;
      if ((error as unknown as Record<string, unknown>).statusCode === 409) {
        const networks = await this.docker.listNetworks({
          filters: { name: [networkName] },
        });
        if (networks.length > 0) {
          const networkId = networks[0]?.Id || '';
          this.networks.set(name, networkId);
          return networkId;
        }
      }
      throw new Error(`Failed to create network "${name}": ${error.message}`);
    }
  }

  // =========================================================================
  // Tác vụ 2: Spawn Service Container
  // =========================================================================

  /**
   * Khởi chạy một container service trong sandbox
   * @param config Cấu hình service container
   * @returns ContainerInfo
   */
  async spawnContainer(config: SandboxServiceConfig): Promise<ContainerInfo> {
    const containerName = `ghita-${this.sandboxId}-${config.name}`;
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...config.limits };

    // Pull image nếu chưa có (ignore error nếu đã tồn tại)
    await this.pullImage(config.image);

    // Xây dựng HostConfig
    const hostConfig: Docker.HostConfig = {
      // Tác vụ 9: Resource limits
      NanoCpus: Math.floor(limits.cpuCores * 1e9),
      Memory: limits.memoryMb * 1024 * 1024, // Convert MB → bytes
      MemorySwap: limits.memoryMb * 1024 * 1024, // Không dùng swap

      // Tác vụ 3: Volume mounts cô lập
      Binds: this.buildVolumeBinds(config.volumes),

      // Tác vụ 4: Port mappings
      PortBindings: this.buildPortBindings(config.ports),

      // Auto-remove container khi dừng
      AutoRemove: false, // Giữ lại để inspect logs

      // Giới hạn restart
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
    };

    // Tạo container
    const container = await this.docker.createContainer({
      Image: config.image,
      name: containerName,
      Env: this.buildEnvVars(config.env),
      Cmd: config.command,
      Labels: {
        // Tác vụ 5: Gán nhãn ghita-sandbox-id
        [GHITA_SANDBOX_LABEL]: this.sandboxId,
        'ghita-service-name': config.name,
        'ghita-created-at': new Date().toISOString(),
      },
      HostConfig: hostConfig,
      NetworkingConfig: {
        EndpointsConfig: {}, // Sẽ connect network sau
      },
    });

    // Start container
    await container.start();

    // Connect vào network nếu có
    if (this.networks.size > 0) {
      const networkName = Array.from(this.networks.keys())[0];
      const networkId = networkName ? this.networks.get(networkName) || '' : '';
      if (networkId) {
        const network = this.docker.getNetwork(networkId);
        await network.connect({
          Container: container.id,
          EndpointConfig: {
            Aliases: [config.name], // Cho phép gọi bằng tên service
          },
        });
      }
    }

    const info: ContainerInfo = {
      id: container.id,
      name: containerName,
      image: config.image,
      status: 'running',
      ports: config.ports || [],
      networkId: Array.from(this.networks.values())[0],
      createdAt: new Date(),
      labels: {
        [GHITA_SANDBOX_LABEL]: this.sandboxId,
        'ghita-service-name': config.name,
      },
    };

    this.containers.set(container.id, info);

    // Log
    this.logger.log({
      containerId: container.id,
      containerName,
      event: 'start',
      message: `Container "${containerName}" started from image "${config.image}"`,
      metadata: { ports: config.ports, limits },
      timestamp: new Date(),
    });

    // Tác vụ 6: Chờ health check (nếu có)
    if (config.healthCheck) {
      await this.waitForHealthy(container.id, config);
    } else if (config.startupTimeoutMs) {
      // Đợi một khoảng thời gian để container khởi động
      await this.sleep(Math.min(config.startupTimeoutMs, 5000));
    }

    return info;
  }

  // =========================================================================
  // Tác vụ 3: Setup Volume Mounts
  // =========================================================================

  /**
   * Thêm volume mount vào container đang chạy (cần recreate)
   * Nếu cần mount động, nên cấu hình từ đầu trong spawnContainer
   */
  private buildVolumeBinds(volumes?: VolumeMount[]): string[] {
    if (!volumes || volumes.length === 0) return [];

    return volumes.map((v) => `${v.hostPath}:${v.containerPath}${v.readOnly ? ':ro' : ''}`);
  }

  // =========================================================================
  // Tác vụ 4: Port Mappings
  // =========================================================================

  private buildPortBindings(ports?: PortMapping[]): Docker.PortMap {
    if (!ports || ports.length === 0) return {};

    const bindings: Docker.PortMap = {};
    for (const p of ports) {
      const key = `${p.containerPort}/${p.protocol || 'tcp'}`;
      bindings[key] = [
        {
          HostIp: '0.0.0.0',
          HostPort: String(p.hostPort || ''),
        },
      ];
    }
    return bindings;
  }

  // =========================================================================
  // Tác vụ 6: Cleanup Orphan Containers
  // =========================================================================

  /**
   * Quét và dọn sạch tất cả container có nhãn ghita-sandbox-id
   * Được gọi khi app GHITA khởi động để dọn container mồ côi từ lần trước
   * @returns Số container đã dọn
   */
  async cleanupOrphans(): Promise<number> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: [GHITA_SANDBOX_LABEL],
        },
      });

      let cleaned = 0;
      for (const containerInfo of containers) {
        // Bỏ qua container của sandbox hiện tại
        if (containerInfo.Labels[GHITA_SANDBOX_LABEL] === this.sandboxId) {
          continue;
        }

        try {
          const container = this.docker.getContainer(containerInfo.Id);

          // Stop nếu đang chạy
          if (containerInfo.State === 'running') {
            await container.stop({ t: 5 }); // Grace timeout 5s
          }

          // Xóa container
          await container.remove({ force: true, v: true });
          cleaned++;

          this.logger.log({
            containerId: containerInfo.Id,
            containerName: containerInfo.Names?.[0] || 'unknown',
            event: 'stop',
            message: `Orphan container cleaned up (sandbox ${
              containerInfo.Labels[GHITA_SANDBOX_LABEL]
            })`,
            timestamp: new Date(),
          });
        } catch (err: unknown) {
          this.logger.log({
            containerId: containerInfo.Id,
            containerName: containerInfo.Names?.[0] || 'unknown',
            event: 'error',
            message: `Failed to cleanup orphan: ${(err as Error).message}`,
            timestamp: new Date(),
          });
        }
      }

      // Cleanup orphan networks
      await this.cleanupOrphanNetworks();

      return cleaned;
    } catch (err: unknown) {
      this.logger.log({
        containerId: 'system',
        containerName: 'dso-orchestrator',
        event: 'error',
        message: `Orphan cleanup failed: ${(err as Error).message}`,
        timestamp: new Date(),
      });
      return 0;
    }
  }

  /**
   * Dọn sạch các network mồ côi có nhãn ghita-sandbox-id
   */
  private async cleanupOrphanNetworks(): Promise<void> {
    try {
      const networks = await this.docker.listNetworks({
        filters: {
          label: [GHITA_SANDBOX_LABEL],
        },
      });

      for (const net of networks) {
        if (net.Labels && net.Labels[GHITA_SANDBOX_LABEL] === this.sandboxId) continue;

        try {
          const network = this.docker.getNetwork(net.Id);
          await network.remove();
        } catch {
          // Network đang được sử dụng bởi container khác — bỏ qua
        }
      }
    } catch {
      // Ignore network cleanup errors
    }
  }

  // =========================================================================
  // Tác vụ 9: Resource Limits
  // =========================================================================

  /**
   * Lấy resource limits hiện tại của container
   * (Không thể thay đổi resource limits trên container đang chạy — cần recreate)
   */
  async getResourceLimits(containerId: string): Promise<ResourceLimits> {
    const container = this.docker.getContainer(containerId);
    const inspect = await container.inspect();

    return {
      cpuCores: (inspect.HostConfig.NanoCpus || 0) / 1e9,
      memoryMb: (inspect.HostConfig.Memory || 0) / (1024 * 1024),
    };
  }

  // =========================================================================
  // Stats & Monitoring
  // =========================================================================

  /**
   * Lấy thống kê tài nguyên của container đang chạy
   */
  async getStats(containerId: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    return {
      containerId,
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMb: Math.round(((stats.memory_stats.usage || 0) / (1024 * 1024)) * 100) / 100,
      memoryLimitMb: Math.round(((stats.memory_stats.limit || 0) / (1024 * 1024)) * 100) / 100,
      networkRxBytes: Object.values(stats.networks || {}).reduce(
        (sum: number, net: Record<string, unknown>) => sum + ((net.rx_bytes as number) || 0),
        0,
      ),
      networkTxBytes: Object.values(stats.networks || {}).reduce(
        (sum: number, net: Record<string, unknown>) => sum + ((net.tx_bytes as number) || 0),
        0,
      ),
      blockReadBytes:
        (stats.blkio_stats?.io_service_bytes_recursive?.find(
          (b: unknown) => (b as Record<string, unknown>).op === 'Read',
        )?.value as number) || 0,
      blockWriteBytes:
        (stats.blkio_stats?.io_service_bytes_recursive?.find(
          (b: unknown) => (b as Record<string, unknown>).op === 'Write',
        )?.value as number) || 0,
      timestamp: new Date(),
    };
  }

  /**
   * Lấy sandbox ID hiện tại
   */
  getSandboxId(): string {
    return this.sandboxId;
  }

  /**
   * Lấy thống kê tổng hợp của toàn bộ sandbox
   */
  async getSandboxStats(): Promise<{
    sandboxId: string;
    networkCount: number;
    containerCount: number;
    containers: ContainerInfo[];
    networks: string[];
  }> {
    const containers = Array.from(this.containers.values());
    const networks = Array.from(this.networks.keys());

    return {
      sandboxId: this.sandboxId,
      networkCount: this.networks.size,
      containerCount: this.containers.size,
      containers,
      networks,
    };
  }

  /**
   * Liệt kê tất cả containers (bao gồm cả container đã dừng)
   */
  async listContainers(): Promise<unknown[]> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: [GHITA_SANDBOX_LABEL],
        },
      });
      return containers;
    } catch (err) {
      return [];
    }
  }

  /**
   * Lấy danh sách tất cả container đang quản lý
   */
  getContainers(): ContainerInfo[] {
    return Array.from(this.containers.values());
  }

  /**
   * Lấy thông tin container theo tên service
   */
  getContainerByName(serviceName: string): ContainerInfo | undefined {
    for (const info of this.containers.values()) {
      if (info.labels['ghita-service-name'] === serviceName) {
        return info;
      }
    }
    return undefined;
  }

  // =========================================================================
  // Destroy & Cleanup
  // =========================================================================

  /**
   * Stop và remove một container
   */
  async destroy(containerId: string): Promise<void> {
    const info = this.containers.get(containerId);
    if (!info) return;

    try {
      const container = this.docker.getContainer(containerId);

      // Stop nếu đang chạy
      if (info.status === 'running') {
        await container.stop({ t: 5 }).catch(() => {});
      }

      // Remove container
      await container.remove({ force: true, v: true }).catch(() => {});

      info.status = 'stopped';
      this.containers.delete(containerId);

      this.logger.log({
        containerId,
        containerName: info.name,
        event: 'stop',
        message: `Container "${info.name}" destroyed`,
        timestamp: new Date(),
      });
    } catch (err: unknown) {
      this.logger.log({
        containerId,
        containerName: info.name,
        event: 'error',
        message: `Failed to destroy container: ${(err as Error).message}`,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Destroy tất cả container và network trong sandbox
   */
  async destroyAll(): Promise<void> {
    // Destroy containers trước
    const containerIds = Array.from(this.containers.keys());
    for (const id of containerIds) {
      await this.destroy(id);
    }

    // Remove networks
    for (const [name, networkId] of this.networks) {
      try {
        const network = this.docker.getNetwork(networkId);
        await network.remove();
        this.logger.log({
          containerId: networkId,
          containerName: `network-${name}`,
          event: 'stop',
          message: `Network "${name}" removed`,
          timestamp: new Date(),
        });
      } catch {
        // Network đang được sử dụng
      }
    }

    this.networks.clear();
    this.containers.clear();
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private buildEnvVars(env?: Record<string, string>): string[] {
    if (!env) return [];
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  private async pullImage(image: string): Promise<void> {
    try {
      // Kiểm tra image đã có chưa
      const images = await this.docker.listImages({
        filters: { reference: [image] },
      });

      if (images.length > 0) return;

      // Pull image
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (!error.message?.includes('No such image')) {
        throw new Error(`Failed to pull image "${image}": ${error.message}`);
      }
    }
  }

  private async waitForHealthy(containerId: string, config: SandboxServiceConfig): Promise<void> {
    const hc = config.healthCheck;
    if (!hc) throw new Error('Health check config is required');
    const interval = hc.intervalMs || DEFAULT_HEALTH_CHECK_INTERVAL_MS;
    const maxRetries = hc.retries || DEFAULT_HEALTH_CHECK_RETRIES;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const resp = await fetch(hc.url);
        if (resp.ok) {
          this.logger.log({
            containerId,
            containerName: `ghita-${this.sandboxId}-${config.name}`,
            event: 'health',
            message: `Health check passed for "${config.name}" (attempt ${i + 1})`,
            timestamp: new Date(),
          });
          return;
        }
      } catch {
        // Container chưa sẵn sàng
      }
      await this.sleep(interval);
    }

    throw new Error(`Health check failed for "${config.name}" after ${maxRetries} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
