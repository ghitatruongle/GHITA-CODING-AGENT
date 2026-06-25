// ==============================================================================
// @ghita/relay-server -- Rate Limiter
// ==============================================================================

export class RateLimiter {
  private readonly counts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
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
