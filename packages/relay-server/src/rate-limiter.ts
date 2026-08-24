// @ghita/relay-server -- Rate Limiter

export class RateLimiter {
  private readonly counts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  private sweeps = 0;

  check(key: string): boolean {
    const now = Date.now();
    // Evict expired entries periodically — per-device keys otherwise grow
    // unboundedly in the long-running relay process.
    if (++this.sweeps % 64 === 0) {
      for (const [k, v] of this.counts) {
        if (now > v.resetAt) this.counts.delete(k);
      }
    }
    const entry = this.counts.get(key);
    if (!entry || now > entry.resetAt) {
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxRequests) return false;
    entry.count++;
    return true;
  }

  reset(key: string): void {
    this.counts.delete(key);
  }

  getCount(key: string): number {
    return this.counts.get(key)?.count ?? 0;
  }
}
