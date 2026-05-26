// =============================================================================
// GHITA CODING AGENT - DSO Orchestrator Unit Tests
// Kiểm thử Dynamic Sandbox Orchestrator (Docker-based sandbox)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DSOOrchestrator } from '../src/sandbox/dsoOrchestrator.js';
import { SandboxLogger } from '../src/sandbox/sandboxLogger.js';
import type {
  SandboxServiceConfig,
  ContainerInfo,
  ContainerStats,
  SandboxLogEntry,
} from '../src/sandbox/types.js';
import {
  GHITA_SANDBOX_LABEL,
  DEFAULT_RESOURCE_LIMITS,
} from '../src/sandbox/types.js';

// =============================================================================
// Mock Dockerode
// =============================================================================

const mockContainer = {
  id: 'abc123def456',
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    HostConfig: {
      NanoCpus: 2e9,
      Memory: 2048 * 1024 * 1024,
    },
  }),
  stats: vi.fn().mockResolvedValue({
    cpu_stats: {
      cpu_usage: { total_usage: 100000 },
      system_cpu_usage: 1000000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 50000 },
      system_cpu_usage: 500000,
    },
    memory_stats: {
      usage: 512 * 1024 * 1024,
      limit: 2048 * 1024 * 1024,
    },
    networks: {
      eth0: { rx_bytes: 1024, tx_bytes: 512 },
    },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: 'Read', value: 4096 },
        { op: 'Write', value: 2048 },
      ],
    },
  }),
};

const mockNetwork = {
  id: 'net123abc456',
  connect: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockDocker = {
  createNetwork: vi.fn().mockResolvedValue(mockNetwork),
  listNetworks: vi.fn().mockResolvedValue([]),
  createContainer: vi.fn().mockResolvedValue(mockContainer),
  listContainers: vi.fn().mockResolvedValue([]),
  listImages: vi.fn().mockResolvedValue([{ Id: 'image123' }]),
  pull: vi.fn().mockResolvedValue(Buffer.from('')),
  getContainer: vi.fn().mockReturnValue(mockContainer),
  getNetwork: vi.fn().mockReturnValue(mockNetwork),
  modem: {
    followProgress: vi.fn(),
  },
};

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => mockDocker),
  };
});

// =============================================================================
// Tests: DSOOrchestrator
// =============================================================================

