// Browser shims required before any bundled code runs.
// Loaded synchronously from index.html; kept external so CSP can forbid inline scripts.
window.global = window;
window.process = {
  env: { NODE_ENV: typeof window !== 'undefined' && window.__TAURI__ ? 'production' : (location.hostname === 'localhost' ? 'development' : 'production') },
  platform: 'browser',
  browser: true,
  cwd: () => '/',
  argv: [],
  nextTick: typeof queueMicrotask === 'function' ? queueMicrotask : (cb) => Promise.resolve().then(cb),
};
