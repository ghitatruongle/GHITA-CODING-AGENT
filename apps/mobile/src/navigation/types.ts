import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// --- Root Stack ---
export type RootStackParamList = {
  Pairing: undefined;
  RemoteControl: {
    serverAddress: string;
    deviceName: string;
  };
  Settings: undefined;
  Dashboard: undefined;
};

// --- Screen Props ---
export type PairingScreenProps = NativeStackScreenProps<RootStackParamList, 'Pairing'>;
export type RemoteControlScreenProps = NativeStackScreenProps<RootStackParamList, 'RemoteControl'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type DashboardScreenProps = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;
