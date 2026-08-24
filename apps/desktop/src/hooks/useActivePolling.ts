// useActivePolling — polling that pauses when the tab is hidden or unfocused

// Several live views poll on a fixed interval. When the window is hidden or
// the view is not the active tab, those intervals keep firing and waste CPU.
// This hook keeps a single interval alive but only invokes `fn` while:
//   1. the document is visible (document.visibilityState === 'visible'), and
//   2. the view is the active App tab (when `activeTabKey` is provided).
// The first call still happens immediately so the view is never stale.

import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { TabId } from '../stores/appStore';

export function useActivePolling(
  ms: number,
  fn: () => void | Promise<void>,
  activeTabKey?: TabId,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const activeTab = useAppStore((s) => s.activeTab);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let disposed = false;

    const isEligible = () =>
      document.visibilityState === 'visible' &&
      (activeTabKey === undefined || activeTab === activeTabKey);

    const tick = () => {
      if (disposed) return;
      if (isEligible()) {
        void fnRef.current();
      }
    };

    // Fire once immediately so the first paint is not blank (only when the
    // view is actually the active tab).
    if (isEligible()) {
      void fnRef.current();
    }
    const interval = setInterval(tick, ms);
    // Reuse tick() on visibility changes so the tab-eligibility check is
    // honored and the poll does not double-fire with the interval.
    document.addEventListener('visibilitychange', tick);

    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
    // activeTab is intentionally a dependency: switching tabs to/from this
    // view should re-evaluate eligibility immediately.
  }, [ms, activeTab, activeTabKey]);
}
