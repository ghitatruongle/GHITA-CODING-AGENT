// ==============================================================================
// GHITA CODING AGENT — Throttle Utility
// ==============================================================================

/**
 * Creates a throttled function that only invokes the provided function at most once
 * per every `limit` milliseconds. The throttled function will execute on the leading
 * edge and will schedule a trailing-edge execution if called during the lock period.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastFunc: ReturnType<typeof setTimeout> | null = null;
  let lastRan: number | null = null;

  return function (this: any, ...args: Parameters<T>): void {
    const context = this;
    if (lastRan === null) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      if (lastFunc) {
        clearTimeout(lastFunc);
      }
      const remaining = limit - (Date.now() - lastRan);
      if (remaining <= 0) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        lastFunc = setTimeout(() => {
          func.apply(context, args);
          lastRan = Date.now();
          lastFunc = null;
        }, remaining);
      }
    }
  };
}
