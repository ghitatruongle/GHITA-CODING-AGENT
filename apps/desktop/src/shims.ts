/* eslint-disable */
// Shims for Node.js modules in the browser/WebView environment

class MockClass {}

export class EventEmitter {
  private listeners: Record<string, Function[]> = {};
  on(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return this;
  }
  once(event: string, fn: Function) {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }
  off(event: string, fn: Function) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    return this;
  }
  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return false;
    this.listeners[event].forEach((f) => f(...args));
    return true;
  }
  removeAllListeners(event?: string) {
    if (event) delete this.listeners[event];
    else this.listeners = {};
    return this;
  }
}

export const createInterface = () => ({
  on: () => {},
  close: () => {},
  write: () => {},
});

// fs exports
export const existsSync = () => false;
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const appendFileSync = () => {};
export const mkdirSync = () => {};
export const readdirSync = () => [];
export const statSync = () => ({
  isDirectory: () => false,
  isFile: () => true,
  size: 0,
  mtimeMs: 0,
});
const browserRealpathSync = (path: string) => path;
browserRealpathSync.native = browserRealpathSync;
export const realpathSync = browserRealpathSync;
export const exists = () => false;
export const readFile = () => {};
export const writeFile = () => {};
export const rmSync = () => {};
export const unlinkSync = () => {};
export const rmdirSync = () => {};
export const copyFileSync = () => {};
export const renameSync = () => {};
export const watch = () => ({ close: () => {} });

export const promises = {
  readFile: async () => '',
  writeFile: async () => {},
  mkdir: async () => {},
  readdir: async () => [],
  rm: async () => {},
  stat: async () => ({
    isDirectory: () => false,
    isFile: () => true,
    size: 0,
    mtimeMs: 0,
  }),
};

// path exports
export const sep = '/';
export const dirname = (p: string) => {
  const hasWinSep = p.includes('\\');
  const sep = hasWinSep ? '\\' : '/';
  // Handle Windows drive-letter roots (e.g., 'C:\file' → 'C:\\')
  if (hasWinSep && /^[a-zA-Z]:\\[^\\]*$/.test(p)) {
    return p.slice(0, 3); // e.g. 'C:\\'
  }
  if (hasWinSep && /^[a-zA-Z]:$/.test(p)) {
    return p + '\\'; // e.g. 'C:\\'
  }
  const parts = p.split(sep).filter(Boolean);
  if (parts.length <= 1) return sep;
  parts.pop();
  const result = parts.join(sep);
  // Preserve Windows drive letter root
  if (hasWinSep && /^[a-zA-Z]:$/.test(result)) return result + '\\';
  return result;
};
export const resolve = (...args: string[]) => {
  // Detect if any arg uses Windows-style paths
  const hasWindowsPath = args.some((a) => /^[a-zA-Z]:[\\/]/.test(a) || a.includes('\\'));
  if (hasWindowsPath) {
    const joined = args.filter(Boolean).join('\\');
    return joined.replace(/[\\/]+/g, '\\').replace(/\\+$/, '');
  }
  const joined = args.filter(Boolean).join('/');
  return joined.replace(/\/+/g, '/');
};
export const join = (...args: string[]) => {
  return args.filter(Boolean).join('/').replace(/\/+/g, '/');
};
export const extname = (p: string) => {
  const b = basename(p) || '';
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(dot) : '';
};
export const basename = (p: string) => {
  const sep = p.includes('\\') ? '\\' : '/';
  const parts = p.split(sep).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
};
export const relative = () => '';
export const isAbsolute = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);

// child_process exports
export const spawn = () => ({
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  on: () => {},
});
export const exec = (_cmd: string, cb: (err: null, stdout: string, stderr: string) => void) => {
  if (cb) cb(null, '', '');
};
export const execSync = () => '';

// util exports
export const promisify =
  (fn: (...args: unknown[]) => unknown) =>
  (...args: unknown[]) =>
    Promise.resolve(fn(...args));
export const inspect = (val: unknown) => String(val);

// crypto exports
export const createHash = () => ({
  update: () => ({
    digest: () => '',
  }),
});
export const randomUUID = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
export const randomBytes = (size: number) => {
  const arr = new Uint8Array(size);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // WARNING: Math.random is NOT cryptographically secure.
    // This fallback should only be used in non-security contexts.
    console.warn('[shims] randomBytes: Web Crypto unavailable, using Math.random (insecure)');
    for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return {
    toString: (encoding?: string) => {
      if (encoding === 'hex') {
        return Array.from(arr)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      return String.fromCharCode(...arr);
    },
  };
};
export const timingSafeEqual = (a: any, b: any) => {
  // Always iterate the full length to avoid timing leaks
  const len = Math.max(a.length ?? 0, b.length ?? 0);
  let result = (a.length ?? 0) !== (b.length ?? 0) ? 1 : 0;
  for (let i = 0; i < len; i++) {
    const av = i < (a.length ?? 0) ? a[i] : 0;
    const bv = i < (b.length ?? 0) ? b[i] : 0;
    result |= av ^ bv;
  }
  return result === 0;
};

// url exports
export const fileURLToPath = (url: string) => url;
export const pathToFileURL = (p: string) => ({ href: p });

// os exports
export const homedir = () => '';
export const tmpdir = () => '';
export const platform = () => 'browser';
export const arch = () => 'javascript';
export const release = () => '';

// net, tls, http, https exports
export const createServer = () => ({ listen: () => {} });
export const parse = (urlStr: string) => new URL(urlStr);
export const format = () => '';

// better-sqlite3
export const Database = MockClass;

// @grpc/proto-loader mocks
export const loadSync = () => ({});
export const load = async () => ({});
export const fromJSON = () => ({});
export const IdempotencyLevel = {};
export const isAnyExtension = () => false;
export const Long = {};
export const loadFileDescriptorSetFromBuffer = () => ({});
export const loadFileDescriptorSetFromObject = () => ({});

// @grpc/grpc-js mocks
export const Server = MockClass;
export const ServerCredentials = {
  createInsecure: () => ({}),
  createSsl: () => ({}),
};
export const loadPackageDefinition = () => ({});
export const credentials = {
  createInsecure: () => ({}),
  createSsl: () => ({}),
};
export const status = {};
export const Metadata = MockClass;

const defaultMock = {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  realpathSync,
  exists,
  readFile,
  writeFile,
  rmSync,
  unlinkSync,
  rmdirSync,
  copyFileSync,
  renameSync,
  watch,
  promises,
  dirname,
  sep,
  resolve,
  join,
  extname,
  basename,
  relative,
  isAbsolute,
  spawn,
  exec,
  execSync,
  promisify,
  inspect,
  createHash,
  randomUUID,
  randomBytes,
  timingSafeEqual,
  fileURLToPath,
  pathToFileURL,
  homedir,
  tmpdir,
  platform,
  arch,
  release,
  createServer,
  parse,
  format,
  Database,
  EventEmitter,
  createInterface,
  loadSync,
  load,
  fromJSON,
  IdempotencyLevel,
  isAnyExtension,
  Long,
  loadFileDescriptorSetFromBuffer,
  loadFileDescriptorSetFromObject,
  Server,
  ServerCredentials,
  loadPackageDefinition,
  credentials,
  status,
  Metadata,
};

export default defaultMock;
