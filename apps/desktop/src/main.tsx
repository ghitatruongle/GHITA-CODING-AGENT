import React from 'react';
import ReactDOM from 'react-dom/client';
// Monaco setup is intentionally NOT imported here — it is heavy (~2 MB + 5
// workers) and is lazy-loaded on the CodeEditor's first mount instead.
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Check index.html for <div id="root">.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
