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
      fs: shimPath,
      path: shimPath,
      os: shimPath,
      crypto: shimPath,
      url: shimPath,
      net: shimPath,
      tls: shimPath,
      http: shimPath,
      https: shimPath,
      child_process: shimPath,
      'better-sqlite3': shimPath,
      ioredis: shimPath,
      '@dqbd/tiktoken': shimPath,
      'js-tiktoken': shimPath,
      'web-tree-sitter': shimPath,
      util: shimPath,
      events: shimPath,
      readline: shimPath,
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
      'node:events': shimPath,
      'node:readline': shimPath,
      stream: shimPath,
      'node:stream': shimPath,
      buffer: shimPath,
      'node:buffer': shimPath,
      string_decoder: shimPath,
      'node:string_decoder': shimPath,
      '@grpc/grpc-js': shimPath,
      '@grpc/proto-loader': shimPath,
      ws: shimPath,
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
    esbuildOptions: {
      target: 'esnext',
    },
    exclude: [
      '@ghita/browser-control',
      '@ghita/computer-use',
      '@ghita/ai-engine',
      '@ghita/communication',
      '@ghita/agents',
      '@ghita/skills',
      '@ghita/monitoring',
      '@ghita/quotas',
      '@sentry/node-core',
      '@sentry/node',
      '@opentelemetry/api',
      '@grpc/grpc-js',
      '@grpc/proto-loader',
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
      'zustand/middleware',
      '@tauri-apps/api/core',
      '@tauri-apps/api/event',
      '@tauri-apps/api/window',
      '@tauri-apps/plugin-dialog',
      // P2-2 (deep review pass #2): pre-bundle the wrapped monaco-editor
      // module so the first dev-server cold start doesn't stall on Vite
      // walking the entire ESM graph on-the-fly.
      '@monaco-editor/react',
      'monaco-editor',
      'socket.io-client',
    ],
  },

  build: {
    // Tauri uses Chromium on Windows and WebKit on Linux/macOS
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: Boolean(process.env.TAURI_DEBUG),
    rollupOptions: {
      // Sentry Node-side modules are server-only; they leak into the browser
      // bundle via @ghita/monitoring re-exports. Mark them external so the
      // bundler skips them entirely on the WebView target.
      external: [
        '@sentry/node-core',
        '@sentry/node',
        '@sentry-internal/node-core',
        '@opentelemetry/api',
        '@opentelemetry/sdk-node',
        '@opentelemetry/auto-instrumentations-node',
        'diagnostics_channel',
        'node:diagnostics_channel',
        'worker_threads',
        'node:worker_threads',
        'inspector',
        'node:inspector',
        'zlib',
        'node:zlib',
        'module',
      ],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          'tauri-vendor': ['@tauri-apps/api/window', '@tauri-apps/plugin-dialog'],
          'state-vendor': ['zustand', 'react-error-boundary', 'react-hot-toast'],
          'socket-vendor': ['socket.io-client'],
          // Markdown rendering is heavy (react-markdown + rehype-sanitize + remark-gfm);
          // split it out so chat UI loads fast.
          'markdown-vendor': ['react-markdown', 'rehype-sanitize', 'remark-gfm'],
          // v0.4.9 B1: Monaco editor and xterm are large, independently-loaded
          // vendors. Splitting them keeps the initial app shell small so the
          // Tauri WebView paints fast on Windows cold start.
          'monaco-vendor': ['@monaco-editor/react', 'monaco-editor'],
          'xterm-vendor': ['@xterm/xterm', '@xterm/addon-fit'],
        },
      },
    },
    // 4 MB covers the code-graph dynamic chunk (tree-sitter WASM ~3 MB);
    // smaller chunks split cleanly into the manualChunks groups.
    chunkSizeWarningLimit: 4000,
  },
});
