import { assertSafeServerAddress } from '../services/serverAddress';

describe('assertSafeServerAddress', () => {
  it.each([
    'http://localhost:4310',
    'ws://127.0.0.1:4310',
    'http://10.0.0.8:4310',
    'http://172.16.0.8:4310',
    'http://172.31.255.254:4310',
    'http://192.168.1.8:4310',
    'ws://[fd12:3456::1]:4310',
    'http://[fe80::1]:4310',
    'https://example.com',
    'wss://example.com/socket',
  ])('accepts a safe address: %s', (address) => {
    expect(assertSafeServerAddress(address).toString()).toBe(new URL(address).toString());
  });

  it.each([
    'http://example.com',
    'ws://8.8.8.8:4310',
    'http://172.15.0.1:4310',
    'http://172.32.0.1:4310',
    'http://192.169.1.1:4310',
    'ftp://192.168.1.8',
    'not a url',
  ])('rejects an unsafe address: %s', (address) => {
    expect(() => assertSafeServerAddress(address)).toThrow();
  });

  it('rejects credentials embedded in an otherwise safe URL', () => {
    expect(() => assertSafeServerAddress('http://user:secret@192.168.1.8:4310')).toThrow(
      /credentials/i,
    );
  });
});
