/**

 *
 * Each node starts as its own community. At every iteration, each
 * node adopts the most-frequent label among its neighbors, breaking
 * ties lexicographically. Runs until convergence or maxIterations.
 */

import type { AssociationList } from './associations.js';

export interface Community {
  id: number;
  members: string[];
  size: number;
}

export interface CommunityResult {
  labels: Map<string, number>;
  communities: Community[];
  iterations: number;
}

export function detectCommunities(
  graph: AssociationList,
  options: { maxIterations?: number } = {},
): CommunityResult {
  const maxIterations = options.maxIterations ?? 10;
  const nodeIds = new Set<string>();
  for (const id of graph.adjacency.keys()) nodeIds.add(id);
  for (const id of graph.incoming.keys()) nodeIds.add(id);

  const undirected = new Map<string, Set<string>>();
  for (const id of nodeIds) undirected.set(id, new Set());
  for (const [from, assocs] of graph.adjacency.entries()) {
    for (const a of assocs) {
      let fromSet = undirected.get(from);
      if (!fromSet) {
        fromSet = new Set();
        undirected.set(from, fromSet);
      }
      fromSet.add(a.to);

      let toSet = undirected.get(a.to);
      if (!toSet) {
        toSet = new Set();
        undirected.set(a.to, toSet);
      }
      toSet.add(from);
    }
  }

  const labels = new Map<string, string>();
  for (const id of nodeIds) labels.set(id, id);

  let iterations = 0;
  let changed = true;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations += 1;
    const ids = Array.from(nodeIds);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = (i * 9301 + 49297) % (i + 1);
      const valI = ids[i] as string;
      const valJ = ids[j] as string;
      [ids[i], ids[j]] = [valJ, valI];
    }
    for (const id of ids) {
      const neighbors = undirected.get(id) ?? new Set();
      if (neighbors.size === 0) continue;
      const counts = new Map<string, number>();
      for (const n of neighbors) {
        const lbl = labels.get(n) ?? n;
        counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
      }
      const sorted = Array.from(counts.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      });
      const bestMatch = sorted[0];
      const bestLabel = bestMatch ? bestMatch[0] : id;
      if (bestLabel !== labels.get(id)) {
        labels.set(id, bestLabel);
        changed = true;
      }
    }
  }

  const communityMembers = new Map<string, string[]>();
  for (const [node, label] of labels.entries()) {
    let arr = communityMembers.get(label);
    if (!arr) {
      arr = [];
      communityMembers.set(label, arr);
    }
    arr.push(node);
  }
  const sortedLabels = Array.from(communityMembers.keys()).sort();
  const labelToId = new Map<string, number>();
  sortedLabels.forEach((lbl, idx) => labelToId.set(lbl, idx));
  const labelsNumeric = new Map<string, number>();
  for (const [node, label] of labels.entries()) {
    labelsNumeric.set(node, labelToId.get(label) ?? 0);
  }
  const communities: Community[] = sortedLabels.map((lbl, idx) => {
    const members = communityMembers.get(lbl) ?? [];
    return { id: idx, members, size: members.length };
  });
  return { labels: labelsNumeric, communities, iterations };
}
