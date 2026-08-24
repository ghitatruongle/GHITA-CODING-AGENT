export interface DomainPolicy {
  /** Domains explicitly allowed (bypasses blocklist). */
  allowlist: string[];
  /** Domains explicitly blocked. */
  blocklist: string[];
  /** Default action when domain matches neither list. */
  defaultAction: 'allow' | 'block';
}

export const DEFAULT_DOMAIN_POLICY: DomainPolicy = {
  allowlist: [],
  blocklist: ['malware.test', 'phishing.example.com'],
  defaultAction: 'allow',
};

//Check whether a URL is permitted under the domain policy
export function isUrlAllowed(url: string, policy: DomainPolicy = DEFAULT_DOMAIN_POLICY): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return policy.defaultAction === 'allow';
  }

  for (const domain of policy.allowlist) {
    if (hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`)) {
      return true;
    }
  }

  for (const domain of policy.blocklist) {
    if (hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`)) {
      return false;
    }
  }

  return policy.defaultAction === 'allow';
}

// Popup auto-close

export interface PopupDecision {
  shouldClose: boolean;
  reason: string;
}

/**
 * Decide whether a popup/new-tab should be auto-closed based on its target URL.
 * Unknown domains (not in allowlist) are closed by default.
 */
export function evaluatePopup(
  popupUrl: string,
  openerUrl: string,
  policy: DomainPolicy = DEFAULT_DOMAIN_POLICY,
): PopupDecision {
  let popupHost: string;
  let openerHost: string;
  try {
    popupHost = new URL(popupUrl).hostname.toLowerCase();
    openerHost = new URL(openerUrl).hostname.toLowerCase();
  } catch {
    return { shouldClose: true, reason: 'invalid URL' };
  }

  // Same-origin popups are always allowed
  if (popupHost === openerHost) {
    return { shouldClose: false, reason: 'same-origin' };
  }

  // Explicit blocklist always wins, regardless of defaultAction
  for (const domain of policy.blocklist) {
    if (popupHost === domain.toLowerCase() || popupHost.endsWith(`.${domain.toLowerCase()}`)) {
      return { shouldClose: true, reason: `blocklisted domain: ${popupHost}` };
    }
  }

  // Check if popup domain is explicitly allowed
  for (const domain of policy.allowlist) {
    if (popupHost === domain.toLowerCase() || popupHost.endsWith(`.${domain.toLowerCase()}`)) {
      return { shouldClose: false, reason: 'allowlisted' };
    }
  }

  // Unknown external domain → close
  return { shouldClose: true, reason: `unknown external domain: ${popupHost}` };
}

// Sensitive-data redaction

export interface RedactionResult {
  redacted: string;
  count: number;
  types: string[];
}

const REDACTION_PATTERNS: Array<{ pattern: RegExp; type: string; replacement: string }> = [
  // Passwords in query strings and form data
  {
    pattern: /(?:password|passwd|pwd|pass)=[^&\s"'<>]+/gi,
    type: 'password',
    replacement: 'password=[REDACTED]',
  },
  // API keys and tokens
  {
    pattern:
      /\b(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*['"]?([A-Za-z0-9_\-./+=]{8,})['"]?/gi,
    type: 'api-key',
    replacement: '[REDACTED-API-KEY]',
  },
  // Bearer tokens
  {
    pattern: /Bearer\s+[A-Za-z0-9_\-./+=]+/gi,
    type: 'bearer-token',
    replacement: 'Bearer [REDACTED]',
  },
  // Credit card numbers (basic Luhn-length detection)
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    type: 'credit-card',
    replacement: '[REDACTED-CC]',
  },
  // SSN patterns
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: 'ssn', replacement: '[REDACTED-SSN]' },
  // Email addresses in HAR/prompt context
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    type: 'email',
    replacement: '[REDACTED-EMAIL]',
  },
];

/**
 * Redact sensitive data from text before it leaves the machine (prompt or HAR).
 * Returns the redacted text along with metadata about what was removed.
 */
export function redactSensitiveData(text: string): RedactionResult {
  let result = text;
  let totalCount = 0;
  const typesFound = new Set<string>();

  for (const { pattern, type, replacement } of REDACTION_PATTERNS) {
    // Single-pass replace with callback: counts matches without a second
    // scan and avoids match()/replace() divergence on global regexes.
    result = result.replace(pattern, () => {
      totalCount++;
      typesFound.add(type);
      return replacement;
    });
  }

  return {
    redacted: result,
    count: totalCount,
    types: [...typesFound],
  };
}

/**
 * Redact sensitive fields from a HAR entry object.
 * Operates on serialized JSON to catch all field positions.
 */
export function redactHarEntry(harJson: string): RedactionResult {
  return redactSensitiveData(harJson);
}
