// ==============================================================================
// GHITA CODING AGENT — Phase 5: Socratic Docs-Aware /grill-me (DocsGriller)
// ==============================================================================
// Nâng cấp lệnh /grill-me: quét docs/, đối chiếu cosine similarity,
// phát hiện mâu thuẫn kiến trúc, lưu lịch sử vào .ghita/grill-history.json
// Tham chiếu: Matt's Skills (grill-with-docs)
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** Markdown structural element extracted from a doc file */
export interface DocSection {
  /** Section heading (e.g., "## API Design") */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Line number in the source file */
  lineStart: number;
  /** Section body text */
  content: string;
  /** Code blocks found within this section */
  codeBlocks: CodeBlock[];
  /** API endpoints found in this section */
  apiEndpoints: string[];
  /** Function/method signatures found in this section */
  signatures: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  lineStart: number;
}

/** Source code file metadata for cross-referencing */
export interface SourceCodeRef {
  /** Relative path to the source file */
  filePath: string;
  /** File extension */
  extension: string;
  /** Exported function/class/variable names */
  exportedSymbols: string[];
  /** API route patterns (e.g., "/api/users") */
  apiRoutes: string[];
  /** Last modified timestamp */
  lastModified: number;
}

export interface DocEntry {
  /** Relative path to the doc file */
  filePath: string;
  /** Raw text content */
  content: string;
  /** Last commit timestamp (epoch ms) — newest = ground truth */
  lastModified: number;
  /** Simple TF-IDF-like keyword vector */
  vector: Map<string, number>;
  /** Parsed markdown structure */
  sections: DocSection[];
}

/** Grilling mode controls question count and depth */
export type GrillMode = 'quick' | 'deep' | 'adversarial';

export const GRILL_MODE_LIMITS: Record<GrillMode, number> = {
  quick: 5,
  deep: 15,
  adversarial: 20,
};

export interface GrillQuestion {
  /** The Socratic question targeting a design assumption */
  question: string;
  /** Which doc file(s) triggered this question */
  sourceDocs: string[];
  /** Which source code file(s) are referenced */
  sourceCodeFiles: string[];
  /** Severity: 'info' | 'warning' | 'contradiction' */
  severity: 'info' | 'warning' | 'contradiction';
}

export interface GrillSession {
  id: string;
  timestamp: string;
  docsPath: string;
  docsScanned: number;
  mode: GrillMode;
  questions: GrillQuestion[];
  contradictions: Contradiction[];
  docCodeContradictions: DocCodeContradiction[];
  userAnswers: Record<string, string>;
  designDecisions: string[];
}

export interface Contradiction {
  topic: string;
  docA: { file: string; excerpt: string };
  docB: { file: string; excerpt: string };
  severity: 'minor' | 'major' | 'critical';
  recommendation: string;
}

/** Contradiction between doc claims and actual source code */
export interface DocCodeContradiction {
  /** What the doc claims */
  docClaim: string;
  /** Which doc file makes the claim */
  docFile: string;
  /** Which code file contradicts it */
  codeFile: string;
  /** What the code actually does */
  codeReality: string;
  severity: 'minor' | 'major' | 'critical';
}

export interface DocsGrillerConfig {
  /** Root directory containing docs (default: 'docs/') */
  docsPath?: string;
  /** Root directory containing source code (default: project root) */
  srcPath?: string;
  /** File extensions to scan (default: ['.md', '.txt']) */
  extensions?: string[];
  /** Source code extensions for cross-referencing (default: ['.ts', '.tsx', '.js', '.jsx']) */
  srcExtensions?: string[];
  /** Max questions to generate per session (default: 10) */
  maxQuestions?: number;
  /** Grilling mode (default: 'deep') */
  mode?: GrillMode;
  /** Path to store grill history (default: '.ghita/grill-history.json') */
  historyPath?: string;
  /** Similarity threshold for contradiction detection (0-1, default: 0.6) */
  similarityThreshold?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility: Simple vector math & text processing
// ──────────────────────────────────────────────────────────────────────────────

/** Tokenize text into lowercase words, removing punctuation */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ_\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Build a simple TF (term frequency) vector from tokens */
function buildVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  // Normalize by total token count
  const total = tokens.length || 1;
  for (const [k, v] of freq) {
    freq.set(k, v / total);
  }
  return freq;
}

