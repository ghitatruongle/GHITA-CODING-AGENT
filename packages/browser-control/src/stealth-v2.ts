export interface ConsistencyCheck {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  detail?: string;
}

export interface PreflightReport {
  timestamp: number;
  checks: ConsistencyCheck[];
  overallPass: boolean;
  proxyInfo?: {
    exitIp?: string;
    timezone?: string;
    locale?: string;
  };
}

export function checkTimezoneConsistency(
  proxyTimezone: string,
  browserTimezone: string,
): ConsistencyCheck {
  const passed = proxyTimezone.toLowerCase() === browserTimezone.toLowerCase();
  return {
    name: 'timezone-consistency',
    passed,
    expected: proxyTimezone,
    actual: browserTimezone,
    detail: passed
      ? 'Timezone matches proxy exit location'
      : `Timezone mismatch: proxy=${proxyTimezone}, browser=${browserTimezone}`,
  };
}

/**
 * Check locale consistency between proxy location and browser settings.
 */
export function checkLocaleConsistency(
  proxyLocale: string,
  browserLocale: string,
): ConsistencyCheck {
  const normalize = (l: string) => l.toLowerCase().replace(/_/g, '-');
  const passed = normalize(proxyLocale) === normalize(browserLocale);
  return {
    name: 'locale-consistency',
    passed,
    expected: proxyLocale,
    actual: browserLocale,
    detail: passed
      ? 'Locale matches proxy exit location'
      : `Locale mismatch: proxy=${proxyLocale}, browser=${browserLocale}`,
  };
}

/**
 * Check WebRTC leak: if the browser exposes a local IP that differs from
 * the proxy exit IP, the proxy is leaking. This is a structural check —
 * actual WebRTC probing happens in the browser context.
 */
export function checkWebRtcConsistency(proxyExitIp: string, webrtcIps: string[]): ConsistencyCheck {
  // Strict equality: substring matching would let 1.2.3.45 pass as 1.2.3.4
  // (false negative — a real leak would go undetected).
  const hasLeak = webrtcIps.some((ip) => ip !== proxyExitIp && !isPrivateIp(ip));
  return {
    name: 'webrtc-consistency',
    passed: !hasLeak,
    expected: proxyExitIp,
    actual: webrtcIps.join(', '),
    detail: hasLeak ? 'WebRTC exposes non-proxy IP addresses' : 'No WebRTC leaks detected',
  };
}

export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') // link-local
  ) {
    return true;
  }
  const parts = ip.split('.');
  if (parts.length === 4) {
    const second = parseInt(parts[1] ?? '', 10);
    // RFC 1918: 172.16.0.0 – 172.31.255.255
    if (parts[0] === '172' && second >= 16 && second <= 31) return true;
    // CGNAT: 100.64.0.0 – 100.127.255.255
    if (parts[0] === '100' && second >= 64 && second <= 127) return true;
  }
  // IPv6 unique-local fc00::/7
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd');
}

/**
 * Run all consistency checks and produce a preflight report.
 */
export function runStealthPreflight(options: {
  proxyExitIp?: string;
  proxyTimezone?: string;
  proxyLocale?: string;
  browserTimezone?: string;
  browserLocale?: string;
  webrtcIps?: string[];
}): PreflightReport {
  const checks: ConsistencyCheck[] = [];

  if (options.proxyTimezone && options.browserTimezone) {
    checks.push(checkTimezoneConsistency(options.proxyTimezone, options.browserTimezone));
  }

  if (options.proxyLocale && options.browserLocale) {
    checks.push(checkLocaleConsistency(options.proxyLocale, options.browserLocale));
  }

  if (options.proxyExitIp && options.webrtcIps) {
    checks.push(checkWebRtcConsistency(options.proxyExitIp, options.webrtcIps));
  }

  const overallPass = checks.length === 0 || checks.every((c) => c.passed);

  return {
    timestamp: Date.now(),
    checks,
    overallPass,
    proxyInfo: {
      exitIp: options.proxyExitIp,
      timezone: options.proxyTimezone,
      locale: options.proxyLocale,
    },
  };
}

// ---------------------------------------------------------------------------
// Humanize re-scroll after reflow
// ---------------------------------------------------------------------------

export interface ScrollStep {
  x: number;
  y: number;
  delayMs: number;
}

/**
 * Generate humanized scroll steps to reach a target position after a page
 * reflow. Instead of jumping directly (which reveals automation), this
 * produces a series of small incremental scrolls with variable delays.
 *
 * Pattern: cloakbrowser 0.5 humanize re-scroll.
 */
export function humanizeScrollSteps(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  options: { maxStepPx?: number; minDelayMs?: number; maxDelayMs?: number } = {},
): ScrollStep[] {
  const maxStep = options.maxStepPx ?? 100;
  const minDelay = options.minDelayMs ?? 15;
  const maxDelay = options.maxDelayMs ?? 80;

  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 1) return [];

  const steps: ScrollStep[] = [];
  const numSteps = Math.max(1, Math.ceil(distance / maxStep));

  for (let i = 1; i <= numSteps; i++) {
    const progress = i / numSteps;
    // Ease-out curve for natural deceleration
    const eased = 1 - Math.pow(1 - progress, 3);

    const nextX = fromX + dx * eased;
    const nextY = fromY + dy * eased;

    // Add slight jitter for humanization
    const jitterX = (Math.random() - 0.5) * 3;
    const jitterY = (Math.random() - 0.5) * 3;

    steps.push({
      x: Math.round(nextX + jitterX),
      y: Math.round(nextY + jitterY),
      delayMs: Math.round(minDelay + Math.random() * (maxDelay - minDelay)),
    });
  }

  // Ensure final step lands exactly on target
  const last = steps[steps.length - 1];
  if (last) {
    last.x = toX;
    last.y = toY;
  }

  return steps;
}
