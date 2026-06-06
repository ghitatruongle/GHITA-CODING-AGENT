// =============================================================================
// GHITA CODING AGENT — Phase 12: DSO Extended Tests
// Bổ sung: multi-container, port protocols, env vars, edge cases,
// SandboxLogger advanced, destroy edge cases, stats computation
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
import { GHITA_SANDBOX_LABEL, DEFAULT_RESOURCE_LIMITS } from '../src/sandbox/types.js';

// =============================================================================
// Mock Dockerode
// =============================================================================

let mockCallCount = 0;

const createMockContainer = (id: string) => ({
  id,
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
});

const mockNetwork = {
  id: 'net123abc456',
  connect: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockDocker = {
  createNetwork: vi.fn().mockResolvedValue(mockNetwork),
  listNetworks: vi.fn().mockResolvedValue([]),
  createContainer: vi.fn().mockImplementation(() => {
    mockCallCount++;
    return Promise.resolve(createMockContainer(`container-${mockCallCount}`));
  }),
  listContainers: vi.fn().mockResolvedValue([]),
  listImages: vi.fn().mockResolvedValue([{ Id: 'image123' }]),
  pull: vi.fn().mockResolvedValue(Buffer.from('')),
  getContainer: vi.fn().mockImplementation((id: string) => createMockContainer(id)),
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
// DSOOrchestrator — Multi-Container Tests
// =============================================================================

describe('DSOOrchestrator — multi-container', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should spawn multiple containers', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'app' });
    await dso.spawnContainer({ image: 'postgres:16', name: 'db' });
    await dso.spawnContainer({ image: 'redis:7', name: 'cache' });

    expect(dso.getContainers()).toHaveLength(3);
  });

  it('should track containers by name', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'app' });
    await dso.spawnContainer({ image: 'postgres:16', name: 'db' });

    expect(dso.getContainerByName('app')).toBeDefined();
    expect(dso.getContainerByName('db')).toBeDefined();
    expect(dso.getContainerByName('nonexistent')).toBeUndefined();
  });

  it('should destroy specific container without affecting others', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'app' });
    await dso.spawnContainer({ image: 'postgres:16', name: 'db' });

    const containers = dso.getContainers();
    await dso.destroy(containers[0].id);

    expect(dso.getContainers()).toHaveLength(1);
  });

  it('should connect all containers to the same network', async () => {
    await dso.createNetwork('main');
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'app' });
    await dso.spawnContainer({ image: 'postgres:16', name: 'db' });

    expect(mockNetwork.connect).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Port Mapping Edge Cases
// =============================================================================

describe('DSOOrchestrator — port mapping', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle UDP protocol', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'udp-service',
      ports: [{ containerPort: 53, hostPort: 5353, protocol: 'udp' }],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: expect.objectContaining({
            '53/udp': [{ HostIp: '0.0.0.0', HostPort: '5353' }],
          }),
        }),
      }),
    );
  });

  it('should handle mixed TCP and UDP ports', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'mixed-service',
      ports: [
        { containerPort: 80, hostPort: 8080, protocol: 'tcp' },
        { containerPort: 53, hostPort: 5353, protocol: 'udp' },
      ],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: expect.objectContaining({
            '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }],
            '53/udp': [{ HostIp: '0.0.0.0', HostPort: '5353' }],
          }),
        }),
      }),
    );
  });

  it('should handle port without hostPort', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'auto-port',
      ports: [{ containerPort: 3000 }],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: expect.objectContaining({
            '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '' }],
          }),
        }),
      }),
    );
  });

  it('should handle empty ports array', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'no-ports',
      ports: [],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: {},
        }),
      }),
    );
  });
});

// =============================================================================
// Volume Mounts Edge Cases
// =============================================================================

describe('DSOOrchestrator — volume mounts', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle empty volumes array', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'no-volumes',
      volumes: [],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: [],
        }),
      }),
    );
  });

  it('should handle multiple volume mounts', async () => {
    await dso.spawnContainer({
      image: 'postgres:16',
      name: 'pg',
      volumes: [
        { hostPath: '/data/pg', containerPath: '/var/lib/postgresql/data' },
        { hostPath: '/config/pg', containerPath: '/etc/postgresql', readOnly: true },
        { hostPath: '/logs/pg', containerPath: '/var/log/postgresql' },
      ],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: expect.arrayContaining([
            '/data/pg:/var/lib/postgresql/data',
            '/config/pg:/etc/postgresql:ro',
            '/logs/pg:/var/log/postgresql',
          ]),
        }),
      }),
    );
  });
});

// =============================================================================
// Environment Variables
// =============================================================================

