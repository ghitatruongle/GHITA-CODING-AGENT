// ==============================================================================
// GHITA CODING AGENT - Memory v1.1.0 Track 6: public entry
// ==============================================================================

export { MemoryCaptureHooks } from './hooks.js';
export type { CaptureHook, CaptureEvent, CaptureSink, DedupOptions } from './hooks.js';

export { ContradictionDetector, SupersedeTracker, cosine } from './contradiction.js';
export type {
  MemoryText,
  ResolutionAction,
  ContradictionResult,
  Embedder,
  ContradictionDetectorOptions,
} from './contradiction.js';

export { ProvenanceStore, snapshotHash } from './provenance.js';
export type { Namespace, ProvenanceRecord } from './provenance.js';