describe('DSOOrchestrator', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    dso = new DSOOrchestrator();
  });

  // ===========================================================================
  // Tác vụ 1: Tạo Docker Bridge Network
  // ===========================================================================

  describe('createNetwork', () => {
    it('nên tạo Docker Bridge Network thành công', async () => {
      const networkId = await dso.createNetwork('test-network');

      expect(networkId).toBe(mockNetwork.id);
      expect(mockDocker.createNetwork).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: expect.stringContaining('ghita-'),
          Driver: 'bridge',
          Labels: expect.objectContaining({
            [GHITA_SANDBOX_LABEL]: expect.any(String),
          }),
        })
      );
    });

    it('nên trả về network đã tạo nếu gọi lại cùng tên', async () => {
      const id1 = await dso.createNetwork('my-net');
      const id2 = await dso.createNetwork('my-net');

      expect(id1).toBe(id2);
      expect(mockDocker.createNetwork).toHaveBeenCalledTimes(1);
    });

    it('nên tái sử dụng network đã tồn tại trên Docker (statusCode 409)', async () => {
      mockDocker.createNetwork.mockRejectedValueOnce({ statusCode: 409 });
      mockDocker.listNetworks.mockResolvedValueOnce([
        { Id: 'existing-net-id' },
      ]);

      const networkId = await dso.createNetwork('existing-net');
      expect(networkId).toBe('existing-net-id');
    });

    it('nên throw error nếu tạo network thất bại', async () => {
      mockDocker.createNetwork.mockRejectedValueOnce(
        new Error('Docker daemon not running')
      );

      await expect(dso.createNetwork('fail-net')).rejects.toThrow(
        'Failed to create network'
      );
    });
  });

  // ===========================================================================
  // Tác vụ 2: Spawn Service Container
  // ===========================================================================

  describe('spawnContainer', () => {
    const baseConfig: SandboxServiceConfig = {
      image: 'node:22-alpine',
      name: 'test-service',
    };

    it('nên tạo và start container thành công', async () => {
      const info = await dso.spawnContainer(baseConfig);

      expect(info.id).toBe(mockContainer.id);
      expect(info.name).toContain('test-service');
      expect(info.image).toBe('node:22-alpine');
      expect(info.status).toBe('running');
      expect(mockDocker.createContainer).toHaveBeenCalled();
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('nên gán nhãn ghita-sandbox-id cho container', async () => {
      await dso.spawnContainer(baseConfig);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Labels: expect.objectContaining({
            [GHITA_SANDBOX_LABEL]: expect.any(String),
            'ghita-service-name': 'test-service',
          }),
        })
      );
    });

    it('nên cấu hình env vars đúng', async () => {
      const config: SandboxServiceConfig = {
        ...baseConfig,
        env: { NODE_ENV: 'production', PORT: '3000' },
      };

      await dso.spawnContainer(config);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Env: expect.arrayContaining([
            'NODE_ENV=production',
            'PORT=3000',
          ]),
        })
      );
    });

    it('nên kết nối container vào network', async () => {
      await dso.createNetwork('main');
      await dso.spawnContainer(baseConfig);

      expect(mockNetwork.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          Container: mockContainer.id,
          EndpointConfig: expect.objectContaining({
            Aliases: ['test-service'],
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Tác vụ 3-4: Volume & Port
  // ===========================================================================

  describe('volumes & ports', () => {
    it('nên cấu hình volume mounts đúng', async () => {
      const config: SandboxServiceConfig = {
        image: 'postgres:16',
        name: 'db',
        volumes: [
          { hostPath: '/tmp/pgdata', containerPath: '/var/lib/postgresql/data' },
          {
            hostPath: '/tmp/config',
            containerPath: '/etc/postgres',
            readOnly: true,
          },
        ],
      };

      await dso.spawnContainer(config);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining([
              '/tmp/pgdata:/var/lib/postgresql/data',
              '/tmp/config:/etc/postgres:ro',
            ]),
          }),
        })
      );
    });

    it('nên cấu hình port bindings đúng', async () => {
      const config: SandboxServiceConfig = {
        image: 'nginx:alpine',
        name: 'web',
        ports: [
          { containerPort: 80, hostPort: 8080 },
          { containerPort: 443, protocol: 'tcp' },
        ],
      };

      await dso.spawnContainer(config);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            PortBindings: expect.objectContaining({
              '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }],
              '443/tcp': [{ HostIp: '0.0.0.0', HostPort: '' }],
            }),
          }),
        })
      );
    });
  });

  // ===========================================================================
  // Tác vụ 6: Cleanup Orphan Containers
  // ===========================================================================

  describe('cleanupOrphans', () => {
    it('nên trả về 0 nếu không có orphan containers', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([]);
      const cleaned = await dso.cleanupOrphans();
      expect(cleaned).toBe(0);
    });

    it('nên dừng và xóa orphan containers', async () => {
      mockDocker.listContainers.mockResolvedValueOnce([
        {
          Id: 'orphan-1',
          State: 'running',
          Names: ['/orphan-container'],
          Labels: { [GHITA_SANDBOX_LABEL]: 'old-sandbox-id' },
        },
      ]);

      const cleaned = await dso.cleanupOrphans();

      expect(cleaned).toBe(1);
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 5 });
      expect(mockContainer.remove).toHaveBeenCalledWith({
        force: true,
        v: true,
      });
    });

    it('nên bỏ qua container của sandbox hiện tại', async () => {
      // Tạo container trước để có sandboxId
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'test',
      });

      // Lấy sandboxId từ labels
      const callArgs = mockDocker.createContainer.mock.calls[0][0];
      const currentSandboxId = callArgs.Labels[GHITA_SANDBOX_LABEL];

      mockDocker.listContainers.mockResolvedValueOnce([
        {
          Id: 'current-container',
          State: 'running',
          Names: ['/current'],
          Labels: { [GHITA_SANDBOX_LABEL]: currentSandboxId },
        },
      ]);

      const cleaned = await dso.cleanupOrphans();
      expect(cleaned).toBe(0);
      expect(mockContainer.stop).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Tác vụ 9: Resource Limits
  // ===========================================================================

  describe('resource limits', () => {
    it('nên cấu hình resource limits đúng (2 CPU, 2GB RAM)', async () => {
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'limited-service',
        limits: { cpuCores: 2, memoryMb: 2048 },
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            NanoCpus: 2e9,
            Memory: 2048 * 1024 * 1024,
            MemorySwap: 2048 * 1024 * 1024,
          }),
        })
      );
    });

    it('nên dùng resource limits mặc định nếu không cấu hình', async () => {
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'default-limits',
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            NanoCpus: DEFAULT_RESOURCE_LIMITS.cpuCores * 1e9,
            Memory: DEFAULT_RESOURCE_LIMITS.memoryMb * 1024 * 1024,
          }),
        })
      );
    });

    it('getResourceLimits nên trả về limits hiện tại', async () => {
      const limits = await dso.getResourceLimits('abc123');

      expect(limits.cpuCores).toBe(2);
      expect(limits.memoryMb).toBe(2048);
    });
  });

  // ===========================================================================
  // Stats & Monitoring
  // ===========================================================================

  describe('getStats', () => {
    it('nên trả về thống kê tài nguyên đúng', async () => {
      const stats = await dso.getStats('abc123');

      expect(stats.containerId).toBe('abc123');
      expect(stats.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsageMb).toBe(512);
      expect(stats.memoryLimitMb).toBe(2048);
      expect(stats.networkRxBytes).toBe(1024);
      expect(stats.networkTxBytes).toBe(512);
      expect(stats.timestamp).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // Destroy & Cleanup
  // ===========================================================================

  describe('destroy', () => {
    it('nên stop và remove container', async () => {
      // Spawn trước
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'to-destroy',
      });

      await dso.destroy(mockContainer.id);

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 5 });
      expect(mockContainer.remove).toHaveBeenCalledWith({
        force: true,
        v: true,
      });
    });
  });

  describe('destroyAll', () => {
    it('nên destroy tất cả containers và networks', async () => {
      // Tạo network + container
      await dso.createNetwork('main');
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'service-1',
      });

      await dso.destroyAll();

      expect(mockContainer.stop).toHaveBeenCalled();
      expect(mockContainer.remove).toHaveBeenCalled();
      expect(mockNetwork.remove).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Container Management
  // ===========================================================================

  describe('getContainers', () => {
    it('nên trả về danh sách rỗng ban đầu', () => {
      expect(dso.getContainers()).toEqual([]);
    });

    it('nên trả về container sau khi spawn', async () => {
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'my-service',
      });

      const containers = dso.getContainers();
      expect(containers).toHaveLength(1);
      expect(containers[0].name).toContain('my-service');
    });
  });

  describe('getContainerByName', () => {
    it('nên tìm container theo tên service', async () => {
      await dso.spawnContainer({
        image: 'node:22-alpine',
        name: 'findme',
      });

      const found = dso.getContainerByName('findme');
      expect(found).toBeDefined();
      expect(found!.name).toContain('findme');
    });

    it('nên trả về undefined nếu không tìm thấy', () => {
      const found = dso.getContainerByName('nonexistent');
      expect(found).toBeUndefined();
    });
  });
});