describe('DSOOrchestrator — env vars', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle no env vars', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'no-env' });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Env: [],
      }),
    );
  });

  it('should handle single env var', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'single-env',
      env: { NODE_ENV: 'production' },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Env: ['NODE_ENV=production'],
      }),
    );
  });

  it('should handle multiple env vars', async () => {
    await dso.spawnContainer({
      image: 'postgres:16',
      name: 'pg',
      env: {
        POSTGRES_USER: 'admin',
        POSTGRES_PASSWORD: 'secret',
        POSTGRES_DB: 'mydb',
      },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Env: expect.arrayContaining([
          'POSTGRES_USER=admin',
          'POSTGRES_PASSWORD=secret',
          'POSTGRES_DB=mydb',
        ]),
      }),
    );
  });

  it('should handle env vars with special characters', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'special-env',
      env: { DATABASE_URL: 'postgres://user:p@ss@host:5432/db' },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Env: ['DATABASE_URL=postgres://user:p@ss@host:5432/db'],
      }),
    );
  });
});

// =============================================================================
// Container Command
// =============================================================================

describe('DSOOrchestrator — command', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should pass command to container', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'cmd-service',
      command: ['node', 'server.js'],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Cmd: ['node', 'server.js'],
      }),
    );
  });

  it('should handle no command', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'no-cmd' });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Cmd: undefined,
      }),
    );
  });
});

// =============================================================================
// Destroy Edge Cases
// =============================================================================

describe('DSOOrchestrator — destroy edge cases', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should not throw when destroying non-existent container', async () => {
    await expect(dso.destroy('nonexistent-id')).resolves.toBeUndefined();
  });

  it('should handle stop error gracefully', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'fail-stop' });
    const containers = dso.getContainers();

    const container = mockDocker.getContainer(containers[0].id);
    container.stop.mockRejectedValueOnce(new Error('already stopped'));

    await expect(dso.destroy(containers[0].id)).resolves.toBeUndefined();
  });

  it('should handle remove error gracefully', async () => {
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'fail-remove' });
    const containers = dso.getContainers();

    const container = mockDocker.getContainer(containers[0].id);
    container.remove.mockRejectedValueOnce(new Error('in use'));

    await expect(dso.destroy(containers[0].id)).resolves.toBeUndefined();
  });

  it('should destroyAll when no containers exist', async () => {
    await expect(dso.destroyAll()).resolves.toBeUndefined();
  });

  it('should destroyAll with multiple containers and networks', async () => {
    await dso.createNetwork('main');
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'app' });
    await dso.spawnContainer({ image: 'postgres:16', name: 'db' });

    await dso.destroyAll();

    expect(dso.getContainers()).toHaveLength(0);
  });
});

// =============================================================================
// Resource Limits Edge Cases
// =============================================================================

describe('DSOOrchestrator — resource limits', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle partial limits (cpu only)', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'cpu-only',
      limits: { cpuCores: 4 },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          NanoCpus: 4e9,
          Memory: DEFAULT_RESOURCE_LIMITS.memoryMb * 1024 * 1024,
        }),
      }),
    );
  });

  it('should handle partial limits (memory only)', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'mem-only',
      limits: { memoryMb: 512 },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          NanoCpus: DEFAULT_RESOURCE_LIMITS.cpuCores * 1e9,
          Memory: 512 * 1024 * 1024,
        }),
      }),
    );
  });

  it('should handle zero limits', async () => {
    await dso.spawnContainer({
      image: 'node:22-alpine',
      name: 'zero-limits',
      limits: { cpuCores: 0, memoryMb: 0 },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          NanoCpus: 0,
          Memory: 0,
        }),
      }),
    );
  });
});

// =============================================================================
// Network Edge Cases
// =============================================================================

