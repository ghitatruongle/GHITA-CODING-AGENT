/**

 *
 * Two-pronged pruning strategy:
 *   1. Cohesion: small/weakly-connected communities are demoted.
 *   2. Freshness: nodes whose last-access is older than maxAgeMs.
 */

import type { AssociationList } from './associations.js';
import { detectCommunities } from './community.js';
import { nodeDegree } from './associations.js';

export interface FreshnessSignal {
  lastAccess: Map<string, number>;
  now: number;
}

export interface PruneOptions {
  cohesionMinSize?: number;
  cohesionMinDegree?: number;
  maxAgeMs?: number;
}

export interface PruneResult {
  toRemove: string[];
  cohesionDropped: string[];
  freshnessDropped: string[];
}

export function pruneGraph(
  graph: AssociationList,
  freshness: FreshnessSignal,
  options: PruneOptions = {},
): PruneResult {
  const cohesionMinSize = options.cohesionMinSize ?? 1;
  const cohesionMinDegree = options.cohesionMinDegree ?? 1;
  const maxAgeMs = options.maxAgeMs;

  const cohesionDropped = new Set<string>();
  const freshnessDropped = new Set<string>();

  const communities = detectCommunities(graph);
  for (const c of communities.communities) {
    if (c.size <= cohesionMinSize) {
      for (const m of c.members) {
        if (nodeDegree(graph, m) < Math.max(2, cohesionMinDegree + 1)) {
          cohesionDropped.add(m);
        }
      }
    } else {
      for (const m of c.members) {
        if (nodeDegree(graph, m) < cohesionMinDegree) {
          cohesionDropped.add(m);
        }
      }
    }
  }

  if (typeof maxAgeMs === 'number' && maxAgeMs > 0) {
    for (const [id, last] of freshness.lastAccess.entries()) {
      if (freshness.now - last > maxAgeMs) freshnessDropped.add(id);
    }
  }

  const toRemove = Array.from(new Set<string>([...cohesionDropped, ...freshnessDropped]));
  return {
    toRemove,
    cohesionDropped: Array.from(cohesionDropped),
    freshnessDropped: Array.from(freshnessDropped),
  };
}
