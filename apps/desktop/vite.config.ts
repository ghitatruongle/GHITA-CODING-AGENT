import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shimPath = path.resolve(__dirname, 'src/shims.ts');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      'fs': shimPath,
      'path': shimPath,
      'os': shimPath,
      'crypto': shimPath,
      'url': shimPath,
      'net': shimPath,
      'tls': shimPath,
      'http': shimPath,
      'https': shimPath,
      'child_process': shimPath,
      'better-sqlite3': shimPath,
      'web-tree-sitter': shimPath,
      'util': shimPath,
      'node:child_process': shimPath,
      'node:util': shimPath,
      'node:fs/promises': shimPath,
      'node:fs': shimPath,
      'node:path': shimPath,
      'node:os': shimPath,
      'node:crypto': shimPath,
      'node:url': shimPath,
      'node:net': shimPath,
      'node:tls': shimPath,
      'node:http': shimPath,
      'node:https': shimPath,
    },
  },

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
    exclude: [
      '@ghita/browser-control',
      '@ghita/computer-use',
      '@ghita/ai-engine',
      '@ghita/communication',
      '@ghita/agents',
      'playwright',
      'playwright-core',
      'sharp',
      'screenshot-desktop',
      'socket.io',
    ],
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
    rollupOptions: {
      external: [],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          'tauri-vendor': ['@tauri-apps/api/window', '@tauri-apps/plugin-shell', '@tauri-apps/plugin-fs', '@tauri-apps/plugin-dialog'],
          'state-vendor': ['zustand', 'react-error-boundary', 'react-hot-toast'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});

