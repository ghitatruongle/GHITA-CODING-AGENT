import fs from 'fs';
import path from 'path';
import * as url from 'url';
import Parser from 'web-tree-sitter';
import { WasmParserDownloader } from './wasmDownloader.js';
import type { SymbolTag } from './polyglotTags.js';

let __dirname = '';
try {
  if (typeof url.fileURLToPath === 'function') {
    __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  }
} catch (e) {
  // ignore
}

export type SupportedASTLanguage = 'kotlin' | 'scala' | 'pascal';

export interface ASTNode {
  type: string;
  name: string;
  kind: 'definition' | 'reference';
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  startCol: number; // 0-indexed
  endCol: number; // 0-indexed
  children: ASTNode[];
  parentName?: string; 
  scope: string; 
  isBroken?: boolean; 
}

export interface ProjectConfig {
  language: SupportedASTLanguage;
  framework?: string;
  buildTool?: string;
  sourceRoot?: string;
}

export class ProjectConfigSniffer {
  
  static detect(projectRoot: string): ProjectConfig {
    const files = fs.readdirSync(projectRoot);

    // Kotlin
    if (files.includes('build.gradle.kts') || files.includes('build.gradle')) {
      const isMultiplatform = files.some((f) => f.includes('kotlin-multiplatform'));
      return {
        language: 'kotlin',
        framework: isMultiplatform ? 'kotlin-multiplatform' : 'android/jvm',
        buildTool: files.includes('build.gradle.kts') ? 'gradle-kts' : 'gradle',
        sourceRoot: path.join(projectRoot, 'src'),
      };
    }

    // Scala
    if (files.includes('build.sbt') || files.includes('build.sc')) {
      return {
        language: 'scala',
        framework: files.includes('build.sc') ? 'mill' : 'sbt',
        buildTool: files.includes('build.sc') ? 'mill' : 'sbt',
        sourceRoot: path.join(projectRoot, 'src'),
      };
    }

    // Pascal
    if (
      files.some(
        (f) =>
          f.endsWith('.lpr') || f.endsWith('.lpi') || f.endsWith('.dpr') || f.endsWith('.dproj'),
      )
    ) {
      return {
        language: 'pascal',
        framework: files.some((f) => f.endsWith('.lpi')) ? 'lazarus' : 'delphi',
        buildTool: files.some((f) => f.endsWith('.lpi')) ? 'lazbuild' : 'msbuild',
        sourceRoot: projectRoot,
      };
    }

    // Fallback: detect by file extension
    const allFiles = this.walkDir(projectRoot);
    if (allFiles.some((f) => f.endsWith('.kt') || f.endsWith('.kts')))
      return { language: 'kotlin' };
    if (allFiles.some((f) => f.endsWith('.scala'))) return { language: 'scala' };
    if (allFiles.some((f) => f.endsWith('.pas') || f.endsWith('.pp')))
      return { language: 'pascal' };

    throw new Error(`Cannot detect project language in: ${projectRoot}`);
  }

  static getSourceFiles(projectRoot: string, lang: SupportedASTLanguage): string[] {
    const extensions: Record<SupportedASTLanguage, string[]> = {
      kotlin: ['.kt', '.kts'],
      scala: ['.scala'],
      pascal: ['.pas', '.pp', '.lpr', '.dpr', '.inc'],
    };

    const exts = extensions[lang];
    const allFiles = this.walkDir(projectRoot);
    return allFiles.filter((f) => exts.some((ext) => f.endsWith(ext)));
  }

  private static walkDir(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          
          if (
            !['node_modules', '.git', 'build', 'dist', 'target', '__pycache__'].includes(entry.name)
          ) {
            results.push(...this.walkDir(fullPath));
          }
        } else {
          results.push(fullPath);
        }
      }
    } catch {
      // Bỏ qua thư mục không truy cập được
    }
    return results;
  }
}

export class TolerantParser {
  private downloader: WasmParserDownloader;
  private isInitialized = false;
  private parserCache: Map<string, { parser: Parser; language: Parser.Language }> = new Map();

  constructor() {
    this.downloader = new WasmParserDownloader();
  }

  private async ensureInitialized() {
    if (this.isInitialized) return;
    const runtimeWasmPath = await this.downloader.ensureRuntimeWasm();
    await Parser.init({ locateFile: () => runtimeWasmPath });
    this.isInitialized = true;
  }

  async parseTolerant(code: string, lang: SupportedASTLanguage): Promise<Parser.Tree> {
    await this.ensureInitialized();

    const cached = this.parserCache.get(lang);
    if (cached) {
      return cached.parser.parse(code);
    }

    const wasmPath = await this.downloader.getLanguageWasm(lang);
    const language = await Parser.Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(language);

    this.parserCache.set(lang, { parser, language });
    return parser.parse(code);
  }

  isErrorNode(node: Parser.SyntaxNode): boolean {
    return node.type === 'ERROR' || node.isMissing;
  }

  async getLanguage(lang: SupportedASTLanguage): Promise<Parser.Language> {
    await this.ensureInitialized();
    const cached = this.parserCache.get(lang);
    if (cached) return cached.language;

    const wasmPath = await this.downloader.getLanguageWasm(lang);
    const language = await Parser.Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(language);
    this.parserCache.set(lang, { parser, language });
    return language;
  }
}

export class ASTExtractor {
  private tolerantParser: TolerantParser;
  private tagsDir: string;

  constructor() {
    this.tolerantParser = new TolerantParser();
    this.tagsDir = path.resolve(__dirname, '../../resources/tags');
  }

