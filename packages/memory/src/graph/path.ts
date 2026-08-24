/**

 *
 * Computes the shortest association path between two entities in a
 * weighted graph. BFS is used when all edges are unweighted;
 * Dijkstra is used when any edge carries a positive numeric weight.
 */

import type { AssociationList, Association } from './associations.js';

export interface PathNode {
  id: string;
  depth: number;
  cost: number;
  parent: string | null;
  via: Association | null;
}

export interface PathResult {
  nodes: string[];
  associations: Association[];
  totalCost: number;
  weighted: boolean;
}

class MinHeap<T> {
  private readonly data: T[] = [];
  constructor(private readonly cmp: (a: T, b: T) => number) {}
  size() {
    return this.data.length;
  }
  push(v: T) {
    this.data.push(v);
    this._bubbleUp(this.data.length - 1);
  }
  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0] as T;
    const last = this.data.pop() as T;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  private _bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const dI = this.data[i] as T;
      const dP = this.data[parent] as T;
      if (this.cmp(dI, dP) >= 0) break;
      [this.data[i], this.data[parent]] = [dP, dI];
      i = parent;
    }
  }
  private _sinkDown(i: number) {
    const n = this.data.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let best = i;
      let dBest = this.data[best] as T;
      if (l < n) {
        const dL = this.data[l] as T;
        if (this.cmp(dL, dBest) < 0) {
          best = l;
          dBest = dL;
        }
      }
      if (r < n) {
        const dR = this.data[r] as T;
        if (this.cmp(dR, dBest) < 0) {
          best = r;
          dBest = dR;
        }
      }
      if (best === i) break;
      const dI = this.data[i] as T;
      [this.data[i], this.data[best]] = [dBest, dI];
      i = best;
    }
  }
}

export function bfsPath(graph: AssociationList, source: string, target: string): PathResult | null {
  if (source === target)
    return { nodes: [source], associations: [], totalCost: 0, weighted: false };
  const visited = new Map<string, PathNode>();
  visited.set(source, { id: source, depth: 0, cost: 0, parent: null, via: null });
  const queue: string[] = [source];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const outgoing = graph.adjacency.get(current) ?? [];
    for (const assoc of outgoing) {
      if (visited.has(assoc.to)) continue;
      const currNode = visited.get(current);
      visited.set(assoc.to, {
        id: assoc.to,
        depth: (currNode?.depth ?? 0) + 1,
        cost: (currNode?.cost ?? 0) + 1,
        parent: current,
        via: assoc,
      });
      if (assoc.to === target) return reconstruct(visited, target, false);
      queue.push(assoc.to);
    }
  }
  return null;
}

export function dijkstraPath(
  graph: AssociationList,
  source: string,
  target: string,
): PathResult | null {
  if (source === target) return { nodes: [source], associations: [], totalCost: 0, weighted: true };
  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; via: Association } | null>();
  dist.set(source, 0);
  prev.set(source, null);
  const heap = new MinHeap<{ id: string; d: number }>((a, b) => a.d - b.d);
  heap.push({ id: source, d: 0 });
  while (heap.size() > 0) {
    const { id, d } = heap.pop() as { id: string; d: number };
    if (d > (dist.get(id) ?? Infinity)) continue;
    if (id === target) break;
    const outgoing = graph.adjacency.get(id) ?? [];
    for (const assoc of outgoing) {
      const w = assoc.weight ?? 1;
      const next = d + w;
      if (next < (dist.get(assoc.to) ?? Infinity)) {
        dist.set(assoc.to, next);
        prev.set(assoc.to, { from: id, via: assoc });
        heap.push({ id: assoc.to, d: next });
      }
    }
  }
  if (!dist.has(target)) return null;
  const visited = new Map<string, PathNode>();
  let cursor: string | null = target;
  const cost = dist.get(target) ?? 0;
  while (cursor) {
    const p = prev.get(cursor);
    visited.set(cursor, {
      id: cursor,
      depth: 0,
      cost,
      parent: p ? p.from : null,
      via: p ? p.via : null,
    });
    cursor = p ? p.from : null;
  }
  return reconstruct(visited, target, true);
}

function reconstruct(
  visited: Map<string, PathNode>,
  target: string,
  weighted: boolean,
): PathResult {
  const nodes: string[] = [];
  const associations: Association[] = [];
  let cursor: string | null = target;
  while (cursor) {
    nodes.unshift(cursor);
    const node = visited.get(cursor);
    if (!node) break;
    if (node.via) associations.unshift(node.via);
    cursor = node.parent;
  }
  const totalCost = visited.get(target)?.cost ?? 0;
  return { nodes, associations, totalCost, weighted };
}

export function findConnectionPath(
  graph: AssociationList,
  source: string,
  target: string,
): PathResult | null {
  const fn = graph.hasWeights ? dijkstraPath : bfsPath;
  return fn(graph, source, target);
}

export function findAllPaths(
  graph: AssociationList,
  source: string,
  target: string,
  maxLength: number,
): PathResult[] {
  const out: PathResult[] = [];
  const dfs = (
    current: string,
    visited: Set<string>,
    path: string[],
    acc: Association[],
    cost: number,
  ) => {
    if (path.length > maxLength) return;
    if (current === target && path.length > 1) {
      out.push({
        nodes: [...path],
        associations: [...acc],
        totalCost: cost,
        weighted: graph.hasWeights,
      });
      return;
    }
    const outgoing = graph.adjacency.get(current) ?? [];
    for (const assoc of outgoing) {
      if (visited.has(assoc.to)) continue;
      visited.add(assoc.to);
      path.push(assoc.to);
      acc.push(assoc);
      dfs(assoc.to, visited, path, acc, cost + (assoc.weight ?? 1));
      acc.pop();
      path.pop();
      visited.delete(assoc.to);
    }
  };
  dfs(source, new Set([source]), [source], [], 0);
  return out;
}
