import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySocketAuth,
  createKnownToolNames,
  hashDeviceToken,
  matchesDeviceToken,
  normalizeProviderToolCalls,
} from './runtime-security.mjs';

test('creates tool names from registry entries, not array indexes', () => {
  const names = createKnownToolNames([{ name: 'read_file' }, { name: 'run_command' }]);
  assert.deepEqual([...names], ['read_file', 'run_command']);
  assert.equal(names.has('0'), false);
});

test('normalizes direct and OpenAI-compatible tool calls', () => {
  const calls = normalizeProviderToolCalls([
    { id: 'direct', name: 'read_file', arguments: { filePath: 'README.md' } },
    {
      id: 'openai',
      type: 'function',
      function: { name: 'run_command', arguments: '{"command":"pnpm test"}' },
    },
    { function: { name: 'invalid', arguments: '{broken' } },
  ]);
  assert.deepEqual(calls, [
    { id: 'direct', name: 'read_file', arguments: { filePath: 'README.md' } },
    { id: 'openai', name: 'run_command', arguments: { command: 'pnpm test' } },
  ]);
});

test('stores and compares device tokens by SHA-256 hash', () => {
  const token = 'a'.repeat(64);
  const hash = hashDeviceToken(token);
  assert.equal(hash.length, 64);
  assert.equal(matchesDeviceToken(token, hash), true);
  assert.equal(matchesDeviceToken('b'.repeat(64), hash), false);
});

test('accepts a desktop session token only from loopback', () => {
  const input = { auth: { token: 'desktop-secret' }, sessionToken: 'desktop-secret' };
  assert.equal(classifySocketAuth({ ...input, remoteAddress: '127.0.0.1' }).type, 'desktop');
  assert.equal(classifySocketAuth({ ...input, remoteAddress: '192.168.1.7' }).allowed, false);
});

test('isolates pairing sockets and authenticates paired devices', () => {
  const token = 'c'.repeat(64);
  const device = { tokenHash: hashDeviceToken(token) };
  const findDevice = (id) => (id === 'phone-1' ? device : undefined);

  assert.equal(
    classifySocketAuth({
      auth: { pairing: true, deviceId: 'phone-1' },
      remoteAddress: '192.168.1.7',
      sessionToken: 'desktop-secret',
      findDevice,
    }).type,
    'pairing',
  );
  assert.equal(
    classifySocketAuth({
      auth: { token, deviceId: 'phone-1' },
      remoteAddress: '192.168.1.7',
      sessionToken: 'desktop-secret',
      findDevice,
    }).type,
    'device',
  );
});
