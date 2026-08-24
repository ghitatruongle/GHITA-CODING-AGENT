// Implements the 5 routing strategies for the load balancer.

import type {
  HealthSnapshot,
  LoadBalancedProvider,
  LoadBalancingStrategy,
  RoutingDecision,
} from './types.js';

// Eligible candidate filter

export function filterEligible(
  providers: LoadBalancedProvider[],
  health: Map<string, HealthSnapshot>,
  tag?: string,
): LoadBalancedProvider[] {
  return providers.filter((p) => {
    if (!p.enabled) return false;
    const h = health.get(p.id);
    if (h && h.state === 'unhealthy') return false;
    if (tag && !p.tags.includes(tag)) return false;
    return true;
  });
}

// Pick using the active strategy

export function pickProvider(
  providers: LoadBalancedProvider[],
  health: Map<string, HealthSnapshot>,
  strategy: LoadBalancingStrategy,
  rng: () => number = Math.random,
  state: { roundRobinIndex: number } = { roundRobinIndex: 0 },
): RoutingDecision {
  const t0 = Date.now();
  const eligible = filterEligible(providers, health);

  if (eligible.length === 0) {
    throw new Error('No eligible providers in pool');
  }

  let chosen: LoadBalancedProvider | undefined = undefined;
  let reason: RoutingDecision['reason'];

  switch (strategy) {
    case 'round-robin': {
      const idx = state.roundRobinIndex % eligible.length;
      chosen = eligible[idx] as LoadBalancedProvider;
      state.roundRobinIndex++;
      reason = 'round-robin';
      break;
    }

    case 'weighted': {
      const totalWeight = eligible.reduce((s, p) => s + Math.max(0.01, p.weight), 0);
      let r = rng() * totalWeight;
      for (const p of eligible) {
        r -= Math.max(0.01, p.weight);
        if (r <= 0) {
          chosen = p;
          break;
        }
      }
      chosen = chosen ?? (eligible[eligible.length - 1] as LoadBalancedProvider);
      reason = 'weighted-random';
      break;
    }

    case 'least-loaded': {
      // Lower concurrent requests = better
      const sorted = [...eligible].sort((a, b) => {
        const ha = health.get(a.id);
        const hb = health.get(b.id);
        const la = ha?.consecutiveSuccesses ?? 0;
        const lb = hb?.consecutiveSuccesses ?? 0;
        return la - lb;
      });
      chosen = sorted[0] as LoadBalancedProvider;
      reason = 'least-loaded';
      break;
    }

    case 'fastest': {
      const sorted = [...eligible].sort((a, b) => {
        const ha = health.get(a.id);
        const hb = health.get(b.id);
        const la = ha?.averageLatencyMs ?? Number.MAX_SAFE_INTEGER;
        const lb = hb?.averageLatencyMs ?? Number.MAX_SAFE_INTEGER;
        return la - lb;
      });
      chosen = sorted[0] as LoadBalancedProvider;
      reason = 'fastest-ema';
      break;
    }

    case 'priority': {
      const sorted = [...eligible].sort((a, b) => a.priority - b.priority);
      chosen = sorted[0] as LoadBalancedProvider;
      reason = 'priority-order';
      break;
    }
  }

  return {
    provider: chosen as LoadBalancedProvider,
    reason,
    decisionLatencyMs: Date.now() - t0,
    candidates: eligible.length,
    poolSnapshot: providers.map((p) => p.id),
  };
}
