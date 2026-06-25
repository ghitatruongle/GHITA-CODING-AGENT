import { vi } from 'vitest';

export const Platform = { OS: 'android', Version: 31 };
export const PermissionsAndroid = {
  requestMultiple: vi.fn().mockResolvedValue({
    'android.permission.BLUETOOTH_SCAN': 'granted',
    'android.permission.BLUETOOTH_CONNECT': 'granted',
  }),
  request: vi.fn().mockResolvedValue('granted'),
  PERMISSIONS: {
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  },
};
export const StyleSheet = { create: vi.fn((obj: any) => obj) };
export const View = 'View';
export const Image = 'Image';
export const Text = 'Text';
export const ActivityIndicator = 'ActivityIndicator';
export const TouchableWithoutFeedback = 'TouchableWithoutFeedback';
