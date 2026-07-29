// ==============================================================================
// v0.4.9 A9: Memory Decay & Reinforcement
//
// Models a "memory strength" that grows each time a memory is accessed
// (reinforcement, with diminishing returns) and fades over time (exponential
// decay).
//
// Strength is stored in a memory entry's metadata under `_strength` and the
// last reinforcement time under `_lastReinforced`. These are additive to the
// existing `_accessCount` / `_lastAccessed` / `_importance` signals.
// ==============================================================================

/** Default reinforcement/decay parameters. */
export const DEFAULT_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_REINFORCE_GAIN = 0.2;
export const MAX_STRENGTH = 1;
export const MIN_STRENGTH = 0;

export interface ReinforcementOptions {
  /** Time for strength to halve with no access. Default 7 days. */
  halfLifeMs?: number;
  /** Additive gain per reinforcement (before diminishing returns). Default 0.2. */
  gain?: number;
}

/**
 * Apply exponential time decay to a strength value.
 * strength(t) = strength0 * 0.5 ^ (elapsed / halfLife).
 */
export function decayStrength(
  strength: number,
  elapsedMs: number,
  halfLifeMs: number = DEFAULT_HALF_LIFE_MS,
): number {
  if (elapsedMs <= 0 || halfLifeMs <= 0) return clamp(strength);
  const decayed = strength * Math.pow(0.5, elapsedMs / halfLifeMs);
  return clamp(decayed);
}

/**
 * Reinforce a (possibly decayed) strength value. Uses diminishing returns so
 * strength asymptotically approaches MAX_STRENGTH rather than overshooting.
 */
export function reinforceStrength(
  current: number,
  options: ReinforcementOptions = {},
): number {
  const gain = options.gain ?? DEFAULT_REINFORCE_GAIN;
  // Diminishing returns: the closer to MAX, the smaller the increment.
  const headroom = MAX_STRENGTH - clamp(current);
  return clamp(current + gain * headroom);
}

/**
 * Compute the effective strength of a memory *now*, decaying the stored value
 * from the time it was last reinforced.
 */
export function effectiveStrength(
  storedStrength: number,
  lastReinforced: number,
  now: number,
  options: ReinforcementOptions = {},
): number {
  return decayStrength(storedStrength, now - lastReinforced, options.halfLifeMs);
}

/**
 * Reinforce a metadata bag in place-ish (returns a new bag): decays the current
 * strength up to `now`, then reinforces it, and records `_lastReinforced`.
 */
export function reinforceMetadata(
  metadata: Record<string, unknown>,
  now: number,
  options: ReinforcementOptions = {},
): Record<string, unknown> {
  const stored = typeof metadata['_strength'] === 'number' ? (metadata['_strength'] as number) : 0;
  const lastReinforced =
    typeof metadata['_lastReinforced'] === 'number'
      ? (metadata['_lastReinforced'] as number)
      : now;
  const decayed = effectiveStrength(stored, lastReinforced, now, options);
  const reinforced = reinforceStrength(decayed, options);
  return { ...metadata, _strength: reinforced, _lastReinforced: now };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return MIN_STRENGTH;
  return Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, value));
}
