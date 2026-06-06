// ==============================================================================
// GHITA CODING AGENT - Phase 13: AST Parser
// ==============================================================================
// Extracts functions, classes, interfaces, types, enums, variables from
// TypeScript/JavaScript source files using the TypeScript Compiler API.
// Also extracts import declarations for building the dependency graph.
// ==============================================================================

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import type { CodeNode, CodeEdge, ImportInfo, CodeNodeKind, ParseOptions } from './types.js';

// ---------------------------------------------------------------------------
// Default parse options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: Required<ParseOptions> = {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  exclude: ['node_modules', 'dist', 'build', '.git', '.turbo'],
  maxFileSize: 512_000, // 500 KB
  extractDocs: true,
};

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively discover source files under a directory.
 */
export function discoverFiles(dir: string, options?: ParseOptions): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (opts.exclude.some((ex) => entry.name === ex || entry.name.startsWith(ex))) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        if (opts.exclude.some((ex) => entry.name.includes(ex))) continue;
        const ext = path.extname(entry.name);
        if (!opts.extensions.includes(ext)) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > opts.maxFileSize) continue;
        } catch {
          continue;
        }

        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Node ID generation
// ---------------------------------------------------------------------------

function makeNodeId(filePath: string, qualifiedName: string): string {
  return `${filePath}::${qualifiedName}`;
}

// ---------------------------------------------------------------------------
// JSDoc extraction
// ---------------------------------------------------------------------------

function extractJSDoc(node: ts.Node): string | undefined {
  const jsDoc = ts.getJSDocCommentsAndTags(node);
  if (!jsDoc || jsDoc.length === 0) return undefined;

  const parts: string[] = [];
  for (const doc of jsDoc) {
    if (ts.isJSDoc(doc) && doc.comment) {
      if (typeof doc.comment === 'string') {
        parts.push(doc.comment);
      } else {
        // NodeArray<JSDocComment>
        for (const c of doc.comment) {
          parts.push(c.text);
        }
      }
    }
  }

  const text = parts.join('\n').trim();
  return text.length > 0 ? text.slice(0, 500) : undefined;
}

// ---------------------------------------------------------------------------
// Source excerpt
// ---------------------------------------------------------------------------

