// ==============================================================================
// GHITA CODING AGENT - AI Engine v1.1.0 Track 4 P50: adaptive bandit router
// ==============================================================================
// Thompson-sampling (Beta-Bernoulli) router per (arm × request-type) bucket.
// Learns from completion signals (success/error/latency) instead of static
// heuristics — mirrors LiteLLM's adaptive router.
// ==============================================================================

export type RequestBucket = 'chat' | 'tool' | 'code' | 'embed' | 'image' | 'reasoning' | 'default';

export const REQUEST_BUCKETS: RequestBucket[] = [
  'chat',
  'tool',
  'code',
  'embed',
  'image',
  'reasoning',
  'default',
];

export interface BanditArm {
  id: string;
  /** Human label, e.g. "anthropic:claude-sonnet-4" or "openai:gpt-4o". */
  label: string;
  alpha: number;
  beta: number;
  wins: number;
  losses: number;
  total: number;
  /** Rolling latency in ms. */
  avgLatencyMs: number;
}

export interface ArmStats {
  arm: BanditArm;
  /** Thompson posterior mean. */
  expectedReward: number;
}

export interface BanditRouterConfig {
  /** Exploration probability (default 0.1). */
  epsilon?: number;
  /** Beta prior for new arms. */
  priorAlpha?: number;
  priorBeta?: number;
}

export interface SelectOptions {
  bucket?: RequestBucket;
  /** Candidate arm ids to choose from (all registered arms when omitted). */
  candidates?: string[];
}

export type SignalKind = 'success' | 'error' | 'timeout';

/**
 * Thompson-sampling bandit over LLM arms. For each arm we maintain Beta
 * posterior parameters; selection samples a draw per candidate and picks the
 * highest (with ε exploration). `observe()` updates the posterior.
 */
export class AdaptiveBanditRouter {
  private readonly arms = new Map<string, BanditArm>();
  private readonly epsilon: number;
  private readonly priorAlpha: number;
  private readonly priorBeta: number;

  constructor(config: BanditRouterConfig = {}) {
    this.epsilon = config.epsilon ?? 0.1;
    this.priorAlpha = config.priorAlpha ?? 2;
    this.priorBeta = config.priorBeta ?? 2;
  }

  /** Register (or reset) an arm. */
  registerArm(id: string, label = id): BanditArm {
    const arm: BanditArm = {
      id,
      label,
      alpha: this.priorAlpha,
      beta: this.priorBeta,
      wins: 0,
      losses: 0,
      total: 0,
      avgLatencyMs: 0,
    };
    this.arms.set(id, arm);
    return arm;
  }

  /** Sample one Beta draw for an arm. */
  private sample(arm: BanditArm): number {
    return betaSample(arm.alpha, arm.beta);
  }

  /** Select the next arm (ε-greedy Thompson sampling). */
  select(options: SelectOptions = {}): BanditArm {
    const ids = options.candidates ?? [...this.arms.keys()];
    const eligible = ids.map((id) => this.arms.get(id)).filter((a): a is BanditArm => Boolean(a));

    if (eligible.length === 0) {
      throw new Error('no arms registered for selection');
    }
    const first = eligible[0];
    if (first === undefined) {
      throw new Error('no arms registered for selection');
    }
    if (eligible.length === 1) return first;

    if (Math.random() < this.epsilon) {
      const idx = Math.floor(Math.random() * eligible.length);
      return eligible[idx] ?? first;
    }
    let best = first;
    let bestDraw = -Infinity;
    for (const arm of eligible) {
      const draw = this.sample(arm);
      if (draw > bestDraw) {
        bestDraw = draw;
        best = arm;
      }
    }
    return best;
  }

  /** Record a completion signal for the selected arm. */
  observe(armId: string, kind: SignalKind, latencyMs = 0): void {
    const arm = this.arms.get(armId);
    if (!arm) return;
    arm.total += 1;
    if (kind === 'success') {
      arm.wins += 1;
      arm.alpha += 1;
    } else {
      arm.losses += 1;
      arm.beta += 1;
    }
    if (latencyMs > 0) {
      arm.avgLatencyMs =
        arm.avgLatencyMs === 0
          ? latencyMs
          : Math.round((arm.avgLatencyMs * (arm.total - 1) + latencyMs) / arm.total);
    }
  }

  /** Expected reward per arm (posterior mean), sorted descending. */
  ranking(): ArmStats[] {
    return [...this.arms.values()]
      .map((arm) => ({ arm, expectedReward: arm.alpha / (arm.alpha + arm.beta) }))
      .sort((a, b) => b.expectedReward - a.expectedReward);
  }

  get(armId: string): BanditArm | undefined {
    return this.arms.get(armId);
  }

  armsCount(): number {
    return this.arms.size;
  }
}

/** Deterministic-free Beta sample: ratio of two Gamma samples (Marsaglia-Tsang). */
export function betaSample(alpha: number, beta: number): number {
  if (alpha <= 1 || beta <= 1) {
    // Small-parameter fallback: Gamma(shape,1) via the KT algorithm.
    let x = 0;
    let y = 0;
    do {
      x = Math.pow(Math.random(), 1 / alpha);
      y = Math.pow(Math.random(), 1 / beta);
    } while (x + y > 1);
    return x / (x + y);
  }
  const g1 = gammaSample(alpha);
  const g2 = gammaSample(beta);
  return g1 / (g1 + g2);
}

/** Marsaglia-Tsang Gamma(shape, 1) sampler for shape > 0. */
function gammaSample(shape: number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let u = 0;
    do {
      x = Math.random();
    } while (x === 0);
    u = Math.random();
    const v = Math.pow(1 + c * x, 3);
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
