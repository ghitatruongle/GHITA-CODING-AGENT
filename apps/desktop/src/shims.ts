// Shims for Node.js modules in the browser/WebView environment

class MockClass {}

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
export const dirname = (p: string) => p;
export const resolve = (...args: string[]) => args.join('/');
export const join = (...args: string[]) => args.join('/');
export const extname = () => '';
export const basename = (p: string) => p;
export const relative = () => '';
export const isAbsolute = () => false;

// child_process exports
export const spawn = () => ({
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  on: () => {},
});
export const exec = (_cmd: string, cb: any) => {
  if (cb) cb(null, '', '');
};
export const execSync = () => '';

// util exports
export const promisify = (fn: any) => (...args: any[]) => Promise.resolve(fn(...args));
export const inspect = (val: any) => String(val);

// crypto exports
export const createHash = () => ({
  update: () => ({
    digest: () => '',
  }),
});
export const randomUUID = () => '';

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
};

export default defaultMock;
