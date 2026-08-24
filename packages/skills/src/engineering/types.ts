// Type definitions for the Socratic docs-aware /grill-me system.
// Extracted from docsGriller.ts for modularity.

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
