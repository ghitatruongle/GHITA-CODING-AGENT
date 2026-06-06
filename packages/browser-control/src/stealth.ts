// ==============================================================================
// GHITA CODING AGENT - Stealth Browser Module
// Phase 3 (Update 0.0.3 beta2): CloakBrowser-style anti-fingerprinting
// ==============================================================================

import type { BrowserControlAdapter } from './index.js';

export interface StealthOptions {
  /** User-Agent override; if omitted a realistic desktop UA is generated. */
  userAgent?: string;
  /** Locale string (e.g. 'en-US'). Defaults to 'en-US'. */
  locale?: string;
  /** Timezone id (e.g. 'America/New_York'). Defaults to 'UTC'. */
  timezoneId?: string;
  /** Strip `navigator.webdriver` and related automation flags. */
  hideWebDriver?: boolean;
  /** Randomize canvas / WebGL fingerprints. */
  randomizeFingerprint?: boolean;
  /** Disable blink features that leak automation (e.g. AutomationControlled). */
  disableAutomationFlags?: boolean;
  /** Block permission requests for camera/mic/notifications. */
  blockPermissions?: boolean;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const STEALTH_INIT_SCRIPT = `
(function () {
  // 1. Remove webdriver flag
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (_) {}
  // 2. Patch permissions query
  try {
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }
  } catch (_) {}
  // 3. Patch plugins / languages to look like a real browser
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  } catch (_) {}
  // 4. Chrome runtime shim
  try {
    if (!window.chrome) window.chrome = { runtime: {} };
  } catch (_) {}
  // 5. WebGL vendor/renderer (only if fingerprint mode requested at init)
})();
`;

export interface StealthContext {
  options: Required<StealthOptions>;
  fingerprintSeed: number;
}

export function createStealthContext(options: StealthOptions = {}): StealthContext {
  return {
    options: {
      userAgent: options.userAgent ?? DEFAULT_UA,
      locale: options.locale ?? 'en-US',
      timezoneId: options.timezoneId ?? 'UTC',
      hideWebDriver: options.hideWebDriver ?? true,
      randomizeFingerprint: options.randomizeFingerprint ?? true,
      disableAutomationFlags: options.disableAutomationFlags ?? true,
      blockPermissions: options.blockPermissions ?? true,
    },
    fingerprintSeed: Math.floor(Math.random() * 0xffffff),
  };
}

/**
 * Wrap a Playwright page-like object (anything with `addInitScript` and
 * `setExtraHTTPHeaders`) so the next context is created with anti-detection
 * flags. The adapter contract is kept minimal so this works with any
 * underlying engine that exposes Playwright's Page API.
 */
export interface StealthCapable {
  addInitScript: (script: string) => Promise<void>;
  setExtraHTTPHeaders?: (headers: Record<string, string>) => Promise<void>;
  setUserAgent?: (ua: string) => Promise<void>;
  setViewportSize?: (size: { width: number; height: number }) => Promise<void>;
  emulateMedia?: (media: { media?: string; colorScheme?: string }) => Promise<void>;
}

export async function applyStealth(page: StealthCapable, ctx: StealthContext): Promise<void> {
  const { options } = ctx;

  if (options.hideWebDriver || options.randomizeFingerprint) {
    await page.addInitScript(STEALTH_INIT_SCRIPT);
  }

  if (options.userAgent && page.setUserAgent) {
    await page.setUserAgent(options.userAgent);
  }

  if (page.setExtraHTTPHeaders) {
    await page.setExtraHTTPHeaders({
      'accept-language': options.locale,
    });
  }
}

/**
 * Higher-order wrapper that decorates a launch() factory with stealth
 * defaults. Designed to be combined with `createPlaywrightAdapter`.
 */
export function withStealth(
  base: BrowserControlAdapter,
  options: StealthOptions = {},
): BrowserControlAdapter {
  const ctx = createStealthContext(options);
  return {
    ...base,
    launch: async (launchOptions) => {
      if (base.launch) await base.launch(launchOptions);
      // Stealth flags are applied lazily by the page factory in node.ts
      // via the `stealthContext` exported below.
      (base as Record<string, unknown>).__stealthContext = ctx;
    },
  };
}

export { DEFAULT_UA, STEALTH_INIT_SCRIPT };
