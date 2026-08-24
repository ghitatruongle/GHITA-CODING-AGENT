import { describe, it, expect, vi } from 'vitest';
import { createStealthContext, applyStealth, withStealth, DEFAULT_UA } from './stealth.js';

describe('createStealthContext', () => {
  it('should create a context with default options', () => {
    const ctx = createStealthContext();
    expect(ctx.options.userAgent).toBe(DEFAULT_UA);
    expect(ctx.options.locale).toBe('en-US');
    expect(ctx.options.timezoneId).toBe('UTC');
    expect(ctx.options.hideWebDriver).toBe(true);
    expect(ctx.options.randomizeFingerprint).toBe(true);
    expect(ctx.options.disableAutomationFlags).toBe(true);
    expect(ctx.options.blockPermissions).toBe(true);
  });

  it('should generate a fingerprint seed', () => {
    const ctx1 = createStealthContext();
    const ctx2 = createStealthContext();
    expect(ctx1.fingerprintSeed).toBeGreaterThanOrEqual(0);
    expect(ctx1.fingerprintSeed).toBeLessThanOrEqual(0xffffff);
    // Very unlikely to collide
    expect(ctx1.fingerprintSeed).not.toBe(ctx2.fingerprintSeed);
  });

  it('should override default options', () => {
    const ctx = createStealthContext({
      userAgent: 'Custom UA',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      hideWebDriver: false,
      randomizeFingerprint: false,
      disableAutomationFlags: false,
      blockPermissions: false,
    });
    expect(ctx.options.userAgent).toBe('Custom UA');
    expect(ctx.options.locale).toBe('vi-VN');
    expect(ctx.options.timezoneId).toBe('Asia/Ho_Chi_Minh');
    expect(ctx.options.hideWebDriver).toBe(false);
    expect(ctx.options.randomizeFingerprint).toBe(false);
    expect(ctx.options.disableAutomationFlags).toBe(false);
    expect(ctx.options.blockPermissions).toBe(false);
  });

  it('should allow partial override', () => {
    const ctx = createStealthContext({ userAgent: 'Custom UA' });
    expect(ctx.options.userAgent).toBe('Custom UA');
    // Other fields should still have defaults
    expect(ctx.options.locale).toBe('en-US');
    expect(ctx.options.hideWebDriver).toBe(true);
  });
});

describe('applyStealth', () => {
  const createMockPage = () => ({
    addInitScript: vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    emulateMedia: vi.fn().mockResolvedValue(undefined),
  });

  it('should apply init script when hideWebDriver is enabled', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({ hideWebDriver: true, randomizeFingerprint: false });
    await applyStealth(page, ctx);
    expect(page.addInitScript).toHaveBeenCalledTimes(1);
  });

  it('should apply init script when randomizeFingerprint is enabled', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({ hideWebDriver: false, randomizeFingerprint: true });
    await applyStealth(page, ctx);
    expect(page.addInitScript).toHaveBeenCalledTimes(1);
  });

  it('should skip init script when both flags are off', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({
      hideWebDriver: false,
      randomizeFingerprint: false,
    });
    await applyStealth(page, ctx);
    expect(page.addInitScript).not.toHaveBeenCalled();
  });

  it('should set user agent when provided and setUserAgent is available', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({ userAgent: 'Custom/1.0' });
    await applyStealth(page, ctx);
    expect(page.setUserAgent).toHaveBeenCalledWith('Custom/1.0');
  });

  it('should not set user agent when no userAgent is provided', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({ userAgent: '' });
    await applyStealth(page, ctx);
    // empty string is falsy, so should not call setUserAgent
    expect(page.setUserAgent).not.toHaveBeenCalled();
  });

  it('should set accept-language header when setExtraHTTPHeaders is available', async () => {
    const page = createMockPage();
    const ctx = createStealthContext({ locale: 'vi-VN' });
    await applyStealth(page, ctx);
    expect(page.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'accept-language': 'vi-VN',
    });
  });

  it('should handle missing optional methods gracefully', async () => {
    const minimalPage = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
    };
    const ctx = createStealthContext();
    // Should not throw when setUserAgent / setExtraHTTPHeaders are missing
    await expect(applyStealth(minimalPage, ctx)).resolves.not.toThrow();
  });
});

describe('withStealth', () => {
  it('should wrap launch method with stealth context', async () => {
    const baseLaunch = vi.fn().mockResolvedValue(undefined);
    const adapter = { launch: baseLaunch };
    const wrapped = withStealth(adapter, { userAgent: 'Stealth/1.0' });
    expect(wrapped.launch).toBeDefined();
    await wrapped.launch?.({ headless: true });
    expect(baseLaunch).toHaveBeenCalledWith({ headless: true });
    // Check that stealth context was attached to the adapter (base object)
    expect((adapter as unknown as Record<string, unknown>).__stealthContext).toBeDefined();
  });

  it('should not fail when base adapter has no launch', async () => {
    const adapter = {};
    const wrapped = withStealth(adapter);
    await expect(wrapped.launch?.({ headless: true })).resolves.not.toThrow();
  });

  it('should pass through other adapter methods', async () => {
    const adapter = {
      launch: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    const wrapped = withStealth(adapter);
    expect(wrapped.close).toBe(adapter.close);
    expect(wrapped.navigate).toBe(adapter.navigate);
  });
});

describe('STEALTH_INIT_SCRIPT', () => {
  it('should be a valid JavaScript string', async () => {
    // Use dynamic import since we're in ESM
    const { STEALTH_INIT_SCRIPT } = await import('./stealth.js');
    expect(typeof STEALTH_INIT_SCRIPT).toBe('string');
    expect(STEALTH_INIT_SCRIPT.length).toBeGreaterThan(100);
    // Should be a valid IIFE
    expect(STEALTH_INIT_SCRIPT.trim()).toMatch(/^\(function\s*\(\)/);
  });
});
