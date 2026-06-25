// ==============================================================================
// GHITA CODING AGENT — SSRF IPv4 Range Blocking Unit Tests
// ==============================================================================
// Tests for InputSanitizer.isSafeUrl() SSRF protection:
//   - CGNAT 100.64.0.0/10 (shared address space)
//   - Link-local 169.254.0.0/16 (APIPA)
//   - Multicast 224.0.0.0/4
//   - Plus all other private/reserved ranges
//   - Public addresses should be allowed
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { InputSanitizer } from '../src/input-sanitizer.js';

describe('InputSanitizer — SSRF IPv4 Range Blocking', () => {
  let sanitizer: InputSanitizer;

  // Use a fresh instance per test
  beforeEach(() => {
    sanitizer = new InputSanitizer();
  });

  // Helper: isSafeUrl with https: only (the default)
  const check = (hostname: string): boolean =>
    sanitizer.isSafeUrl(`https://${hostname}/path`);

  // -------------------------------------------------------------------------
  // 1. CGNAT 100.64.0.0/10 (100.64.0.0 – 100.127.255.255)
  // -------------------------------------------------------------------------
  describe('CGNAT 100.64.0.0/10', () => {
    it('should block 100.64.0.0 (start of CGNAT range)', () => {
      expect(check('100.64.0.0')).toBe(false);
    });

    it('should block 100.64.0.1 (first usable CGNAT address)', () => {
      expect(check('100.64.0.1')).toBe(false);
    });

    it('should block 100.127.255.255 (end of CGNAT range)', () => {
      expect(check('100.127.255.255')).toBe(false);
    });

    it('should block 100.100.100.100 (mid-range CGNAT)', () => {
      expect(check('100.100.100.100')).toBe(false);
    });

    it('should ALLOW 100.63.255.255 (just below CGNAT range)', () => {
      expect(check('100.63.255.255')).toBe(true);
    });

    it('should ALLOW 100.128.0.0 (just above CGNAT range)', () => {
      expect(check('100.128.0.0')).toBe(true);
    });

    it('should ALLOW 100.0.0.1 (well below CGNAT)', () => {
      expect(check('100.0.0.1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Link-Local 169.254.0.0/16 (169.254.0.0 – 169.254.255.255)
  // -------------------------------------------------------------------------
  describe('Link-Local 169.254.0.0/16', () => {
    it('should block 169.254.0.0 (start of link-local)', () => {
      expect(check('169.254.0.0')).toBe(false);
    });

    it('should block 169.254.1.1 (typical APIPA address)', () => {
      expect(check('169.254.1.1')).toBe(false);
    });

    it('should block 169.254.255.255 (end of link-local)', () => {
      expect(check('169.254.255.255')).toBe(false);
    });

    it('should block 169.254.169.254 (AWS metadata endpoint — critical SSRF target)', () => {
      // This is the most important SSRF target: cloud metadata API
      expect(check('169.254.169.254')).toBe(false);
    });

    it('should ALLOW 169.253.0.1 (just below link-local)', () => {
      expect(check('169.253.0.1')).toBe(true);
    });

    it('should ALLOW 169.255.0.1 (just above link-local)', () => {
      expect(check('169.255.0.1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Multicast 224.0.0.0/4 (224.0.0.0 – 239.255.255.255)
  // -------------------------------------------------------------------------
  describe('Multicast 224.0.0.0/4', () => {
    it('should block 224.0.0.0 (start of multicast range)', () => {
      expect(check('224.0.0.0')).toBe(false);
    });

    it('should block 224.0.0.1 (all-hosts multicast)', () => {
      expect(check('224.0.0.1')).toBe(false);
    });

    it('should block 239.255.255.255 (end of multicast range)', () => {
      expect(check('239.255.255.255')).toBe(false);
    });

    it('should block 230.0.0.1 (mid multicast range)', () => {
      expect(check('230.0.0.1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Reserved 240.0.0.0/4 (240.0.0.0 – 255.255.255.255)
  // -------------------------------------------------------------------------
  describe('Reserved 240.0.0.0/4', () => {
    it('should block 240.0.0.0 (start of reserved)', () => {
      expect(check('240.0.0.0')).toBe(false);
    });

    it('should block 255.255.255.255 (broadcast)', () => {
      expect(check('255.255.255.255')).toBe(false);
    });

    it('should block 250.1.2.3 (reserved range)', () => {
      expect(check('250.1.2.3')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Existing Private Ranges (regression checks)
  // -------------------------------------------------------------------------
  describe('Private/Loopback ranges (regression)', () => {
    // 0.0.0.0/8 — Current network
    it('should block 0.0.0.0', () => {
      expect(check('0.0.0.0')).toBe(false);
    });

    // 10.0.0.0/8 — Private
    it('should block 10.0.0.1', () => {
      expect(check('10.0.0.1')).toBe(false);
    });
    it('should block 10.255.255.255', () => {
      expect(check('10.255.255.255')).toBe(false);
    });

    // 127.0.0.0/8 — Loopback
    it('should block 127.0.0.1', () => {
      expect(check('127.0.0.1')).toBe(false);
    });
    it('should block 127.255.255.255', () => {
      expect(check('127.255.255.255')).toBe(false);
    });

    // 172.16.0.0/12 — Private
    it('should block 172.16.0.1', () => {
      expect(check('172.16.0.1')).toBe(false);
    });
    it('should block 172.31.255.255', () => {
      expect(check('172.31.255.255')).toBe(false);
    });
    it('should ALLOW 172.15.0.1 (just below 172.16/12)', () => {
      expect(check('172.15.0.1')).toBe(true);
    });
    it('should ALLOW 172.32.0.1 (just above 172.16/12)', () => {
      expect(check('172.32.0.1')).toBe(true);
    });

    // 192.168.0.0/16 — Private
    it('should block 192.168.0.1', () => {
      expect(check('192.168.0.1')).toBe(false);
    });
    it('should block 192.168.255.255', () => {
      expect(check('192.168.255.255')).toBe(false);
    });

    // 198.18.0.0/15 — Benchmark testing
    it('should block 198.18.0.1', () => {
      expect(check('198.18.0.1')).toBe(false);
    });
    it('should block 198.19.0.1', () => {
      expect(check('198.19.0.1')).toBe(false);
    });
    it('should ALLOW 198.17.0.1 (below benchmark)', () => {
      expect(check('198.17.0.1')).toBe(true);
    });
    it('should ALLOW 198.20.0.1 (above benchmark)', () => {
      expect(check('198.20.0.1')).toBe(true);
    });

    // Named aliases
    it('should block localhost', () => {
      expect(sanitizer.isSafeUrl('https://localhost/path')).toBe(false);
    });
    it('should block ::1', () => {
      expect(sanitizer.isSafeUrl('https://::1/path')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Public Addresses Should Be Allowed
  // -------------------------------------------------------------------------
  describe('Public addresses should be allowed', () => {
    it('should allow 8.8.8.8 (Google DNS)', () => {
      expect(check('8.8.8.8')).toBe(true);
    });

    it('should allow 1.1.1.1 (Cloudflare DNS)', () => {
      expect(check('1.1.1.1')).toBe(true);
    });

    it('should allow 203.0.113.1 (TEST-NET-3, documentation range)', () => {
      expect(check('203.0.113.1')).toBe(true);
    });

    it('should allow 198.51.100.1 (TEST-NET-2)', () => {
      expect(check('198.51.100.1')).toBe(true);
    });

    it('should reject domain names (non-IP hostnames) synchronously to force async verification', () => {
      expect(sanitizer.isSafeUrl('https://example.com/api')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Protocol & URL Validation
  // -------------------------------------------------------------------------
  describe('Protocol and URL validation', () => {
    it('should reject http: by default (only https: allowed)', () => {
      expect(sanitizer.isSafeUrl('http://8.8.8.8/')).toBe(false);
    });

    it('should allow http: when explicitly passed in allowedProtocols', () => {
      expect(sanitizer.isSafeUrl('http://8.8.8.8/', ['http:', 'https:'])).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(sanitizer.isSafeUrl('not a url')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(sanitizer.isSafeUrl('')).toBe(false);
    });

    it('should reject ftp: protocol', () => {
      expect(sanitizer.isSafeUrl('ftp://example.com/file')).toBe(false);
    });
  });
});
