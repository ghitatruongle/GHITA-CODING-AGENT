// ==============================================================================
// GHITA CODING AGENT — App Root
// ==============================================================================

import { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';
import { MainLayout } from './layouts/MainLayout';
import { Toast } from './components/Toast';
import { useAppStore } from './stores/appStore';

function AppContent() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <MainLayout />
      <Toast />
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppContent />
    </ErrorBoundary>
  );
}
