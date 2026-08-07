// ==============================================================================
// GHITA CODING AGENT — File Explorer Utilities & Constants
// ==============================================================================

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  expanded?: boolean;
}

export interface FileExplorerProps {
  onFileOpen: (
    path: string,
    name: string,
    content: string,
    language: string,
    encoding?: string,
    isTruncated?: boolean,
  ) => void;
  rootPath?: string;
}

// Language detection from file extension
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.dart': 'dart',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'shell',
  '.dockerfile': 'dockerfile',
  '.docker': 'dockerfile',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
};

const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.bin',
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.mp3',
  '.wav',
  '.flac',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.dmg',
  '.pkg',
  '.apk',
  '.ipa',
]);

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  '.next',
  'dist',
  'build',
  '.turbo',
  '__pycache__',
  '.vscode',
  '.idea',
]);

export const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export function detectLanguage(filename: string): string {
  const ext =
    filename.lastIndexOf('.') >= 0 ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower === 'cmake') return 'cmake';
  if (lower.endsWith('.lock')) return 'json';
  return 'plaintext';
}

export function isBinaryFile(filename: string): boolean {
  const ext =
    filename.lastIndexOf('.') >= 0 ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  return BINARY_EXTS.has(ext);
}

export function fileIcon(name: string): string {
  const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  const map: Record<string, string> = {
    '.ts': '🔷',
    '.tsx': '⚛️',
    '.js': '🟡',
    '.jsx': '⚛️',
    '.json': '📋',
    '.html': '🌐',
    '.css': '🎨',
    '.scss': '🎨',
    '.py': '🐍',
    '.rs': '🦀',
    '.go': '🔵',
    '.java': '☕',
    '.md': '📝',
    '.yml': '⚙️',
    '.yaml': '⚙️',
    '.toml': '⚙️',
    '.sh': '🐚',
    '.ps1': '💠',
    '.sql': '🗄️',
    '.xml': '📄',
    '.vue': '💚',
    '.svelte': '🔥',
    '.dockerfile': '🐳',
    '.gitignore': '🙈',
    '.env': '🔐',
  };
  if (map[ext]) return map[ext];
  if (name.startsWith('.')) return '⚙️';
  return '📄';
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compute the new absolute path when renaming an entry, preserving the parent
 * directory and the original path separator style. The new name is basename
 * only — any path separators in it are rejected (returns null) to avoid moving
 * the file out of its folder.
 */
export function renamePath(oldPath: string, newName: string): string | null {
  const trimmed = newName.trim();
  // deep-review fix (L4): also reject `.` and `..` — renaming an entry to `..`
  // would silently "rename" it to its parent directory.
  if (trimmed.length === 0 || /[/\\]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
    return null;
  }
  const sep = oldPath.includes('\\') && !oldPath.includes('/') ? '\\' : '/';
  const idx = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'));
  if (idx === -1) return trimmed;
  const parent = oldPath.slice(0, idx);
  return `${parent}${sep}${trimmed}`;
}
