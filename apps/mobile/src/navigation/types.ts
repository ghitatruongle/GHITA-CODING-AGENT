// ==============================================================================
// GHITA CODING AGENT — Navigation Type Definitions
// ==============================================================================

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// --- Root Stack ---
export type RootStackParamList = {
  Pairing: undefined;
  RemoteControl: {
    serverAddress: string;
    deviceName: string;
  };
  Settings: undefined;
};

// --- Screen Props ---
export type PairingScreenProps = NativeStackScreenProps<RootStackParamList, 'Pairing'>;
export type RemoteControlScreenProps = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
