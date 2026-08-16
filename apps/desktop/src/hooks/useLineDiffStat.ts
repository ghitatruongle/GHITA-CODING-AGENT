// ==============================================================================
// v1.1.1 Track 8: useLineDiffStat — async diff-stat with instant fallback
// ==============================================================================
// Renders the JS-computed stat immediately (no layout shift), then swaps in
// the native result when the Tauri command resolves. Safe inside map() rows
// because the hook lives in its own component (see DiffStatBadge).
// ==============================================================================

import { useEffect, useState } from 'react';
import { lineDiffStat, type DiffStat } from '../utils/editProposal';
import { lineDiffStatNative } from '../utils/nativeDiff';

export function useLineDiffStat(original: string, proposed: string): DiffStat {
  const [stat, setStat] = useState<DiffStat>(() => lineDiffStat(original, proposed));

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
