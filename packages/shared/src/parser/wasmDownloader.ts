import fs from 'fs';
import path from 'path';
import * as url from 'url';

let __filename = '';
let __dirname = '';
try {
  if (typeof url.fileURLToPath === 'function') {
    __filename = url.fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  }
} catch (e) {
  // ignore
}

const DEFAULT_PARSERS_DIR = __dirname ? path.resolve(__dirname, '../../resources/parsers') : '';
const CDN_BASE_URL = 'https://unpkg.com/tree-sitter-wasms@0.1.11/out';

export class WasmParserDownloader {
  private parsersDir: string;

  constructor(customParsersDir?: string) {
    this.parsersDir = customParsersDir || DEFAULT_PARSERS_DIR;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(this.parsersDir)) {
      fs.mkdirSync(this.parsersDir, { recursive: true });
    }
  }

  public normalizeLanguageName(lang: string): string {
    const l = lang.toLowerCase().trim();
    if (l === 'c++' || l === 'cpp') return 'cpp';
    if (l === 'c#') return 'c_sharp';
    if (l === 'csharp') return 'c_sharp';
    if (l === 'c-sharp') return 'c_sharp';
    if (l === 'js') return 'javascript';
    if (l === 'ts') return 'typescript';
    if (l === 'kt') return 'kotlin';
    if (l === 'pp') return 'pascal';
    if (l === 'delphi') return 'pascal';
    return l;
  }

  public async ensureRuntimeWasm(): Promise<string> {
    const targetPath = path.join(this.parsersDir, 'tree-sitter.wasm');
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    try {
      const nodeModulesWasm = path.resolve(
        __dirname,
        '../../../../node_modules/web-tree-sitter/tree-sitter.wasm',
      );
      if (fs.existsSync(nodeModulesWasm)) {
        fs.copyFileSync(nodeModulesWasm, targetPath);
        return targetPath;
      }
    } catch (err) {
      console.warn('Không thể sao chép tree-sitter.wasm từ node_modules:', err);
    }

    const url = 'https://unpkg.com/web-tree-sitter@0.22.4/tree-sitter.wasm';
    console.info(`Đang tải tree-sitter.wasm từ ${url}...`);
    await this.downloadFile(url, targetPath);
    return targetPath;
  }

  public async getLanguageWasm(lang: string): Promise<string> {
    const normalized = this.normalizeLanguageName(lang);
    const filename = `tree-sitter-${normalized}.wasm`;
    const targetPath = path.join(this.parsersDir, filename);

    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    if (normalized === 'pascal') {
      throw new Error(
        'WASM parser for Pascal is not bundled; ASTExtractor will use its built-in Pascal fallback.',
      );
    }

    const url = `${CDN_BASE_URL}/${filename}`;
    console.info(`Đang tải WASM parser cho ${normalized} từ ${url}...`);
    try {
      await this.downloadFile(url, targetPath);
    } catch (err) {
      
      console.error(`Không thể tải WASM parser cho ${normalized}:`, err);
      throw new Error(`Failed to load WASM parser for language: ${normalized}`);
    }

    return targetPath;
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
  }
}
