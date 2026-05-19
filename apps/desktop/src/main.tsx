import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Check index.html for <div id="root">.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Notify Tauri that frontend is ready (triggers splash → main transition)
getCurrentWindow().emit('ready').catch(() => {
  // Fallback: window already visible or splash not configured
});
