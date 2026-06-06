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
export const dirname = (p: string) => {
  const sep = p.includes('\\') ? '\\' : '/';
  const parts = p.split(sep).filter(Boolean);
  if (parts.length <= 1) return sep;
  parts.pop();
  return parts.join(sep);
};
export const resolve = (...args: string[]) => {
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
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
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