function extractExcerpt(sourceFile: ts.SourceFile, node: ts.Node, maxLen = 200): string {
  const start = node.getStart(sourceFile);
  const end = Math.min(node.getEnd(), start + maxLen);
  return sourceFile.text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Line number helper
// ---------------------------------------------------------------------------

function getLine(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

export interface ParseResult {
  nodes: CodeNode[];
  edges: CodeEdge[];
  imports: ImportInfo[];
}

/**
 * Parse a single source file and extract:
 * - Functions, classes, methods, interfaces, types, enums, variables
 * - Import declarations
 * - Call references (basic heuristic)
 * - Contains edges (class → method)
 */
export function parseFile(filePath: string, options?: ParseOptions): ParseResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const absolutePath = path.resolve(filePath);

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    return { nodes: [], edges: [], imports: [] };
  }

  if (content.length > opts.maxFileSize) {
    return { nodes: [], edges: [], imports: [] };
  }

  const sourceFile = ts.createSourceFile(
    absolutePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const imports: ImportInfo[] = [];
  const now = Date.now();

  // --- Extract top-level module node ---
  const moduleName = path.basename(absolutePath, path.extname(absolutePath));
  const moduleId = makeNodeId(absolutePath, moduleName);
  nodes.push({
    id: moduleId,
    kind: 'module',
    name: moduleName,
    qualifiedName: moduleName,
    filePath: absolutePath,
    startLine: 1,
    endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1,
    excerpt: '',
    exported: false,
    tags: [moduleName.toLowerCase(), path.basename(absolutePath).toLowerCase()],
    indexedAt: now,
  });

  // --- Walk AST ---
  function visit(node: ts.Node, parentQualifiedName?: string, parentId?: string): void {
    // Import declarations
    if (ts.isImportDeclaration(node)) {
      extractImport(node, absolutePath, imports);
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);
      const exported = hasExportModifier(node);

      nodes.push({
        id: nodeId,
        kind: 'function',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parameters: node.parameters.map((p) => p.name.getText(sourceFile)),
        returnType: node.type?.getText(sourceFile),
        parentId,
        tags: buildTags(name, qualifiedName, 'function'),
        indexedAt: now,
      });

      if (parentId) {
        edges.push({ from: parentId, to: nodeId, kind: 'contains', weight: 1.0 });
      }
      if (exported) {
        edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
      }
    }

    // Arrow functions / function expressions assigned to variables
    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const isFunc =
            ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer) ||
            ts.isCallExpression(decl.initializer);

          if (isFunc) {
            const name = decl.name.text;
            const qualifiedName = parentQualifiedName
              ? `${parentQualifiedName}.${name}`
              : name;
            const nodeId = makeNodeId(absolutePath, qualifiedName);

            nodes.push({
              id: nodeId,
              kind: 'function',
              name,
              qualifiedName,
              filePath: absolutePath,
              startLine: getLine(sourceFile, node.getStart(sourceFile)),
              endLine: getLine(sourceFile, node.getEnd()),
              excerpt: extractExcerpt(sourceFile, node),
              exported,
              docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
              parameters: extractArrowParams(decl.initializer, sourceFile),
              parentId,
              tags: buildTags(name, qualifiedName, 'function'),
              indexedAt: now,
            });

            if (exported) {
              edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
            }
          } else {
            // Plain variable/const
            const name = decl.name.text;
            const qualifiedName = parentQualifiedName
              ? `${parentQualifiedName}.${name}`
              : name;
            const nodeId = makeNodeId(absolutePath, qualifiedName);

            nodes.push({
              id: nodeId,
              kind: 'variable',
              name,
              qualifiedName,
              filePath: absolutePath,
              startLine: getLine(sourceFile, node.getStart(sourceFile)),
              endLine: getLine(sourceFile, node.getEnd()),
              excerpt: extractExcerpt(sourceFile, node, 120),
              exported,
              parentId,
              tags: buildTags(name, qualifiedName, 'variable'),
              indexedAt: now,
            });

            if (exported) {
              edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 0.8 });
            }
          }
        }
      }
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);
      const exported = hasExportModifier(node);

      nodes.push({
        id: nodeId,
        kind: 'class',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parentId,
        tags: buildTags(name, qualifiedName, 'class'),
        indexedAt: now,
      });

      // Extends edge
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const expr of clause.types) {
              edges.push({
                from: nodeId,
                to: expr.expression.getText(sourceFile),
                kind: 'extends',
                weight: 1.0,
                line: getLine(sourceFile, clause.getStart(sourceFile)),
              });
            }
          }
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const expr of clause.types) {
              edges.push({
                from: nodeId,
                to: expr.expression.getText(sourceFile),
                kind: 'implements',
                weight: 1.0,
                line: getLine(sourceFile, clause.getStart(sourceFile)),
              });
            }
          }
        }
      }

      if (exported) {
        edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
      }

      // Visit class members
      for (const member of node.members) {
        visit(member, qualifiedName, nodeId);
      }
      return;
    }

    // Class methods
    if (ts.isMethodDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const qualifiedName = parentQualifiedName
        ? `${parentQualifiedName}.${name}`
        : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);

      nodes.push({
        id: nodeId,
        kind: 'method',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported: false,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parameters: node.parameters.map((p) => p.name.getText(sourceFile)),
        returnType: node.type?.getText(sourceFile),
        parentId,
        tags: buildTags(name, qualifiedName, 'method'),
        indexedAt: now,
      });

      if (parentId) {
        edges.push({ from: parentId, to: nodeId, kind: 'contains', weight: 1.0 });
      }
      return;
    }

    // Class properties
    if (ts.isPropertyDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const qualifiedName = parentQualifiedName
        ? `${parentQualifiedName}.${name}`
        : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);

      nodes.push({
        id: nodeId,
        kind: 'property',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node, 120),
        exported: false,
        parentId,
        tags: buildTags(name, qualifiedName, 'property'),
        indexedAt: now,
      });

      if (parentId) {
        edges.push({ from: parentId, to: nodeId, kind: 'contains', weight: 0.8 });
      }
      return;
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);
      const exported = hasExportModifier(node);

      nodes.push({
        id: nodeId,
        kind: 'interface',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parentId,
        tags: buildTags(name, qualifiedName, 'interface'),
        indexedAt: now,
      });

      if (exported) {
        edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
      }
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);
      const exported = hasExportModifier(node);

      nodes.push({
        id: nodeId,
        kind: 'type',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parentId,
        tags: buildTags(name, qualifiedName, 'type'),
        indexedAt: now,
      });

      if (exported) {
        edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
      }
    }

    // Enum declarations
    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const qualifiedName = parentQualifiedName ? `${parentQualifiedName}.${name}` : name;
      const nodeId = makeNodeId(absolutePath, qualifiedName);
      const exported = hasExportModifier(node);

      nodes.push({
        id: nodeId,
        kind: 'enum',
        name,
        qualifiedName,
        filePath: absolutePath,
        startLine: getLine(sourceFile, node.getStart(sourceFile)),
        endLine: getLine(sourceFile, node.getEnd()),
        excerpt: extractExcerpt(sourceFile, node),
        exported,
        docComment: opts.extractDocs ? extractJSDoc(node) : undefined,
        parentId,
        tags: buildTags(name, qualifiedName, 'enum'),
        indexedAt: now,
      });

      if (exported) {
        edges.push({ from: moduleId, to: nodeId, kind: 'exports', weight: 1.0 });
      }
    }

    // Default: recurse into children
    ts.forEachChild(node, (child) => visit(child, parentQualifiedName, parentId));
  }

  ts.forEachChild(sourceFile, (child) => visit(child));

  return { nodes, edges, imports };
}

