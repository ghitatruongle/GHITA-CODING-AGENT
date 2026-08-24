// Extension types for CodeView, FileExplorer, EditorTabBar components.

export interface EditorTab {
  /** Absolute path on disk */
  path: string;
  /** Display name (basename) */
  name: string;
  /** Language id (vd: 'typescript', 'rust', 'markdown') */
  language: string;
  
  content: string;
  
  savedContent: string;
  /** Cached icon hint (vd: 'file-code', 'file-text') */
  iconHint?: string;
  /** Truncated path for tooltip (vd: 'src/components/Foo.tsx') */
  displayPath?: string;
  
  readonly?: boolean;
  /** Encoding (vd: 'utf-8', 'utf-16le') */
  encoding?: string;
}

export type FileEntryState = 'clean' | 'dirty' | 'saving' | 'error' | 'loading';

export interface FileExplorerNode {
  /** Absolute path */
  path: string;
  /** Display name */
  name: string;
  
  type: 'file' | 'directory' | 'symlink';
  
  size?: number;
  /** Last modified (epoch ms) */
  modifiedAt?: number;
  
  children?: FileExplorerNode[];
  
  state?: FileEntryState;
  /** Git status (optional) */
  gitStatus?: 'untracked' | 'modified' | 'added' | 'deleted' | 'renamed' | 'ignored';
  
  expanded?: boolean;
  /** Depth trong tree (root = 0) */
  depth: number;
  
  matched?: boolean;
}

export interface EditorTabBarState {
  
  tabs: EditorTab[];
  
  activePath: string;
  
  dirtyCount: number;
  
  maxTabs: number;
  
  showCloseButton: boolean;
  
  wrapTabs: boolean;
}

/** Settings cho CodeView (save behavior, formatting) */
export interface EditorSettings {
  /** Auto-save: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange' */
  autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
  /** Auto-save delay (ms) khi autoSave = 'afterDelay' */
  autoSaveDelayMs: number;
  /** Format on save */
  formatOnSave: boolean;
  /** Trim trailing whitespace on save */
  trimTrailingWhitespaceOnSave: boolean;
  /** Insert final newline on save */
  insertFinalNewlineOnSave: boolean;
  /** Default line ending */
  defaultLineEnding: 'lf' | 'crlf' | 'cr';
  /** Word wrap */
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  /** Font size (px) */
  fontSize: number;
  /** Tab size (spaces) */
  tabSize: number;
  /** Minimap enabled */
  minimap: boolean;
  /** Bracket pair colorization */
  bracketPairColorization: boolean;
  /** Render whitespace characters */
  renderWhitespace: 'none' | 'selection' | 'boundary' | 'all';
}

/** Default settings */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  autoSave: 'afterDelay',
  autoSaveDelayMs: 1000,
  formatOnSave: false,
  trimTrailingWhitespaceOnSave: true,
  insertFinalNewlineOnSave: false,
  defaultLineEnding: 'lf',
  wordWrap: 'off',
  fontSize: 14,
  tabSize: 2,
  minimap: true,
  bracketPairColorization: true,
  renderWhitespace: 'selection',
};

/** File operation log (cho FileExplorer operations) */
export interface FileOperationLogEntry {
  timestamp: number;
  operation: 'open' | 'close' | 'save' | 'rename' | 'delete' | 'create' | 'move' | 'copy';
  path: string;
  newPath?: string;
  success: boolean;
  error?: string;
}

export type DirtyFileMap = Map<string, boolean> | Record<string, boolean>;

export function isDirty(map: DirtyFileMap, path: string): boolean {
  if (map instanceof Map) return map.get(path) === true;
  return map[path] === true;
}

/** Helper: set dirty state */
export function setDirty(map: DirtyFileMap, path: string, dirty: boolean): void {
  if (map instanceof Map) {
    if (dirty) map.set(path, true);
    else map.delete(path);
  } else {
    if (dirty) map[path] = true;
    else delete map[path];
  }
}

/** Helper: count dirty files */
export function countDirty(map: DirtyFileMap): number {
  if (map instanceof Map) {
    let c = 0;
    for (const v of map.values()) if (v) c++;
    return c;
  }
  return Object.values(map).filter(Boolean).length;
}

export function detectLanguageFromExt(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    mdx: 'markdown',
    txt: 'plaintext',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    xml: 'xml',
    svg: 'xml',
    vue: 'vue',
    svelte: 'svelte',
    lua: 'lua',
    r: 'r',
    dart: 'dart',
    zig: 'zig',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };
  return map[ext] ?? 'plaintext';
}

/** Compute diff stats between saved & current content (line counts) */
export interface DiffStats {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  totalLines: number;
}

export function computeDiffStats(saved: string, current: string): DiffStats {
  const savedLines = saved.split(/\r?\n/);
  const currentLines = current.split(/\r?\n/);
  const savedSet = new Set(savedLines);
  const currentSet = new Set(currentLines);
  let added = 0;
  let removed = 0;
  for (const l of currentLines) if (!savedSet.has(l)) added++;
  for (const l of savedLines) if (!currentSet.has(l)) removed++;
  return {
    addedLines: added,
    removedLines: removed,
    modifiedLines: Math.min(added, removed),
    totalLines: currentLines.length,
  };
}
