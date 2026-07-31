import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeSocketAddress(address = '') {
  return String(address)
    .replace(/^::ffff:/, '')
    .replace(/^\[|\]$/g, '')
    .trim()
    .toLowerCase();
}

export function isLoopbackSocketAddress(address = '') {
  const normalized = normalizeSocketAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function secureStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashDeviceToken(token) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new TypeError('Device tokens must contain at least 32 characters.');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function matchesDeviceToken(token, tokenHash) {
  if (typeof token !== 'string' || token.length < 32 || typeof tokenHash !== 'string') {
    return false;
  }
  return secureStringEqual(hashDeviceToken(token), tokenHash);
}

export function createKnownToolNames(tools) {
  if (!Array.isArray(tools)) return new Set();
  return new Set(
    tools
      .map((tool) => tool?.name)
      .filter((name) => typeof name === 'string' && name.length > 0),
  );
}

export function normalizeProviderToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.flatMap((toolCall) => {
    const source = toolCall?.function ?? toolCall;
    const name = source?.name;
    if (typeof name !== 'string' || name.length === 0) return [];

    let args = source.arguments ?? source.input ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        return [];
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) return [];

    return [{
      id: typeof toolCall?.id === 'string' ? toolCall.id : undefined,
      name,
      arguments: args,
    }];
  });
}

export function classifySocketAuth({
  auth = {},
  remoteAddress = '',
  sessionToken,
  findDevice,
}) {
  const loopback = isLoopbackSocketAddress(remoteAddress);
  const suppliedToken = auth?.token;

  if (
    loopback
    && typeof sessionToken === 'string'
    && sessionToken.length > 0
    && secureStringEqual(suppliedToken, sessionToken)
  ) {
    return { allowed: true, type: 'desktop' };
  }

  if (loopback && !sessionToken) {
    return { allowed: true, type: 'desktop' };
  }

  const deviceId = typeof auth?.deviceId === 'string' ? auth.deviceId : '';
  const device = deviceId && typeof findDevice === 'function' ? findDevice(deviceId) : undefined;
  if (device && matchesDeviceToken(suppliedToken, device.tokenHash)) {
    return { allowed: true, type: 'device', deviceId };
  }

  if (auth?.pairing === true && !suppliedToken) {
    return { allowed: true, type: 'pairing', deviceId: deviceId || undefined };
  }

  return { allowed: false, type: 'denied' };
}
