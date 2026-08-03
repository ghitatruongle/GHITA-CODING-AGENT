// ==============================================================================
// Monaco Editor — offline bundle setup
// ==============================================================================
// The default `@monaco-editor/react` loader fetches the full Monaco runtime from
// the jsDelivr CDN. If the user's machine is offline (corporate firewall, VPN,
// antivirus, slow/blocked CDN) the loader hangs forever and the editor only
// shows the "Đang chuẩn bị trình soạn thảo..." spinner — the user has no way
// to edit. We import `monaco-editor` directly and point the loader at the
// bundled ESM, plus hand off the language workers to vite's `?worker` plugin so
// everything runs from the local bundle.
//
// This module is imported once from `main.tsx` BEFORE any `<Editor>` mounts.
//
// Typed as untyped (no exported monaco types are needed) so we don't have to
// pull the full ambient typings into the app.
// ==============================================================================

// Side-effect import: registers Monaco's core with the AMD loader.
// P2-2 (deep review pass #2): we attempted to import the lean editor.api
// entry directly, but the bundled monaco-editor package does not ship
// TypeScript declarations for the ESM subpath. Using the package main is
// the smallest change that keeps type-checking green; the pre-bundle +
// manualChunks entries in vite.config.ts trim the dev-server cold start
// and split the chunk size for the network/CPU budget.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Wire the language workers to vite-bundled `?worker` modules so the editor
// runs entirely from the local bundle. Vite hashes each worker in `dist/assets`
// and the WebView2 handles them as module workers.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

(self as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// Point the @monaco-editor/react loader at the local bundle. With this set it
// will never reach out to the network.
loader.config({ monaco });

export {};
