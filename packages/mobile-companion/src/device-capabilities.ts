// @ghita/mobile-companion -- Device Capabilities Detection

import type { DeviceCapabilities } from './types.js';

export function detectCapabilities(
  userAgent: string,
  screenSize?: { width: number; height: number },
): DeviceCapabilities {
  const isAndroid = /android/i.test(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  return {
    hasBluetooth: isAndroid || isIOS,
    hasCamera: true,
    hasGPS: isAndroid || isIOS,
    hasAccelerometer: isAndroid || isIOS,
    screenSize: screenSize ?? { width: 360, height: 640 },
    os: isAndroid ? 'android' : isIOS ? 'ios' : 'unknown',
    osVersion: extractOSVersion(userAgent),
  };
}

function extractOSVersion(userAgent: string): string {
  const androidMatch = userAgent.match(/android\s([\d.]+)/i);
  if (androidMatch?.[1]) return androidMatch[1];
  const iosMatch = userAgent.match(/os\s([\d_]+)/i);
  if (iosMatch?.[1]) return iosMatch[1].replace(/_/g, '.');
  return 'unknown';
}
