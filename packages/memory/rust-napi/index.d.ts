/* auto-generated from rust-napi/src/{cosine,hnsw,decay}.rs */

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number;

/** Batch cosine similarity: one query against many candidates (rayon parallel). */
export function batchCosineSimilarity(query: number[], candidates: number[][]): number[];

/** Entry for batch HNSW insert. */
export interface HnswEntry {
  id: string;
  vector: number[];
}

/** Search result from HNSW index. */
export interface HnswSearchResult {
  id: string;
  score: number;
}

/** HNSW approximate nearest-neighbor index (cosine distance). */
export class HnswIndex {
  /** Create a new HNSW index. */
  constructor(dim: number, m?: number, efConstruction?: number);

  /** Add a single vector to the index. */
  add(id: string, vector: number[]): void;

  /** Add multiple vectors in batch. */
  addBatch(entries: HnswEntry[]): void;

  /** Search for the k nearest neighbors of a query vector. */
  search(query: number[], topK: number, efSearch?: number): HnswSearchResult[];

  /** Soft-delete a vector by its ID. Returns true if found. */
  remove(id: string): boolean;

  /** Number of active (non-deleted) vectors. */
  size(): number;

  /** Clear the entire index. */
  clear(): void;
}

/** Entry for batch decay scoring. */
export interface DecayEntry {
  id: string;
  score: number;
  timestamp: number;
}

/** Result of decay scoring. */
export interface DecayResult {
  id: string;
  originalScore: number;
  decayedScore: number;
}

/** Apply time-decay scoring to a batch of entries (rayon parallel). */
export function batchDecayScore(
  entries: DecayEntry[],
  halfLifeMs: number,
  now?: number,
): DecayResult[];