// =============================================================================
// Tests: SandboxLogger
// =============================================================================

describe('SandboxLogger', () => {
  let logger: SandboxLogger;

  beforeEach(() => {
    logger = new SandboxLogger();
  });

  it('nên ghi và lấy logs', () => {
    const entry: SandboxLogEntry = {
      containerId: 'test-id',
      containerName: 'test-container',
      event: 'start',
      message: 'Container started',
      timestamp: new Date(),
    };

    logger.log(entry);
    const logs = logger.getLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Container started');
  });

  it('nên lọc logs theo container ID', () => {
    logger.log({
      containerId: 'id-1',
      containerName: 'c1',
      event: 'start',
      message: 'start 1',
      timestamp: new Date(),
    });
    logger.log({
      containerId: 'id-2',
      containerName: 'c2',
      event: 'start',
      message: 'start 2',
      timestamp: new Date(),
    });

    const filtered = logger.getLogsByContainer('id-1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].message).toBe('start 1');
  });

  it('nên lọc logs theo event type', () => {
    logger.log({
      containerId: 'id-1',
      containerName: 'c1',
      event: 'start',
      message: 'started',
      timestamp: new Date(),
    });
    logger.log({
      containerId: 'id-1',
      containerName: 'c1',
      event: 'error',
      message: 'errored',
      timestamp: new Date(),
    });

    expect(logger.getLogsByEvent('start')).toHaveLength(1);
    expect(logger.getLogsByEvent('error')).toHaveLength(1);
  });

  it('nên giới hạn số lượng logs', () => {
    const smallLogger = new SandboxLogger({ maxLogs: 5 });

    for (let i = 0; i < 10; i++) {
      smallLogger.log({
        containerId: 'test',
        containerName: 'c',
        event: 'start',
        message: `log ${i}`,
        timestamp: new Date(),
      });
    }

    expect(smallLogger.getLogs()).toHaveLength(5);
    expect(smallLogger.getLogs()[0].message).toBe('log 5');
  });

  it('getSessionSummary nên trả về tóm tắt đúng', () => {
    logger.log({
      containerId: 'id-1',
      containerName: 'c1',
      event: 'start',
      message: 'started',
      timestamp: new Date(),
    });
    logger.log({
      containerId: 'id-1',
      containerName: 'c1',
      event: 'error',
      message: 'errored',
      timestamp: new Date(),
    });

    const summary = logger.getSessionSummary();
    expect(summary.totalLogs).toBe(2);
    expect(summary.startEvents).toBe(1);
    expect(summary.errorEvents).toBe(1);
    expect(summary.uniqueContainers).toBe(1);
  });

  it('computeResourceSummary nên tổng hợp stats đúng', () => {
    const stats: ContainerStats[] = [
      {
        containerId: 'c1',
        cpuPercent: 50,
        memoryUsageMb: 512,
        memoryLimitMb: 2048,
        networkRxBytes: 1024,
        networkTxBytes: 512,
        blockReadBytes: 0,
        blockWriteBytes: 0,
        timestamp: new Date(),
      },
      {
        containerId: 'c2',
        cpuPercent: 30,
        memoryUsageMb: 256,
        memoryLimitMb: 1024,
        networkRxBytes: 2048,
        networkTxBytes: 1024,
        blockReadBytes: 0,
        blockWriteBytes: 0,
        timestamp: new Date(),
      },
    ];

    const summary = SandboxLogger.computeResourceSummary(stats);

    expect(summary.totalCpuPercent).toBe(80);
    expect(summary.totalMemoryUsageMb).toBe(768);
    expect(summary.totalMemoryLimitMb).toBe(3072);
    expect(summary.containerCount).toBe(2);
  });
});
