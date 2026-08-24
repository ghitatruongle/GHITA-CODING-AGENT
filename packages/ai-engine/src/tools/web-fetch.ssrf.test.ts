import { describe, it, expect } from 'vitest';
import { assertSafeFetchUrl, isPrivateIpv4 } from './web-fetch.js';

describe('assertSafeFetchUrl (CR-001 SSRF guard)', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(assertSafeFetchUrl('ftp://example.com/x')).rejects.toThrow(/http/);
    await expect(assertSafeFetchUrl('gopher://example.com')).rejects.toThrow(/http/);
  });

  it('rejects loopback and private IPv4 literals', async () => {
    await expect(assertSafeFetchUrl('http://127.0.0.1/')).rejects.toThrow(/Private|reserved/);
    await expect(assertSafeFetchUrl('http://10.0.0.1/')).rejects.toThrow(/Private|reserved/);
    await expect(assertSafeFetchUrl('http://192.168.1.10/')).rejects.toThrow(/Private|reserved/);
    await expect(assertSafeFetchUrl('http://0.0.0.0/')).rejects.toThrow(/Private|reserved/);
    await expect(assertSafeFetchUrl('http://172.16.5.5/')).rejects.toThrow(/Private|reserved/);
  });

  it('rejects cloud metadata endpoints by name', async () => {
    await expect(assertSafeFetchUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /metadata|Private/,
    );
    await expect(assertSafeFetchUrl('http://metadata.google.internal/')).rejects.toThrow(
      /metadata/,
    );
  });

  it('accepts a public IPv4 literal without DNS', async () => {
    const { url, ip } = await assertSafeFetchUrl('http://93.184.216.34/');
    expect(url.hostname).toBe('93.184.216.34');
    expect(ip).toBe('93.184.216.34');
  });
});

describe('isPrivateIpv4', () => {
  it('classifies private ranges', () => {
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('10.1.2.3')).toBe(true);
    expect(isPrivateIpv4('192.168.0.1')).toBe(true);
    expect(isPrivateIpv4('172.20.0.1')).toBe(true);
    expect(isPrivateIpv4('169.254.169.254')).toBe(true);
    expect(isPrivateIpv4('224.0.0.1')).toBe(true);
    expect(isPrivateIpv4('93.184.216.34')).toBe(false);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
  });
});
