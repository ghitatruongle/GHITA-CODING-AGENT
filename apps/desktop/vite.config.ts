import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Environment variables starting with TAURI_ will be exposed
  envPrefix: ['VITE_', 'TAURI_'],

  // Pre-bundle heavy deps so Tauri WebView doesn't get a mid-session reload
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-error-boundary',
      'react-hot-toast',
      'zustand',
      '@tauri-apps/api/window',
    ],
  },

  build: {
    // Tauri uses Chromium on Windows and WebKit on Linux/macOS
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
