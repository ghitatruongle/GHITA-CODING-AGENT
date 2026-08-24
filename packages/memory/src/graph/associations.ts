/**

 *
 * Defines the association primitives used by the connection-path and
 * community-detection modules. An Association is a typed, weighted
 * edge between two entities.
 */

export type AssociationType =
  | 'related-to'
  | 'part-of'
  | 'uses'
  | 'depends-on'
  | 'created-by'
  | 'mentioned-in'
  | 'tagged-with'
  | 'follows'
  | 'references';

export interface Association {
  from: string;
  to: string;
  type: AssociationType;
  /** Optional weight. Undefined => unweighted graph (BFS). */
  weight?: number;
  meta?: Record<string, unknown>;
}

export interface AssociationList {
  adjacency: Map<string, Association[]>;
  incoming: Map<string, Association[]>;
  hasWeights: boolean;
}

export interface AssociationListOptions {
  weighted?: boolean;
}

export function createAssociationList(options: AssociationListOptions = {}): AssociationList {
  return {
    adjacency: new Map(),
    incoming: new Map(),
    hasWeights: options.weighted ?? false,
  };
}

export function addAssociation(list: AssociationList, assoc: Association): void {
  let adj = list.adjacency.get(assoc.from);
  if (!adj) {
    adj = [];
    list.adjacency.set(assoc.from, adj);
  }
  adj.push(assoc);

  let inc = list.incoming.get(assoc.to);
  if (!inc) {
    inc = [];
    list.incoming.set(assoc.to, inc);
  }
  inc.push(assoc);
  if (typeof assoc.weight === 'number') list.hasWeights = true;
}

export function addAssociations(list: AssociationList, assocs: Association[]): void {
  for (const a of assocs) addAssociation(list, a);
}

export function nodeDegree(list: AssociationList, nodeId: string): number {
  return (list.adjacency.get(nodeId)?.length ?? 0) + (list.incoming.get(nodeId)?.length ?? 0);
}

export function neighbors(list: AssociationList, nodeId: string): string[] {
  const out = new Set<string>();
  for (const a of list.adjacency.get(nodeId) ?? []) out.add(a.to);
  for (const a of list.incoming.get(nodeId) ?? []) out.add(a.from);
  return Array.from(out);
}

export function totalNodes(list: AssociationList): number {
  const ids = new Set<string>();
  for (const id of list.adjacency.keys()) ids.add(id);
  for (const id of list.incoming.keys()) ids.add(id);
  return ids.size;
}

export function totalAssociations(list: AssociationList): number {
  let n = 0;
  for (const arr of list.adjacency.values()) n += arr.length;
  return n;
}

export function associationsByType(list: AssociationList, type: AssociationType): Association[] {
  const out: Association[] = [];
  for (const arr of list.adjacency.values()) {
    for (const a of arr) if (a.type === type) out.push(a);
  }
  return out;
}
