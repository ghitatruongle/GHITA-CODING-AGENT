// ==============================================================================
// v1.1.1 Track 8: DiffStatBadge — "+added -removed" chip, native-first
// ==============================================================================
// Shared by EditProposalTray rows and the CodeView header. Renders the JS
// stat instantly, then the native (off-thread) result when available.
// ==============================================================================

import type { CSSProperties } from 'react';
import { useLineDiffStat } from '../hooks/useLineDiffStat';

const BADGE_STYLE: CSSProperties = { fontSize: '11px', fontFamily: 'monospace' };

export function DiffStatBadge({
  original,
  proposed,
}: {
  original: string;
  proposed: string;
}): React.JSX.Element {
  const stat = useLineDiffStat(original, proposed);
  return (
    <span style={BADGE_STYLE}>
      <span style={{ color: 'var(--success)' }}>+{stat.added}</span>{' '}
      <span style={{ color: 'var(--error)' }}>-{stat.removed}</span>
    </span>
  );
}
