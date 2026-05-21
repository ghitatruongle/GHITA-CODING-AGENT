// ==============================================================================
// GHITA CODING AGENT — Mobile App Root
// Navigation + SafeArea + ErrorBoundary
// ==============================================================================

import React, { Component } from 'react';
import type { ErrorInfo } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PairingScreen } from './screens/PairingScreen';
import { RemoteControlScreen } from './screens/RemoteControlScreen';
import { ErrorFallback } from './components/ErrorFallback';
import { Colors } from './theme/colors';
import type { RootStackParamList } from './navigation/types';

// --- Navigation Stack ---
const Stack = createNativeStackNavigator<RootStackParamList>();

// --- Dark Theme for React Navigation ---
const DarkNavigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.backgroundSecondary,
    text: Colors.textPrimary,
    border: Colors.border,
    notification: Colors.accent,
  },
};

// --- Error Boundary ---
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
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
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

// --- Main App ---
export function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer theme={DarkNavigationTheme}>
          <Stack.Navigator
            initialRouteName="Pairing"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="Pairing" component={PairingScreen} />
            <Stack.Screen name="RemoteControl" component={RemoteControlScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
