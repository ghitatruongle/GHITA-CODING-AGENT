// ==============================================================================
// GHITA CODING AGENT - Polyglot SCM Tag Parser
// ==============================================================================

import fs from 'fs';
import path from 'path';
import * as url from 'url';
import Parser from 'web-tree-sitter';
import { WasmParserDownloader } from './wasmDownloader.js';

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

const DEFAULT_TAGS_DIR = __dirname ? path.resolve(__dirname, '../../resources/tags') : '';

export interface SymbolTag {
  name: string;
  kind: 'definition' | 'reference';
  type: string;
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  nodeText?: string;
}

export class PolyglotTagParser {
  private downloader: WasmParserDownloader;
  private tagsDir: string;
  private isInitialized = false;

  // Cache các parser và language để tối ưu hóa hiệu năng
  private parserCache: Map<string, { parser: Parser; language: Parser.Language }> = new Map();

  constructor(customTagsDir?: string, customParsersDir?: string) {
    this.tagsDir = customTagsDir || DEFAULT_TAGS_DIR;
    this.downloader = new WasmParserDownloader(customParsersDir);
  }

  /**
   * Khởi chạy tree-sitter runtime
   */
  private async ensureInitialized() {
    if (this.isInitialized) return;

    const runtimeWasmPath = await this.downloader.ensureRuntimeWasm();
    await Parser.init({
      locateFile: () => runtimeWasmPath,
    });
    this.isInitialized = true;
  }

  /**
   * Lấy parser và language instance đã được cấu hình cho ngôn ngữ đó
   */
  private async getParserForLanguage(
    lang: string,
  ): Promise<{ parser: Parser; language: Parser.Language }> {
    await this.ensureInitialized();
    const normalized = this.downloader.normalizeLanguageName(lang);

    const cached = this.parserCache.get(normalized);
    if (cached) return cached;

    const wasmPath = await this.downloader.getLanguageWasm(normalized);
    const language = await Parser.Language.load(wasmPath);

    const parser = new Parser();
    parser.setLanguage(language);

    const instance = { parser, language };
    this.parserCache.set(normalized, instance);
    return instance;
  }

  /**
   * Đọc nội dung tệp .scm tương ứng của ngôn ngữ
   */
  private getQueryScmContent(lang: string): string {
    const normalized = this.downloader.normalizeLanguageName(lang);
    const queryPath = path.join(this.tagsDir, `${normalized}-tags.scm`);

    if (!fs.existsSync(queryPath)) {
      throw new Error(`SCM query file not found at: ${queryPath}`);
    }

    return fs.readFileSync(queryPath, 'utf8');
  }

  /**
   * Bóc tách toàn bộ Symbol định nghĩa và tham chiếu từ chuỗi mã nguồn
   * @param code Mã nguồn cần phân tích
   * @param lang Ngôn ngữ lập trình (ví dụ: 'typescript', 'go', 'python')
   */
  public async extractSymbols(code: string, lang: string): Promise<SymbolTag[]> {
    const normalized = this.downloader.normalizeLanguageName(lang);

    try {
      const { parser, language } = await this.getParserForLanguage(normalized);
      const queryScm = this.getQueryScmContent(normalized);

      const tree = parser.parse(code);
      const query = language.query(queryScm);
      const matches = query.matches(tree.rootNode);

      const tags: SymbolTag[] = [];

      for (const match of matches) {
        let nameNode: Parser.SyntaxNode | null = null;
        let anchorNode: Parser.SyntaxNode | null = null;
        let anchorName = '';

        for (const capture of match.captures) {
          if (capture.name.startsWith('name.')) {
            nameNode = capture.node;
          } else {
            anchorNode = capture.node;
            anchorName = capture.name;
          }
        }

        // Cơ chế fallback nếu không bắt được cặp name/anchor chuẩn
        if (!nameNode && anchorNode) {
          nameNode = anchorNode;
        }
        if (!anchorNode && nameNode) {
          anchorNode = nameNode;
          anchorName = 'definition.unknown';
        }

        if (nameNode && anchorNode) {
          const kind = anchorName.startsWith('definition') ? 'definition' : 'reference';
          const type = anchorName.split('.').slice(1).join('.') || 'unknown';

          tags.push({
            name: nameNode.text,
            kind,
            type,
            startLine: anchorNode.startPosition.row + 1,
            endLine: anchorNode.endPosition.row + 1,
            nodeText: anchorNode.text,
          });
        }
      }

      return tags;
    } catch (err) {
      console.error(`Lỗi khi bóc tách symbol cho ngôn ngữ ${lang}:`, err);
      // Trả về mảng rỗng để chống đổ bể luồng xử lý chính của repomap (Tolerant Parser)
      return [];
    }
  }
}
