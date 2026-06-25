// ==============================================================================
// @ghita/integration -- Service Registry
// ==============================================================================

import type { ServiceDefinition, ServiceHealth } from './types.js';

export class ServiceRegistry {
  private readonly services = new Map<string, ServiceDefinition>();

  register(service: ServiceDefinition): void {
    this.services.set(service.name, service);
  }

  unregister(name: string): void {
    this.services.delete(name);
  }

  get(name: string): ServiceDefinition | undefined {
    return this.services.get(name);
  }

  getAll(): readonly ServiceDefinition[] {
    return [...this.services.values()];
  }

  async checkHealth(name: string): Promise<ServiceHealth> {
    const service = this.services.get(name);
    if (!service) {
      return { name, status: 'unhealthy', latencyMs: 0, details: { error: 'Not found' } };
    }
    if (!service.healthCheck) {
      return { name, status: 'healthy', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const result = await service.healthCheck();
      return { ...result, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        details: { error: String(error) },
      };
    }
  }

  async checkAll(): Promise<readonly ServiceHealth[]> {
    const promises = [...this.services.keys()].map((name) => this.checkHealth(name));
    return Promise.all(promises);
  }
}
