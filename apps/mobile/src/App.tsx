// ==============================================================================
// GHITA CODING AGENT — Mobile App Root
// Navigation + SafeArea + ErrorBoundary + Theme
// ==============================================================================

import React, { Component, useEffect } from 'react';
import type { ErrorInfo } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { PairingScreen } from './screens/PairingScreen';
import { RemoteControlScreen } from './screens/RemoteControlScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ErrorFallback } from './components/ErrorFallback';
import type { RootStackParamList } from './navigation/types';
import { I18nProvider } from './i18n/context';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { notificationService } from './services/notificationService';
import * as storageService from './services/storageService';
import { socketService } from './services/socketService';

// --- Navigation Stack ---
const Stack = createNativeStackNavigator<RootStackParamList>();

// --- Inner Navigator (Uses Hook) ---
function AppNavigator() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    notificationService.initialize().catch(console.error);
  }, []);

  // C13: Auto-reconnect on initial load and app resume (background→foreground)
  useEffect(() => {
    const reconnectIfNeeded = async () => {
      if (!socketService.isConnected) {
        const lastServer = await storageService.getLastServer();
        if (lastServer) {
          const url = lastServer.startsWith('http') ? lastServer : `http://${lastServer}`;
          socketService.connect(url);
        }
      }
    };

    void reconnectIfNeeded();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconnectIfNeeded();
      }
    });

    return () => sub.remove();
  }, []);

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.backgroundSecondary,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <PaperProvider theme={isDark ? MD3DarkTheme : MD3LightTheme}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="Pairing"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Pairing" component={PairingScreen} />
          <Stack.Screen name="RemoteControl" component={RemoteControlScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

// --- Error Boundary ---
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[App] Uncaught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} resetError={this.handleReset} />;
    }
    return this.props.children;
  }
}

// --- Main App ---
export function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <SafeAreaProvider>
            <AppNavigator />
          </SafeAreaProvider>
        </ThemeProvider>
      </I18nProvider>
    </AppErrorBoundary>
  );
}
