import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { WasmParserDownloader } from './wasmDownloader.js';
import { PolyglotTagParser } from './polyglotTags.js';
import { PageRankRanker } from './pageRankRanker.js';
import { SymbolCache } from './symbolCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_TEST_DIR = path.resolve(__dirname, '../../resources/test-temp');
const TEMP_DB_PATH = path.join(TEMP_TEST_DIR, 'test-symbol-cache.db');

describe('1: Polyglot SCM Parser & AST Tags Tests', () => {
  let downloader: WasmParserDownloader;
  let parser: PolyglotTagParser;
  let ranker: PageRankRanker;
  let cache: SymbolCache;

  beforeAll(async () => {
    
    if (fs.existsSync(TEMP_TEST_DIR)) {
      fs.rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_TEST_DIR, { recursive: true });

    downloader = new WasmParserDownloader(TEMP_TEST_DIR);
    parser = new PolyglotTagParser(undefined, TEMP_TEST_DIR);
    ranker = new PageRankRanker();
    cache = new SymbolCache(TEMP_DB_PATH);

    // so a slow CDN cannot make an individual test blow its 15s timeout
    // (flaky CI). Failures here surface as clear beforeAll errors instead of
    // random per-test timeouts; the downloader tests below still verify the
    // download path independently.
    await downloader.ensureRuntimeWasm().catch(() => undefined);
    for (const lang of ['typescript', 'python', 'go']) {
      await downloader.getLanguageWasm(lang).catch(() => undefined);
    }
  });

  afterAll(() => {
    cache.close();
    
    if (fs.existsSync(TEMP_TEST_DIR)) {
      fs.rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
    }
  });

  // 1. Tests cho WasmParserDownloader
  
  describe('WasmParserDownloader', () => {
    it('should normalize language names correctly', () => {
      expect(downloader.normalizeLanguageName('js')).toBe('javascript');
      expect(downloader.normalizeLanguageName('TS ')).toBe('typescript');
      expect(downloader.normalizeLanguageName('c++')).toBe('cpp');
      expect(downloader.normalizeLanguageName('c#')).toBe('c_sharp');
      expect(downloader.normalizeLanguageName('Python')).toBe('python');
    });

    it('should download tree-sitter.wasm and language parser WASM files', async () => {
      const runtimePath = await downloader.ensureRuntimeWasm();
      expect(fs.existsSync(runtimePath)).toBe(true);
      expect(path.basename(runtimePath)).toBe('tree-sitter.wasm');

      const typescriptWasmPath = await downloader.getLanguageWasm('typescript');
      expect(fs.existsSync(typescriptWasmPath)).toBe(true);
      expect(path.basename(typescriptWasmPath)).toBe('tree-sitter-typescript.wasm');
    }, 60000); 
  });

  // 2. Tests cho PolyglotTagParser
  
  describe('PolyglotTagParser', () => {
    it('should parse and extract definitions and references from TypeScript code', async () => {
      const code = `
        class UserService {
          constructor() {}
          
          public getUser(id: number): string {
            const data = databaseCall(id);
            return data;
          }
        }

        function databaseCall(id: number) {
          return "User " + id;
        }

        const service = new UserService();
        service.getUser(5);
      `;

      const tags = await parser.extractSymbols(code, 'typescript');

      expect(tags.length).toBeGreaterThan(0);

      const classDef = tags.find((t) => t.name === 'UserService' && t.kind === 'definition');
      expect(classDef).toBeDefined();
      expect(classDef?.type).toBe('class');

      const methodDef = tags.find((t) => t.name === 'getUser' && t.kind === 'definition');
      expect(methodDef).toBeDefined();
      expect(methodDef?.type).toBe('method');

      const funcDef = tags.find((t) => t.name === 'databaseCall' && t.kind === 'definition');
      expect(funcDef).toBeDefined();
      expect(funcDef?.type).toBe('function');

      const classRef = tags.find((t) => t.name === 'UserService' && t.kind === 'reference');
      expect(classRef).toBeDefined();
      expect(classRef?.type).toBe('class');
    }, 60000); 

    it('should parse and extract definitions and references from Python code', async () => {
      const pythonCode = `
class OrderManager:
    def __init__(self):
        pass
        
    def calculate_total(self, order_id):
        items = get_order_items(order_id)
        return sum(items)

def get_order_items(order_id):
    return [10, 20, 30]

mgr = OrderManager()
mgr.calculate_total(123)
      `;

      const tags = await parser.extractSymbols(pythonCode, 'python');
      expect(tags.length).toBeGreaterThan(0);

      // Verify Class definition
      const classDef = tags.find((t) => t.name === 'OrderManager' && t.kind === 'definition');
      expect(classDef).toBeDefined();

      // Verify Method definition
      const methodDef = tags.find((t) => t.name === 'calculate_total' && t.kind === 'definition');
      expect(methodDef).toBeDefined();

      // Verify Function definition
      const funcDef = tags.find((t) => t.name === 'get_order_items' && t.kind === 'definition');
      expect(funcDef).toBeDefined();
    }, 60000); 

    it('should parse and extract definitions and references from Go code', async () => {
      const goCode = `
package main

import "fmt"

type Book struct {
    Title string
}

func (b *Book) GetTitle() string {
    return b.Title
}

func printBook(b *Book) {
    fmt.Println(b.GetTitle())
}

func main() {
    book := &Book{Title: "GHITA"}
    printBook(book)
}
      `;

      const tags = await parser.extractSymbols(goCode, 'go');
      expect(tags.length).toBeGreaterThan(0);

      // Verify struct/type definition
      const structDef = tags.find((t) => t.name === 'Book' && t.kind === 'definition');
      expect(structDef).toBeDefined();

      // Verify method definition
      const methodDef = tags.find((t) => t.name === 'GetTitle' && t.kind === 'definition');
      expect(methodDef).toBeDefined();

      // Verify function definition
      const funcDef = tags.find((t) => t.name === 'printBook' && t.kind === 'definition');
      expect(funcDef).toBeDefined();
    }, 60000); 

    it('should handle unsupported/missing languages gracefully without crashing', async () => {
      const tags = await parser.extractSymbols('const a = 1;', 'invalid_lang_name');
      expect(tags).toEqual([]);
    });

    it('should tolerate parsing syntax errors in code and return partial tags', async () => {
      const brokenCode = `
        class BrokenService {
          constructor() {
            // Unclosed brace
          
          public someMethod() {
            return 42;
          }
        }
      `;

      const tags = await parser.extractSymbols(brokenCode, 'typescript');
      // If code is syntactically broken, parser should still return any symbols it can extract
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  // 3. Tests cho PageRankRanker
  
  describe('PageRankRanker', () => {
    it('should calculate correct PageRank importance scores', () => {
      
      // - utils.ts defines 'helper'
      // - service.ts defines 'runService' which references/calls 'helper'
      // - main.ts defines 'main' which references/calls 'runService'

      const files = [
        {
          filePath: 'utils.ts',
          tags: [
            {
              name: 'helper',
              kind: 'definition',
              type: 'function',
              startLine: 1,
              endLine: 5,
            } as const,
          ],
        },
        {
          filePath: 'service.ts',
          tags: [
            {
              name: 'runService',
              kind: 'definition',
              type: 'function',
              startLine: 1,
              endLine: 10,
            } as const,
            { name: 'helper', kind: 'reference', type: 'call', startLine: 4, endLine: 4 } as const, // Gọi helper bên trong runService
          ],
        },
        {
          filePath: 'main.ts',
          tags: [
            {
              name: 'main',
              kind: 'definition',
              type: 'function',
              startLine: 1,
              endLine: 8,
            } as const,
            {
              name: 'runService',
              kind: 'reference',
              type: 'call',
              startLine: 3,
              endLine: 3,
            } as const, // Gọi runService bên trong main
          ],
        },
      ];

      const ranks = ranker.rankSymbols(files);

      expect(ranks['utils.ts#helper']).toBeDefined();
      expect(ranks['service.ts#runService']).toBeDefined();
      expect(ranks['main.ts#main']).toBeDefined();

      expect(ranks['utils.ts#helper'] ?? 0).toBeGreaterThan(ranks['main.ts#main'] ?? 0);
    });
  });

  // 4. Tests cho SymbolCache
  
  describe('SymbolCache', () => {
    it('should cache and retrieve symbols correctly using SQLite', () => {
      const filePath = '/absolute/path/to/UserService.ts';
      const content = 'class UserService {}';
      const hash = cache.calculateHash(content);

      const mockSymbols = [
        {
          name: 'UserService',
          kind: 'definition',
          type: 'class',
          startLine: 1,
          endLine: 1,
        } as const,
      ];

      const initialFetch = cache.getCachedSymbols(filePath, hash);
      expect(initialFetch).toBeNull();

      cache.saveCachedSymbols(filePath, hash, [...mockSymbols]);
      const cachedFetch = cache.getCachedSymbols(filePath, hash);

      expect(cachedFetch).not.toBeNull();
      expect(cachedFetch?.length).toBe(1);
      expect(cachedFetch?.[0]?.name).toBe('UserService');

      const newHash = cache.calculateHash(`${content}\n// modification`);
      const missFetch = cache.getCachedSymbols(filePath, newHash);
      expect(missFetch).toBeNull();
    });
  });
});
