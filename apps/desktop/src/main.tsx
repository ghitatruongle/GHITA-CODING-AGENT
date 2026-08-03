import React from 'react';
import ReactDOM from 'react-dom/client';
import './lib/monaco-setup';
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
