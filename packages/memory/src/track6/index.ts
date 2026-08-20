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

// ── v1.1.5-beta1 Track 6: Memory v2 ──
export { ConsolidationEngine, DreamLock, DEFAULT_CONSOLIDATION_CONFIG } from './consolidation.js';
export type {
  ConsolidatedMemoryTier,
  EpisodicEntry,
  ProceduralEntry,
  ConsolidationConfig,
  ConsolidationResult,
} from './consolidation.js';
export { selectForInjection } from './precompact.js';
export type { PreCompactContext, PreCompactResult } from './precompact.js';
export { rrfFuse, fuseRetrievalStreams, DEFAULT_RRF_OPTIONS } from './rrf-fusion.js';
export type { RankedResult, RRFFusionOptions } from './rrf-fusion.js';
export { reflectOnSession, promoteSeedToReview, shouldPromoteSeed } from './hindsight.js';
export type { SessionReflection, SkillSeed, HindsightConfig } from './hindsight.js';
export { loadDocument, detectMimeType } from './docloader.js';
export type { DocLoadResult, DocLoaderOptions } from './docloader.js';