  async extractAST(code: string, lang: SupportedASTLanguage): Promise<ASTNode[]> {
    let tree: Parser.Tree;
    let language: Parser.Language;
    try {
      tree = await this.tolerantParser.parseTolerant(code, lang);
      language = await this.tolerantParser.getLanguage(lang);
    } catch (err) {
      if (lang === 'pascal') {
        return this.extractPascalFallback(code);
      }
      throw err;
    }

    const queryPath = path.join(this.tagsDir, `${lang}-tags.scm`);
    if (!fs.existsSync(queryPath)) {
      console.warn(`SCM query not found for ${lang}, returning empty AST`);
      return [];
    }

    const queryScm = fs.readFileSync(queryPath, 'utf8');
    let query: Parser.Query;
    try {
      query = language.query(queryScm);
    } catch (err) {
      console.warn(`Failed to compile query for ${lang}:`, err);
      return [];
    }

    const matches = query.matches(tree.rootNode);
    const nodes: ASTNode[] = [];
    const errorNodes: ASTNode[] = [];

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

      if (!nameNode && anchorNode) nameNode = anchorNode;
      if (!anchorNode && nameNode) {
        anchorNode = nameNode;
        anchorName = 'definition.unknown';
      }

      if (nameNode && anchorNode) {
        const kind = anchorName.startsWith('definition') ? 'definition' : 'reference';
        const type = anchorName.split('.').slice(1).join('.') || 'unknown';
        const isBroken =
          this.tolerantParser.isErrorNode(anchorNode) || this.tolerantParser.isErrorNode(nameNode);

        const astNode: ASTNode = {
          type,
          name: nameNode.text,
          kind,
          startLine: anchorNode.startPosition.row + 1,
          endLine: anchorNode.endPosition.row + 1,
          startCol: anchorNode.startPosition.column,
          endCol: anchorNode.endPosition.column,
          children: [],
          scope: '', // Sẽ được tính ở bước buildHierarchy
          isBroken,
        };

        if (isBroken) {
          errorNodes.push(astNode);
        } else {
          nodes.push(astNode);
        }
      }
    }

    this.buildHierarchy(nodes);

    return [...nodes, ...errorNodes];
  }

  private buildHierarchy(nodes: ASTNode[]): void {
    
    const definitions = nodes
      .filter((n) => n.kind === 'definition')
      .sort((a, b) => {
        const sizeA = a.endLine - a.startLine;
        const sizeB = b.endLine - b.startLine;
        return sizeB - sizeA; 
      });

    for (let j = 0; j < definitions.length; j++) {
      const child = definitions[j];
      if (!child) continue;
      let bestParent: ASTNode | null = null;
      let bestSize = Infinity;
      for (let i = 0; i < definitions.length; i++) {
        if (i === j) continue;
        const candidate = definitions[i];
        if (!candidate) continue;
        const candidateSize = candidate.endLine - candidate.startLine;
        if (
          child.startLine >= candidate.startLine &&
          child.endLine <= candidate.endLine &&
          candidateSize < bestSize
        ) {
          bestParent = candidate;
          bestSize = candidateSize;
        }
      }
      if (bestParent) {
        bestParent.children.push(child);
        child.parentName = bestParent.name;
      }
    }

    const childSet = new Set<ASTNode>();
    for (const def of definitions) {
      for (const ch of def.children) {
        childSet.add(ch);
      }
    }
    const rootDefinitions = definitions.filter((d) => !childSet.has(d));

    for (const node of rootDefinitions) {
      this.assignScope(node, '');
    }

    for (const node of nodes) {
      if (node.kind === 'reference' && !node.scope) {
        let bestParent: ASTNode | null = null;
        let bestSize = Infinity;
        for (const d of definitions) {
          const size = d.endLine - d.startLine;
          if (node.startLine >= d.startLine && node.endLine <= d.endLine && size < bestSize) {
            bestParent = d;
            bestSize = size;
          }
        }
        node.scope = bestParent ? `${bestParent.scope}.${node.name}` : node.name;
      }
    }
  }

  private assignScope(node: ASTNode, parentScope: string): void {
    node.scope = parentScope ? `${parentScope}.${node.name}` : node.name;
    for (const child of node.children) {
      this.assignScope(child, node.scope);
    }
  }

  private extractPascalFallback(code: string): ASTNode[] {
    const nodes: ASTNode[] = [];
    const lines = code.split(/\r?\n/);
    const patterns: Array<{ type: ASTNode['type']; regex: RegExp }> = [
      { type: 'module', regex: /^\s*(?:unit|program)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?/i },
      { type: 'function', regex: /^\s*procedure\s+([A-Za-z_][A-Za-z0-9_.]*)/i },
      { type: 'function', regex: /^\s*function\s+([A-Za-z_][A-Za-z0-9_.]*)/i },
      { type: 'type', regex: /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:class|record|interface|\()/i },
      { type: 'variable', regex: /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/i },
    ];

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        const match = pattern.regex.exec(line);
        const rawName = match?.[1];
        if (!rawName) continue;

        const name = rawName.split('.').pop() || rawName;
        nodes.push({
          type: pattern.type,
          name,
          kind: 'definition',
          startLine: index + 1,
          endLine: index + 1,
          startCol: Math.max(0, line.indexOf(rawName)),
          endCol: Math.max(0, line.indexOf(rawName)) + rawName.length,
          children: [],
          scope: name,
        });
        break;
      }
    });

    return nodes;
  }

  async extractSymbolTags(code: string, lang: SupportedASTLanguage): Promise<SymbolTag[]> {
    const astNodes = await this.extractAST(code, lang);
    return astNodes
      .filter((n) => !n.isBroken) 
      .map((n) => ({
        name: n.name,
        kind: n.kind,
        type: n.type,
        startLine: n.startLine,
        endLine: n.endLine,
        nodeText: undefined,
      }));
  }
}
