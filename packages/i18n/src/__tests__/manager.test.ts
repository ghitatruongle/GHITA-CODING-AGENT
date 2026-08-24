// @ghita/i18n -- Comprehensive Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { I18nManager } from '../manager.js';
import { TranslationLoaderRegistry } from '../loader.js';
import { LocaleDetector } from '../detector.js';
import { formatNumber, formatDate, formatCurrency, formatPlural } from '../formatter.js';

// I18nManager

describe('I18nManager', () => {
  const config = {
    defaultLocale: 'en',
    fallbackLocale: 'en',
    supportedLocales: ['en', 'vi'] as readonly string[],
  };

  let manager: I18nManager;

  beforeEach(() => {
    manager = new I18nManager(config);
  });

  it('returns default locale', () => {
    expect(manager.getLocale()).toBe('en');
  });

  it('sets locale', () => {
    manager.setLocale('vi');
    expect(manager.getLocale()).toBe('vi');
  });

  it('throws for unsupported locale', () => {
    expect(() => manager.setLocale('fr')).toThrow('Unsupported locale: fr');
  });

  it('returns message by id', () => {
    manager.addTranslations('en', { hello: 'Hello' });
    expect(manager.formatMessage({ id: 'hello' })).toBe('Hello');
  });

  it('interpolates values', () => {
    manager.addTranslations('en', { greeting: 'Hello, {name}!' });
    expect(manager.formatMessage({ id: 'greeting', values: { name: 'World' } })).toBe('Hello, World!');
  });

  it('falls back to fallback locale', () => {
    manager.addTranslations('en', { hello: 'Hello' });
    manager.setLocale('vi');
    expect(manager.formatMessage({ id: 'hello' })).toBe('Hello');
  });

  it('returns id if no translation found', () => {
    expect(manager.formatMessage({ id: 'missing' })).toBe('missing');
  });

  it('returns defaultMessage if provided', () => {
    expect(manager.formatMessage({ id: 'missing', defaultMessage: 'Default' })).toBe('Default');
  });

  it('supports nested keys', () => {
    manager.addTranslations('en', { nav: { home: 'Home', about: 'About' } });
    expect(manager.formatMessage({ id: 'nav.home' })).toBe('Home');
    expect(manager.formatMessage({ id: 'nav.about' })).toBe('About');
  });

  it('deep merges translations', () => {
    manager.addTranslations('en', { nav: { home: 'Home' } });
    manager.addTranslations('en', { nav: { about: 'About' }, footer: 'Footer' });
    expect(manager.formatMessage({ id: 'nav.home' })).toBe('Home');
    expect(manager.formatMessage({ id: 'nav.about' })).toBe('About');
    expect(manager.formatMessage({ id: 'footer' })).toBe('Footer');
  });

  it('preserves interpolation placeholders when value missing', () => {
    manager.addTranslations('en', { greeting: 'Hello, {name}!' });
    expect(manager.formatMessage({ id: 'greeting', values: {} })).toBe('Hello, {name}!');
  });
});

// TranslationLoaderRegistry

describe('TranslationLoaderRegistry', () => {
  let registry: TranslationLoaderRegistry;

  beforeEach(() => {
    registry = new TranslationLoaderRegistry();
  });

  it('registers and loads translations', async () => {
    registry.register('en', async () => ({ hello: 'Hello' }));
    const messages = await registry.load('en');
    expect(messages).toEqual({ hello: 'Hello' });
  });

  it('throws for unregistered locale', async () => {
    await expect(registry.load('fr')).rejects.toThrow('No loader registered for locale: fr');
  });

  it('checks if locale has loader', () => {
    expect(registry.has('en')).toBe(false);
    registry.register('en', async () => ({}));
    expect(registry.has('en')).toBe(true);
  });
});

// LocaleDetector

describe('LocaleDetector', () => {
  let detector: LocaleDetector;

  beforeEach(() => {
    detector = new LocaleDetector();
  });

  it('returns undefined for undefined header', () => {
    expect(detector.detect(undefined, ['en'])).toBeUndefined();
  });

  it('detects exact match', () => {
    expect(detector.detect('vi', ['en', 'vi'])).toBe('vi');
  });

  it('detects match with quality', () => {
    expect(detector.detect('vi;q=0.9,en;q=1.0', ['en', 'vi'])).toBe('en');
  });

  it('detects prefix match', () => {
    expect(detector.detect('zh-CN', ['zh'])).toBe('zh');
  });

  it('returns undefined for no match', () => {
    expect(detector.detect('fr', ['en', 'vi'])).toBeUndefined();
  });
});

// Formatter utilities

describe('formatNumber', () => {
  it('formats number for locale', () => {
    const result = formatNumber(1234567.89, 'en-US');
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
});

describe('formatDate', () => {
  it('formats date for locale', () => {
    const date = new Date('2026-01-15');
    const result = formatDate(date, 'en-US');
    expect(result).toContain('2026');
  });
});

describe('formatCurrency', () => {
  it('formats currency', () => {
    const result = formatCurrency(99.99, 'USD', 'en-US');
    expect(result).toContain('99');
  });
});

describe('formatPlural', () => {
  it('returns singular form', () => {
    const result = formatPlural(1, 'en', { one: '{count} item', other: '{count} items' });
    expect(result).toBe('{count} item');
  });

  it('returns other form for zero', () => {
    const result = formatPlural(0, 'en', { one: '{count} item', other: '{count} items' });
    expect(result).toBe('{count} items');
  });

  it('returns empty string for missing forms', () => {
    const result = formatPlural(5, 'en', {});
    expect(result).toBe('');
  });
});