/**
 * Parse multiple files and merge results.
 */
export function parseFiles(filePaths: string[], options?: ParseOptions): ParseResult {
  const allNodes: CodeNode[] = [];
  const allEdges: CodeEdge[] = [];
  const allImports: ImportInfo[] = [];

  for (const fp of filePaths) {
    const result = parseFile(fp, options);
    allNodes.push(...result.nodes);
    allEdges.push(...result.edges);
    allImports.push(...result.imports);
  }

  return { nodes: allNodes, edges: allEdges, imports: allImports };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function buildTags(name: string, qualifiedName: string, kind: CodeNodeKind): string[] {
  const tags = new Set<string>();
  tags.add(name.toLowerCase());
  tags.add(kind);

  // Split camelCase / PascalCase into words
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
  for (const w of words) {
    if (w.length > 1) tags.add(w);
  }

  // Add parts of qualified name
  const parts = qualifiedName.split('.');
  for (const p of parts) {
    tags.add(p.toLowerCase());
  }

  return [...tags];
}

function extractImport(
  node: ts.ImportDeclaration,
  sourceFile: string,
  imports: ImportInfo[],
): void {
  const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
  const isTypeOnly = node.importClause?.isTypeOnly ?? false;
  const line =
    ts.getLineAndCharacterOfPosition(
      node.getSourceFile(),
      node.getStart(),
    ).line + 1;

  const namedImports: string[] = [];
  let defaultImport: string | undefined;
  let namespaceImport: string | undefined;

  if (node.importClause) {
    if (node.importClause.name) {
      defaultImport = node.importClause.name.text;
    }

    if (node.importClause.namedBindings) {
      if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        namespaceImport = node.importClause.namedBindings.name.text;
      } else if (ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          namedImports.push(element.name.text);
        }
      }
    }
  }

  imports.push({
    moduleSpecifier,
    namedImports,
    defaultImport,
    namespaceImport,
    isTypeOnly,
    sourceFile,
    line,
  });
}

function extractArrowParams(
  initializer: ts.Expression,
  sourceFile: ts.SourceFile,
): string[] | undefined {
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return initializer.parameters.map((p) => p.name.getText(sourceFile));
  }
  return undefined;
}