/** Cosine similarity between two sparse vectors */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, va] of a) {
    normA += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) {
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Extract key sentences containing a keyword */
function extractExcerpt(content: string, keyword: string, contextLines = 2): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.toLowerCase().includes(keyword.toLowerCase())) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length, i + contextLines + 1);
      return lines.slice(start, end).join('\n').trim();
    }
  }
  // Fallback: first 200 chars
  return content.slice(0, 200).trim() + '...';
}

// ──────────────────────────────────────────────────────────────────────────────
// Markdown Structure Parser
// ──────────────────────────────────────────────────────────────────────────────

/** Parse markdown content into structured sections */
function parseMarkdownStructure(content: string): DocSection[] {
  const lines = content.split('\n');
  const sections: DocSection[] = [];
  let currentSection: DocSection | null = null;
  let currentCodeBlock: CodeBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Detect code block boundaries
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (currentCodeBlock) {
        // Closing code block
        if (currentSection) {
          currentSection.codeBlocks.push(currentCodeBlock);
        }
        currentCodeBlock = null;
      } else {
        // Opening code block
        currentCodeBlock = {
          language: codeBlockMatch[1] || 'text',
          code: '',
          lineStart: i + 1,
        };
      }
      continue;
    }

    if (currentCodeBlock) {
      currentCodeBlock.code += (currentCodeBlock.code ? '\n' : '') + line;
      continue;
    }

    // Detect headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: headingMatch[2]!.trim(),
        level: headingMatch[1]!.length,
        lineStart: i + 1,
        content: '',
        codeBlocks: [],
        apiEndpoints: [],
        signatures: [],
      };
      continue;
    }

    // Accumulate section content
    if (currentSection) {
      currentSection.content += (currentSection.content ? '\n' : '') + line;

      // Extract API endpoints (GET/POST/PUT/DELETE/PATCH /path patterns)
      const apiMatch = line.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[\w/{}:$-]+)/gi);
      if (apiMatch) {
        for (const match of apiMatch) {
          const endpoint = match.trim();
          if (!currentSection.apiEndpoints.includes(endpoint)) {
            currentSection.apiEndpoints.push(endpoint);
          }
        }
      }

      // Also match route patterns like "/api/v1/users" or "router.get('/path')"
      const routeMatch = line.match(/['"`](\/api\/[\w/{}:$-]+)['"`]/g);
      if (routeMatch) {
        for (const match of routeMatch) {
          const endpoint = match.replace(/['"`]/g, '');
          if (!currentSection.apiEndpoints.includes(endpoint)) {
            currentSection.apiEndpoints.push(endpoint);
          }
        }
      }

      // Extract function/method signatures
      const sigMatch = line.match(/(?:function|const|let|var|async)\s+(\w+)\s*\([^)]*\)/);
      if (sigMatch) {
        const sig = sigMatch[0]!.trim();
        if (!currentSection.signatures.includes(sig)) {
          currentSection.signatures.push(sig);
        }
      }

      // TypeScript/JS class method signatures
      const methodMatch = line.match(/(?:public|private|protected|async)?\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?/);
      if (methodMatch && methodMatch[0]!.includes('(') && !currentSection.signatures.includes(methodMatch[0]!.trim())) {
        // Avoid duplicates and trivial matches
        if (methodMatch[0]!.length > 10) {
          currentSection.signatures.push(methodMatch[0]!.trim());
        }
      }
    }
  }

  // Push last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

// ──────────────────────────────────────────────────────────────────────────────
// Source Code Scanner for Cross-Referencing
// ──────────────────────────────────────────────────────────────────────────────

/** Extract exported symbols from a TypeScript/JavaScript source file */
function extractSourceSymbols(content: string, filePath: string): SourceCodeRef {
  const ext = path.extname(filePath);
  const exportedSymbols: string[] = [];
  const apiRoutes: string[] = [];

  // Extract exported functions, classes, variables, interfaces
  const exportPatterns = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g,
    /export\s+(?:default\s+)?class\s+(\w+)/g,
    /export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)/g,
    /export\s+interface\s+(\w+)/g,
    /export\s+type\s+(\w+)/g,
    /export\s+enum\s+(\w+)/g,
  ];

  for (const pattern of exportPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const symbol = match[1]!;
      if (!exportedSymbols.includes(symbol)) {
        exportedSymbols.push(symbol);
      }
    }
  }

  // Extract API routes from router/app definitions
  const routePatterns = [
    /(?:router|app)\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /\.route\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const pattern of routePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const route = match[1]!;
      if (!apiRoutes.includes(route)) {
        apiRoutes.push(route);
      }
    }
  }

  return {
    filePath,
    extension: ext,
    exportedSymbols,
    apiRoutes,
    lastModified: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Core: DocsGriller Engine
// ──────────────────────────────────────────────────────────────────────────────

export class DocsGriller {
  private config: Required<DocsGrillerConfig>;
  private docs: DocEntry[] = [];
  private sourceFiles: SourceCodeRef[] = [];
  private crossRefMap: Map<string, string[]> = new Map(); // docFile → [sourceFiles]

  constructor(config: DocsGrillerConfig = {}) {
    this.config = {
      docsPath: config.docsPath ?? 'docs/',
      srcPath: config.srcPath ?? '.',
      extensions: config.extensions ?? ['.md', '.txt'],
      srcExtensions: config.srcExtensions ?? ['.ts', '.tsx', '.js', '.jsx'],
      maxQuestions: config.maxQuestions ?? 10,
      mode: config.mode ?? 'deep',
      historyPath: config.historyPath ?? '.ghita/grill-history.json',
      similarityThreshold: config.similarityThreshold ?? 0.6,
    };
  }

  // ── Step 1: Scan & index local docs ────────────────────────────────────

  /** Scan all docs in the configured directory, sorted by git commit time */
  async scanLocalDocs(docsPath?: string): Promise<DocEntry[]> {
    const targetDir = docsPath ?? this.config.docsPath;
    const resolvedDir = path.resolve(targetDir);

    if (!fs.existsSync(resolvedDir)) {
      console.warn(`[DocsGriller] docs directory not found: ${resolvedDir}`);
      return [];
    }

    const files = this.walkDir(resolvedDir);
    const entries: DocEntry[] = [];

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!this.config.extensions.includes(ext)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lastModified = this.getGitCommitTime(filePath) ?? fs.statSync(filePath).mtimeMs;
        const vector = buildVector(tokenize(content));
        const sections = parseMarkdownStructure(content);

        entries.push({
          filePath: path.relative(resolvedDir, filePath),
          content,
          lastModified,
          vector,
          sections,
        });
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by git commit time DESC — newest first (newest = ground truth)
    entries.sort((a, b) => b.lastModified - a.lastModified);

    this.docs = entries;
    return entries;
  }

  // ── Step 2: Scan source code for cross-referencing ─────────────────────

  /** Scan source code files and build cross-reference map */
  async scanSourceCode(srcPath?: string): Promise<SourceCodeRef[]> {
    const targetDir = srcPath ?? this.config.srcPath;
    const resolvedDir = path.resolve(targetDir);

    if (!fs.existsSync(resolvedDir)) {
      return [];
    }

    const files = this.walkDir(resolvedDir);
    const refs: SourceCodeRef[] = [];

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!this.config.srcExtensions.includes(ext)) continue;

      // Skip test files, node_modules, dist, build
      const relPath = path.relative(resolvedDir, filePath);
      if (relPath.includes('node_modules') || relPath.includes('dist/') || relPath.includes('.test.')) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const ref = extractSourceSymbols(content, relPath);
        ref.lastModified = this.getGitCommitTime(filePath) ?? fs.statSync(filePath).mtimeMs;
        refs.push(ref);
      } catch {
        // Skip unreadable files
      }
    }

    this.sourceFiles = refs;
    this.buildCrossReferenceMap();
    return refs;
  }

  /** Build cross-reference map linking doc sections to source code files */
  private buildCrossReferenceMap(): void {
    this.crossRefMap = new Map();

    for (const doc of this.docs) {
      const linkedFiles: string[] = [];
      const docTokens = new Set(tokenize(doc.content));

      for (const src of this.sourceFiles) {
        // Check if doc mentions source file path
        if (doc.content.includes(src.filePath) || doc.content.includes(path.basename(src.filePath, path.extname(src.filePath)))) {
          linkedFiles.push(src.filePath);
          continue;
        }

        // Check if doc mentions any exported symbols
        for (const symbol of src.exportedSymbols) {
          if (docTokens.has(symbol.toLowerCase()) || doc.content.includes(symbol)) {
            linkedFiles.push(src.filePath);
            break;
          }
        }

        // Check if doc mentions API routes that match source code routes
        for (const route of src.apiRoutes) {
          if (doc.content.includes(route)) {
            if (!linkedFiles.includes(src.filePath)) {
              linkedFiles.push(src.filePath);
            }
            break;
          }
        }
      }

      this.crossRefMap.set(doc.filePath, [...new Set(linkedFiles)]);
    }
  }

  /** Get cross-reference map (doc → source files) */
  getCrossReferenceMap(): Map<string, string[]> {
    return this.crossRefMap;
  }

  // ── Step 3: Detect contradictions between docs ────────────────────────

  /** Detect contradictions: same topic, different docs, high similarity but divergent content */
  detectContradictions(): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const sharedTopics = this.findSharedTopics();

    for (const [topic, docFiles] of sharedTopics) {
      // Compare pairwise docs that share this topic
      for (let i = 0; i < docFiles.length; i++) {
        for (let j = i + 1; j < docFiles.length; j++) {
          const docA = this.docs.find((d) => d.filePath === docFiles[i]);
          const docB = this.docs.find((d) => d.filePath === docFiles[j]);
          if (!docA || !docB) continue;

          const sim = cosineSimilarity(docA.vector, docB.vector);

          // High similarity + same topic = potential contradiction or redundancy
          if (sim >= this.config.similarityThreshold) {
            const excerptA = extractExcerpt(docA.content, topic);
            const excerptB = extractExcerpt(docB.content, topic);

            // Determine severity based on similarity distance from 1.0
            let severity: Contradiction['severity'];
            if (sim >= 0.9) {
              severity = 'minor'; // Redundancy, not contradiction
            } else if (sim >= 0.75) {
              severity = 'major';
            } else {
              severity = 'critical';
            }

            // Use newest doc as ground truth
            const newerDoc = docA.lastModified >= docB.lastModified ? docA : docB;
            const olderDoc = docA.lastModified >= docB.lastModified ? docB : docA;

            contradictions.push({
              topic,
              docA: { file: olderDoc.filePath, excerpt: excerptA },
              docB: { file: newerDoc.filePath, excerpt: excerptB },
              severity,
              recommendation: `Use "${newerDoc.filePath}" as ground truth (newer commit). Review and update "${olderDoc.filePath}".`,
            });
          }
        }
      }
    }

    // Deduplicate by topic+file pair
    const seen = new Set<string>();
    return contradictions.filter((c) => {
      const key = `${c.topic}|${c.docA.file}|${c.docB.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Step 3b: Detect contradictions between docs and source code ───────

  /** Compare doc claims against actual source code */
  detectDocCodeContradictions(): DocCodeContradiction[] {
    const contradictions: DocCodeContradiction[] = [];

    for (const doc of this.docs) {
      const linkedFiles = this.crossRefMap.get(doc.filePath) ?? [];

      for (const srcRef of this.sourceFiles) {
        // Only check source files that are linked to this doc
        const isLinked = linkedFiles.includes(srcRef.filePath);

        // Check for API endpoint mismatches
        const docSections = doc.sections;
        for (const section of docSections) {
          for (const endpoint of section.apiEndpoints) {
            // Doc mentions an API endpoint that doesn't exist in any source file
            const existsInCode = this.sourceFiles.some((s) =>
              s.apiRoutes.some((r) => endpoint.includes(r) || r.includes(endpoint.replace(/\s*(GET|POST|PUT|DELETE|PATCH)\s+/i, '')))
            );
            if (!existsInCode) {
              contradictions.push({
                docClaim: `API endpoint "${endpoint}" documented in "${doc.filePath}"`,
                docFile: doc.filePath,
                codeFile: '(no source file found)',
                codeReality: 'Endpoint not found in any source code file',
                severity: 'major',
              });
            }
          }

          // Check for function signatures mentioned in docs but missing from code
          for (const sig of section.signatures) {
            const funcName = sig.match(/(?:function|const|let|var|async)\s+(\w+)/)?.[1];
            if (funcName && isLinked) {
              const srcFile = this.sourceFiles.find((s) => s.filePath === linkedFiles[0]);
              if (srcFile && !srcFile.exportedSymbols.includes(funcName)) {
                contradictions.push({
                  docClaim: `Function "${funcName}" documented in "${doc.filePath}" section "${section.heading}"`,
                  docFile: doc.filePath,
                  codeFile: srcFile.filePath,
                  codeReality: `Function "${funcName}" not found as an export in "${srcFile.filePath}"`,
                  severity: 'major',
                });
              }
            }
          }
        }

      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return contradictions.filter((c) => {
      const key = `${c.docClaim}|${c.codeFile}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Step 4: Generate Socratic questions ───────────────────────────────

  /** Generate probing questions based on docs analysis */
  generateQuestions(contradictions?: Contradiction[], mode?: GrillMode): GrillQuestion[] {
    const issues = contradictions ?? this.detectContradictions();
    const questions: GrillQuestion[] = [];
    const limit = GRILL_MODE_LIMITS[mode ?? this.config.mode];

    // Questions from contradictions
    for (const issue of issues) {
      if (questions.length >= limit) break;
      if (issue.severity === 'critical') {
        questions.push({
          question: `CRITICAL: Topic "${issue.topic}" is defined differently in "${issue.docA.file}" vs "${issue.docB.file}". Which version should be the canonical design?`,
          sourceDocs: [issue.docA.file, issue.docB.file],
          sourceCodeFiles: this.getCrossReferenceMap().get(issue.docA.file) ?? [],
          severity: 'contradiction',
        });
      } else if (issue.severity === 'major') {
        questions.push({
          question: `WARNING: "${issue.topic}" appears to have divergent descriptions in "${issue.docA.file}" and "${issue.docB.file}". Should these be reconciled?`,
          sourceDocs: [issue.docA.file, issue.docB.file],
          sourceCodeFiles: this.getCrossReferenceMap().get(issue.docA.file) ?? [],
          severity: 'contradiction',
        });
      }
    }

    // Questions from doc-code contradictions
    const docCodeIssues = this.detectDocCodeContradictions();
    for (const issue of docCodeIssues) {
      if (questions.length >= limit) break;
      questions.push({
        question: `DOC-CODE MISMATCH: ${issue.docClaim}. However, ${issue.codeReality}. Which is correct — the doc or the code?`,
        sourceDocs: [issue.docFile],
        sourceCodeFiles: [issue.codeFile],
        severity: issue.severity === 'critical' ? 'contradiction' : 'warning',
      });
    }

    // Questions from shared topics (design consistency checks)
    const sharedTopics = this.findSharedTopics();
    const topTopics = [...sharedTopics.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    for (const [topic, files] of topTopics) {
      if (questions.length >= limit) break;
      if (!questions.some((q) => q.sourceDocs.some((f) => files.includes(f)))) {
        const linkedSrcFiles = files.flatMap((f) => this.crossRefMap.get(f) ?? []);
        questions.push({
          question: `Topic "${topic}" is referenced across ${files.length} docs (${files.join(', ')}). Is the current design intentionally consistent, or does it need a unified specification?`,
          sourceDocs: files,
          sourceCodeFiles: [...new Set(linkedSrcFiles)],
          severity: 'warning',
        });
      }
    }

    // Generic architectural probing questions (for deep/adversarial modes)
    if (this.docs.length > 0 && questions.length < limit) {
      const genericQuestions: Array<{ question: string; severity: GrillQuestion['severity'] }> = [
        {
          question: 'What is the single source of truth for the system architecture? Are there any undocumented assumptions?',
          severity: 'info',
        },
        {
          question: 'Are there any deprecated APIs or modules still referenced in the docs that should be cleaned up?',
          severity: 'info',
        },
        {
          question: 'Does the current error handling strategy cover all edge cases documented in the design specs?',
          severity: 'warning',
        },
      ];

      // Extra adversarial questions
      if ((mode ?? this.config.mode) === 'adversarial') {
        genericQuestions.push(
          {
            question: 'If the lead architect left today, could a new developer understand the system solely from these docs?',
            severity: 'warning',
          },
          {
            question: 'Are there any circular dependencies or implicit coupling between modules that the docs fail to capture?',
            severity: 'warning',
          },
          {
            question: 'What happens if the primary database goes down? Is the failover strategy documented and tested?',
            severity: 'warning',
          },
          {
            question: 'Are there any security assumptions in the docs that are not enforced in the actual code?',
            severity: 'contradiction',
          },
        );
      }

      for (const gq of genericQuestions) {
        if (questions.length >= limit) break;
        questions.push({
          question: gq.question,
          sourceDocs: this.docs.map((d) => d.filePath),
          sourceCodeFiles: [],
          severity: gq.severity,
        });
      }
    }

    return questions.slice(0, limit);
  }

  // ── Step 5: Find shared topics across docs ────────────────────────────

  /** Find topic keywords that appear across multiple docs */
  findSharedTopics(): Map<string, string[]> {
    const topicDocs = new Map<string, string[]>();

    for (const doc of this.docs) {
      // Get top-10 keywords by TF score
      const sorted = [...doc.vector.entries()].sort((a, b) => b[1] - a[1]);
      const topKeywords = sorted.slice(0, 15).map(([k]) => k);

      for (const kw of topKeywords) {
        if (!topicDocs.has(kw)) topicDocs.set(kw, []);
        topicDocs.get(kw)!.push(doc.filePath);
      }
    }

    // Only keep topics that appear in 2+ docs (cross-referenced)
    const shared = new Map<string, string[]>();
    for (const [topic, files] of topicDocs) {
      if (files.length >= 2) shared.set(topic, files);
    }
    return shared;
  }

  // ── Step 6: Compare user answer against docs ──────────────────────────

  /** Compare user's design answer against existing doc content using cosine similarity */
  compareAnswer(answer: string): {
    matches: Array<{ doc: string; similarity: number; excerpt: string }>;
    contradictions: Array<{ doc: string; topic: string; detail: string }>;
  } {
    const answerVector = buildVector(tokenize(answer));
    const matches: Array<{ doc: string; similarity: number; excerpt: string }> = [];
    const contradictions: Array<{ doc: string; topic: string; detail: string }> = [];

    for (const doc of this.docs) {
      const sim = cosineSimilarity(answerVector, doc.vector);

      if (sim >= 0.3) {
        matches.push({
          doc: doc.filePath,
          similarity: Math.round(sim * 100) / 100,
          excerpt: doc.content.slice(0, 200).trim(),
        });
      }

      // If similarity is very low (< 0.15) and doc is dense, flag potential contradiction
      if (sim < 0.15 && doc.content.length > 500) {
        const topKeywords = [...answerVector.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k);

        for (const kw of topKeywords) {
          if (!doc.vector.has(kw)) {
            contradictions.push({
              doc: doc.filePath,
              topic: kw,
              detail: `Your answer mentions "${kw}" but "${doc.filePath}" does not cover this topic.`,
            });
          }
        }
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);
    return { matches, contradictions };
  }

  // ── Step 7: Full grill session ────────────────────────────────────────

  /** Run a complete grill session: scan → detect → generate questions */
  async runGrillSession(docsPath?: string, mode?: GrillMode): Promise<GrillSession> {
    await this.scanLocalDocs(docsPath);
    await this.scanSourceCode();

    const contradictions = this.detectContradictions();
    const docCodeContradictions = this.detectDocCodeContradictions();
    const questions = this.generateQuestions(contradictions, mode);

    const session: GrillSession = {
      id: `grill_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      docsPath: docsPath ?? this.config.docsPath,
      docsScanned: this.docs.length,
      mode: mode ?? this.config.mode,
      questions,
      contradictions,
      docCodeContradictions,
      userAnswers: {},
      designDecisions: [],
    };

    // Auto-save history
    this.saveSession(session);

    return session;
  }

  /** Record a user's answer to a grill question */
  recordAnswer(session: GrillSession, questionIdx: number, answer: string): GrillSession {
    const question = session.questions[questionIdx];
    if (question) {
      session.userAnswers[question.question] = answer;

      // Compare answer against docs
      const comparison = this.compareAnswer(answer);
      const significant = comparison.matches.filter((m) => m.similarity >= 0.4);
      if (significant.length > 0) {
        session.designDecisions.push(
          `Q${questionIdx + 1}: Answer aligns with ${significant.map((m) => m.doc).join(', ')} (sim: ${significant[0]!.similarity})`,
        );
      }
      if (comparison.contradictions.length > 0) {
        session.designDecisions.push(
          `Q${questionIdx + 1}: CONTRADICTION — ${comparison.contradictions.map((c) => c.detail).join('; ')}`,
        );
      }
    }
    return session;
  }

  // ── Step 8: Format report ─────────────────────────────────────────────

  /** Format a grill session into a human-readable report */
  formatReport(session: GrillSession): string {
    const lines: string[] = [
      `# /grill-me Session Report`,
      `**ID:** ${session.id}`,
      `**Date:** ${session.timestamp}`,
      `**Docs Scanned:** ${session.docsScanned}`,
      `**Mode:** ${session.mode} (${GRILL_MODE_LIMITS[session.mode]} questions max)`,
      `**Source Files Linked:** ${this.crossRefMap.size} doc-source mappings`,
      '',
    ];

    if (session.docsScanned === 0) {
      lines.push('> No documents found in docs/ directory. Add .md or .txt design files to enable Socratic grilling.');
      return lines.join('\n');
    }

    // Doc-Code Contradictions
    if (session.docCodeContradictions.length > 0) {
      lines.push(`## Doc-Code Mismatches (${session.docCodeContradictions.length})`);
      for (const c of session.docCodeContradictions) {
        lines.push(`- [${c.severity.toUpperCase()}] ${c.docClaim}`);
        lines.push(`  Reality: ${c.codeReality}`);
        lines.push(`  Doc: \`${c.docFile}\` | Code: \`${c.codeFile}\``);
      }
      lines.push('');
    }

    // Doc contradictions
    if (session.contradictions.length > 0) {
      lines.push(`## Contradictions Found (${session.contradictions.length})`);
      for (const c of session.contradictions) {
        lines.push(`### [${c.severity.toUpperCase()}] Topic: "${c.topic}"`);
        lines.push(`- **Older:** \`${c.docA.file}\``);
        lines.push(`  > ${c.docA.excerpt.split('\n').slice(0, 2).join(' ')}`);
        lines.push(`- **Newer (ground truth):** \`${c.docB.file}\``);
        lines.push(`  > ${c.docB.excerpt.split('\n').slice(0, 2).join(' ')}`);
        lines.push(`- **Recommendation:** ${c.recommendation}`);
        lines.push('');
      }
    } else {
      lines.push('## No Contradictions Detected');
      lines.push('> All documents appear consistent.');
      lines.push('');
    }

    // Questions with source citations
    lines.push(`## Socratic Questions (${session.questions.length})`);
    for (let i = 0; i < session.questions.length; i++) {
      const q = session.questions[i]!;
      const icon = q.severity === 'contradiction' ? '!!' : q.severity === 'warning' ? '!' : '?';
      lines.push(`${i + 1}. [${icon}] ${q.question}`);
      lines.push(`   Docs: ${q.sourceDocs.join(', ')}`);
      if (q.sourceCodeFiles.length > 0) {
        lines.push(`   Code: ${q.sourceCodeFiles.join(', ')}`);
      }
      const answer = session.userAnswers[q.question];
      if (answer) {
        lines.push(`   **Your answer:** ${answer}`);
      }
      lines.push('');
    }

    // Design decisions
    if (session.designDecisions.length > 0) {
      lines.push('## Design Decisions');
      for (const d of session.designDecisions) {
        lines.push(`- ${d}`);
      }
    }

    return lines.join('\n');
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private saveSession(session: GrillSession): void {
    try {
      const historyPath = path.resolve(this.config.historyPath);
      const dir = path.dirname(historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let history: GrillSession[] = [];
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      }

      // Keep last 50 sessions
      history.push(session);
      if (history.length > 50) history = history.slice(-50);

      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[DocsGriller] Failed to save session history:', err);
    }
  }

  /** Load previous grill sessions */
  loadHistory(): GrillSession[] {
    try {
      const historyPath = path.resolve(this.config.historyPath);
      if (!fs.existsSync(historyPath)) return [];
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  // ── File system helpers ────────────────────────────────────────────────

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules, .git, dist
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            results.push(...this.walkDir(fullPath));
          }
        } else {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible dirs
    }
    return results;
  }

  private getGitCommitTime(filePath: string): number | null {
    try {
      const timestamp = execSync(
        `git log -1 --format=%ct "${filePath}"`,
        { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      const epoch = parseInt(timestamp, 10);
      return isNaN(epoch) ? null : epoch * 1000;
    } catch {
      return null;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory: create /grill-me slash command
// ──────────────────────────────────────────────────────────────────────────────

export function createGrillMeCommand(griller?: DocsGriller): {
  name: string;
  description: string;
  trigger: string;
  usage: string;
  execute: (args: string) => Promise<string>;
} {
  const engine = griller ?? new DocsGriller();

  return {
    name: 'Grill Me',
    description: 'Socratic docs-aware design interview: scan docs/, detect contradictions, probe design assumptions',
    trigger: '/grill-me',
    usage: '/grill-me [docs-path] [quick|deep|adversarial]',
    execute: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      let docsPath: string | undefined;
      let mode: GrillMode | undefined;

      for (const part of parts) {
        if (part === 'quick' || part === 'deep' || part === 'adversarial') {
          mode = part;
        } else if (part && !docsPath) {
          docsPath = part;
        }
      }

      const session = await engine.runGrillSession(docsPath, mode);
      return engine.formatReport(session);
    },
  };
}
