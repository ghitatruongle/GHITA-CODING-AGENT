// Diff-stat for AI edit badges. Inside the Tauri WebView the native
// `line_diff_stat_command` (off-thread LCS) is the single compute path — the
// O(n·m) JS version only runs as a fallback in non-Tauri runtimes or when the
// invoke fails. Safe inside map() rows because the hook lives in its own
// component (see DiffStatBadge).

import { useEffect, useState } from 'react';
import { lineDiffStat, type DiffStat } from '../utils/editProposal';
import { lineDiffStatNative } from '../utils/nativeDiff';

/** True inside the Tauri WebView where the native diff command exists. */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const EMPTY_STAT: DiffStat = { added: 0, removed: 0, unchanged: false };

export function useLineDiffStat(original: string, proposed: string): DiffStat {
  // No eager JS computation when the native path is available — computing the
  // diff twice (JS sync + native async) wasted a full O(n·m) pass per render.
  const [stat, setStat] = useState<DiffStat>(() =>
    isTauriRuntime() ? EMPTY_STAT : lineDiffStat(original, proposed),
  );

  useEffect(() => {
    let cancelled = false;
    lineDiffStatNative(original, proposed).then((native) => {
      if (!cancelled) setStat(native);
    });
    return () => {
      cancelled = true;
    };
  }, [original, proposed]);

  return stat;
}
