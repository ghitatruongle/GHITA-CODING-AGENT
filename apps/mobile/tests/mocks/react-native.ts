/**
 * Lightweight React Native mock for Jest (node environment).
 * Stubs only the APIs the tests actually touch.
 */
export const View = 'View';
export const Text = 'Text';
export const TextInput = 'TextInput';
export const TouchableOpacity = 'TouchableOpacity';
export const TouchableWithoutFeedback = 'TouchableWithoutFeedback';
export const ScrollView = 'ScrollView';
export const FlatList = 'FlatList';
export const ActivityIndicator = 'ActivityIndicator';
export const StyleSheet = {
  create: <T>(styles: T): T => styles,
};
export const Platform = {
  OS: 'android',
  select: (obj: { android?: unknown; ios?: unknown; default?: unknown }) =>
    obj.android ?? obj.default,
};
export const StatusBar = { currentHeight: 24 };
export const Alert = {
  alert: jest.fn(),
};
export const Keyboard = {
  dismiss: jest.fn(),
};
export const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};
export const Vibration = { vibrate: jest.fn() };
export const BackHandler = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};
export const PermissionsAndroid = {
  request: jest.fn().mockResolvedValue('granted'),
  requestMultiple: jest.fn().mockResolvedValue({}),
  PERMISSIONS: {},
  RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
};

// Re-export React as default so `import React from 'react-native'` works in tests
const React = require('react');
module.exports = React;
Object.assign(module.exports, {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  Keyboard,
  AppState,
  Vibration,
  BackHandler,
  PermissionsAndroid,
});