describe('DSOOrchestrator — network edge cases', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle 409 conflict when no matching network found', async () => {
    mockDocker.createNetwork.mockRejectedValueOnce({ statusCode: 409 });
    mockDocker.listNetworks.mockResolvedValueOnce([]);

    await expect(dso.createNetwork('missing-net')).rejects.toThrow('Failed to create network');
  });

  it('should create multiple networks', async () => {
    const id1 = await dso.createNetwork('frontend');
    const id2 = await dso.createNetwork('backend');

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(mockDocker.createNetwork).toHaveBeenCalledTimes(2);
  });

  it('should spawn container without network', async () => {
    // No network created
    await dso.spawnContainer({ image: 'node:22-alpine', name: 'standalone' });

    expect(mockNetwork.connect).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Stats Edge Cases
// =============================================================================

describe('DSOOrchestrator — stats', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should compute CPU percent correctly', async () => {
    const stats = await dso.getStats('test-container');

    // CPU formula: (100000 - 50000) / (1000000 - 500000) * 2 * 100 = 20%
    expect(stats.cpuPercent).toBe(20);
  });

  it('should compute memory in MB correctly', async () => {
    const stats = await dso.getStats('test-container');

    expect(stats.memoryUsageMb).toBe(512);
    expect(stats.memoryLimitMb).toBe(2048);
  });

  it('should aggregate network bytes', async () => {
    const stats = await dso.getStats('test-container');

    expect(stats.networkRxBytes).toBe(1024);
    expect(stats.networkTxBytes).toBe(512);
  });

  it('should read block I/O stats', async () => {
    const stats = await dso.getStats('test-container');

    expect(stats.blockReadBytes).toBe(4096);
    expect(stats.blockWriteBytes).toBe(2048);
  });

  it('should have timestamp', async () => {
    const stats = await dso.getStats('test-container');

    expect(stats.timestamp).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Cleanup Orphans — Edge Cases
// =============================================================================

describe('DSOOrchestrator — cleanupOrphans edge cases', () => {
  let dso: DSOOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallCount = 0;
    dso = new DSOOrchestrator();
  });

  it('should handle cleanup when docker listContainers fails', async () => {
    mockDocker.listContainers.mockRejectedValueOnce(new Error('daemon not running'));

    const cleaned = await dso.cleanupOrphans();
    expect(cleaned).toBe(0);
  });

  it('should handle already-stopped orphan containers', async () => {
    mockDocker.listContainers.mockResolvedValueOnce([
      {
        Id: 'stopped-orphan',
        State: 'exited',
        Names: ['/stopped-orphan'],
        Labels: { [GHITA_SANDBOX_LABEL]: 'old-sandbox' },
      },
    ]);

    const cleaned = await dso.cleanupOrphans();

    expect(cleaned).toBe(1);
    // Should not try to stop an already-stopped container
  });

  it('should handle stop failure on orphan gracefully', async () => {
    const orphanContainer = createMockContainer('orphan-fail');
    orphanContainer.stop.mockRejectedValueOnce(new Error('cannot stop'));
    mockDocker.getContainer.mockReturnValueOnce(orphanContainer as any);

    mockDocker.listContainers.mockResolvedValueOnce([
      {
        Id: 'orphan-fail',
        State: 'running',
        Names: ['/orphan-fail'],
        Labels: { [GHITA_SANDBOX_LABEL]: 'old-sandbox' },
      },
    ]);

    const cleaned = await dso.cleanupOrphans();
    expect(cleaned).toBe(0); // Failed to clean
  });
});

// =============================================================================
// SandboxLogger — Advanced Tests
// =============================================================================

describe('SandboxLogger — advanced', () => {
  let logger: SandboxLogger;

  beforeEach(() => {
    logger = new SandboxLogger();
  });

  it('should handle empty getLogs', () => {
    expect(logger.getLogs()).toEqual([]);
  });

  it('should return logs in insertion order (newest first in memory)', () => {
    logger.log({
      containerId: 'c1',
      containerName: 'first',
      event: 'start',
      message: 'first',
      timestamp: new Date(1000),
    });
    logger.log({
      containerId: 'c2',
      containerName: 'second',
      event: 'start',
      message: 'second',
      timestamp: new Date(2000),
    });

    const logs = logger.getLogs();
    expect(logs.length).toBe(2);
  });

  it('should filter logs by event type correctly', () => {
    for (const event of ['start', 'stop', 'error', 'health', 'resource'] as const) {
      logger.log({
        containerId: 'c1',
        containerName: 'c',
        event,
        message: `${event} event`,
        timestamp: new Date(),
      });
    }

    expect(logger.getLogsByEvent('start')).toHaveLength(1);
    expect(logger.getLogsByEvent('stop')).toHaveLength(1);
    expect(logger.getLogsByEvent('error')).toHaveLength(1);
    expect(logger.getLogsByEvent('health')).toHaveLength(1);
    expect(logger.getLogsByEvent('resource')).toHaveLength(1);
  });

  it('should handle getLogsByContainer with no matches', () => {
    logger.log({
      containerId: 'c1',
      containerName: 'c',
      event: 'start',
      message: 'test',
      timestamp: new Date(),
    });

    expect(logger.getLogsByContainer('nonexistent')).toEqual([]);
  });

  it('should handle getLogsByEvent with no matches', () => {
    logger.log({
      containerId: 'c1',
      containerName: 'c',
      event: 'start',
      message: 'test',
      timestamp: new Date(),
    });

    expect(logger.getLogsByEvent('error')).toEqual([]);
  });

  it('getSessionSummary should handle empty logs', () => {
    const summary = logger.getSessionSummary();
    expect(summary.totalLogs).toBe(0);
    expect(summary.startEvents).toBe(0);
    expect(summary.errorEvents).toBe(0);
    expect(summary.uniqueContainers).toBe(0);
  });

  it('getSessionSummary should count unique containers', () => {
    logger.log({
      containerId: 'c1',
      containerName: 'a',
      event: 'start',
      message: 'a',
      timestamp: new Date(),
    });
    logger.log({
      containerId: 'c2',
      containerName: 'b',
      event: 'start',
      message: 'b',
      timestamp: new Date(),
    });
    logger.log({
      containerId: 'c1',
      containerName: 'a',
      event: 'stop',
      message: 'a stop',
      timestamp: new Date(),
    });

    const summary = logger.getSessionSummary();
    expect(summary.totalLogs).toBe(3);
    expect(summary.uniqueContainers).toBe(2);
    expect(summary.startEvents).toBe(2);
    expect(summary.stopEvents).toBe(1);
  });

  it('computeResourceSummary should handle empty array', () => {
    const summary = SandboxLogger.computeResourceSummary([]);
    expect(summary.totalCpuPercent).toBe(0);
    expect(summary.totalMemoryUsageMb).toBe(0);
    expect(summary.totalMemoryLimitMb).toBe(0);
    expect(summary.containerCount).toBe(0);
  });

  it('computeResourceSummary should handle single container', () => {
    const stats: ContainerStats[] = [
      {
        containerId: 'c1',
        cpuPercent: 75,
        memoryUsageMb: 1024,
        memoryLimitMb: 2048,
        networkRxBytes: 5000,
        networkTxBytes: 2000,
        blockReadBytes: 1000,
        blockWriteBytes: 500,
        timestamp: new Date(),
      },
    ];

    const summary = SandboxLogger.computeResourceSummary(stats);
    expect(summary.totalCpuPercent).toBe(75);
    expect(summary.totalMemoryUsageMb).toBe(1024);
    expect(summary.containerCount).toBe(1);
  });

  it('should handle maxLogs correctly with fixed constructor', () => {
    const smallLogger = new SandboxLogger({ maxLogs: 3 });

    for (let i = 0; i < 5; i++) {
      smallLogger.log({
        containerId: 'test',
        containerName: 'c',
        event: 'start',
        message: `log ${i}`,
        timestamp: new Date(),
      });
    }

    expect(smallLogger.getLogs()).toHaveLength(3);
    // Should keep the last 3 (newest)
    expect(smallLogger.getLogs()[0].message).toBe('log 2');
    expect(smallLogger.getLogs()[2].message).toBe('log 4');
  });

  it('should handle maxLogs of 1', () => {
    const tinyLogger = new SandboxLogger({ maxLogs: 1 });

    tinyLogger.log({
      containerId: 'c1',
      containerName: 'a',
      event: 'start',
      message: 'first',
      timestamp: new Date(),
    });
    tinyLogger.log({
      containerId: 'c2',
      containerName: 'b',
      event: 'start',
      message: 'second',
      timestamp: new Date(),
    });

    expect(tinyLogger.getLogs()).toHaveLength(1);
    expect(tinyLogger.getLogs()[0].message).toBe('second');
  });

  it('should store metadata in log entries', () => {
    logger.log({
      containerId: 'c1',
      containerName: 'c',
      event: 'start',
      message: 'test',
      timestamp: new Date(),
      metadata: { ports: [{ containerPort: 80, hostPort: 8080 }] },
    });

    const logs = logger.getLogs();
    expect(logs[0].metadata).toBeDefined();
  });

  it('should handle log with all event types', () => {
    const events: SandboxLogEntry['event'][] = ['start', 'stop', 'error', 'health', 'resource'];

    for (const event of events) {
      logger.log({
        containerId: 'c1',
        containerName: 'c',
        event,
        message: `${event} msg`,
        timestamp: new Date(),
      });
    }

    expect(logger.getLogs()).toHaveLength(5);
  });
});

// =============================================================================
// Types & Constants
// =============================================================================

describe('DSO Types & Constants', () => {
  it('GHITA_SANDBOX_LABEL should be correct', () => {
    expect(GHITA_SANDBOX_LABEL).toBe('ghita-sandbox-id');
  });

  it('DEFAULT_RESOURCE_LIMITS should have correct values', () => {
    expect(DEFAULT_RESOURCE_LIMITS.cpuCores).toBe(2);
    expect(DEFAULT_RESOURCE_LIMITS.memoryMb).toBe(2048);
    expect(DEFAULT_RESOURCE_LIMITS.diskMb).toBe(0);
  });

  it('DEFAULT_RESOURCE_LIMITS should be a complete Required<ResourceLimits>', () => {
    expect(DEFAULT_RESOURCE_LIMITS).toHaveProperty('cpuCores');
    expect(DEFAULT_RESOURCE_LIMITS).toHaveProperty('memoryMb');
    expect(DEFAULT_RESOURCE_LIMITS).toHaveProperty('diskMb');
  });
});
