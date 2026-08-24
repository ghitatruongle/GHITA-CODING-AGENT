// @ghita/integration -- GhitaCore (Facade)

import { EventBus } from './event-bus.js';
import { ServiceRegistry } from './service-registry.js';
import { HealthCheckAggregator } from './health-check.js';

export class GhitaCore {
  readonly events: EventBus;
  readonly services: ServiceRegistry;
  readonly health: HealthCheckAggregator;

  constructor() {
    this.events = new EventBus();
    this.services = new ServiceRegistry();
    this.health = new HealthCheckAggregator();
  }

  async shutdown(): Promise<void> {
    this.events.removeAllListeners();
  }
}
