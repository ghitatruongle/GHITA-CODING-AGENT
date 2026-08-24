import fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { AgentMiddleware, MiddlewareContext } from '../middleware/types.js';

export interface MarkdownRule {
  id: string;
  severity: 'error' | 'warning';
  files: string[];
  description: string;
  pattern?: string;
  astCheck?: 'any-keyword';
}

export interface CheckIssue {
  ruleId: string;
  severity: 'error' | 'warning';
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export class MarkdownRulesChecker {
  private rules: MarkdownRule[] = [];

  constructor(rulesDir?: string) {
    const dir = rulesDir ?? path.join(process.cwd(), '.ghita', 'checks');
    this.loadRules(dir);
  }

  public loadRules(dir: string): void {
    this.rules = [];
    if (!fs.existsSync(dir)) return;

    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const rule = this.parseRuleMarkdown(file.replace('.md', ''), content);
        if (rule) {
          this.rules.push(rule);
        }
      }
    } catch (err: unknown) {
      console.warn(
        `[MarkdownRulesChecker] Failed to load rules: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private parseRuleMarkdown(defaultId: string, content: string): MarkdownRule | null {
    const lines = content.split('\n');
    let severity: 'error' | 'warning' = 'error';
    let files: string[] = ['**/*.ts', '**/*.tsx'];
    let astCheck: 'any-keyword' | undefined;
    let pattern: string | undefined;
    let description = '';
    let readingDesc = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# Rule:')) {
        defaultId = trimmed.replace('# Rule:', '').trim();
      } else if (trimmed.startsWith('Severity:')) {
        const val = trimmed.replace('Severity:', '').trim().toLowerCase();
        severity = val === 'warning' ? 'warning' : 'error';
      } else if (trimmed.startsWith('Files:')) {
        files = trimmed
          .replace('Files:', '')
          .trim()
          .split(',')
          .map((f) => f.trim());
      } else if (trimmed.startsWith('ASTCheck:')) {
        const val = trimmed.replace('ASTCheck:', '').trim();
        if (val === 'any-keyword') astCheck = 'any-keyword';
      } else if (trimmed.startsWith('Pattern:')) {
        pattern = trimmed.replace('Pattern:', '').trim();
      } else if (trimmed.startsWith('## Description')) {
        readingDesc = true;
      } else if (trimmed.startsWith('##') || trimmed.startsWith('#')) {
        readingDesc = false;
      } else if (readingDesc && trimmed.length > 0) {
        description += (description ? '\n' : '') + trimmed;
      }
    }

    return {
      id: defaultId,
      severity,
      files,
      description: description || 'No description provided.',
      astCheck,
      pattern,
    };
  }

  private matchFilePattern(filePath: string, patterns: string[]): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return patterns.some((pattern) => {
      const cleanPattern = pattern.trim().replace(/\\/g, '/');
      if (cleanPattern === '**/*' || cleanPattern === '*') return true;

      if (cleanPattern.startsWith('**/')) {
        const suffix = cleanPattern.substring(2); // e.g. "/*.ts"
        if (suffix.startsWith('/*.')) {
          const ext = suffix.substring(3); // e.g. "ts" (without dot)
          return normalized.endsWith(`.${ext}`);
        }
      }
      return normalized.includes(cleanPattern);
    });
  }

  public checkFile(filePath: string, content: string): CheckIssue[] {
    const issues: CheckIssue[] = [];

    for (const rule of this.rules) {
      if (!this.matchFilePattern(filePath, rule.files)) continue;

      if (
        rule.astCheck === 'any-keyword' &&
        (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))
      ) {
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

        const visitor = (node: ts.Node) => {
          if (node.kind === ts.SyntaxKind.AnyKeyword) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              ruleId: rule.id,
              severity: rule.severity,
              filePath,
              line: line + 1, // 1-indexed
              column: character + 1, // 1-indexed
              message: rule.description,
            });
          }
          ts.forEachChild(node, visitor);
        };
        visitor(sourceFile);
      }

      if (rule.pattern) {
        try {
          const regex = new RegExp(rule.pattern, 'g');
          let match;
          while ((match = regex.exec(content)) !== null) {
            
            const index = match.index;
            const linesBefore = content.substring(0, index).split('\n');
            const line = linesBefore.length;
            const lastLine = linesBefore[linesBefore.length - 1] ?? '';
            const column = lastLine.length + 1;

            issues.push({
              ruleId: rule.id,
              severity: rule.severity,
              filePath,
              line,
              column,
              message: rule.description,
            });
          }
        } catch (err: unknown) {
          console.warn(
            `[MarkdownRulesChecker] Pattern regex error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return issues;
  }

  public getRules(): MarkdownRule[] {
    return this.rules;
  }

  public generateFix(content: string): string {
    const sourceFile = ts.createSourceFile('temp.ts', content, ts.ScriptTarget.Latest, true);
    const replacements: { start: number; end: number; text: string }[] = [];

    const visitor = (node: ts.Node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        replacements.push({
          start: node.getStart(),
          end: node.getEnd(),
          text: 'unknown',
        });
      }
      ts.forEachChild(node, visitor);
    };
    visitor(sourceFile);

    replacements.sort((a, b) => b.start - a.start);

    let fixed = content;
    for (const r of replacements) {
      fixed = fixed.substring(0, r.start) + r.text + fixed.substring(r.end);
    }
    return fixed;
  }

  public generateDiff(original: string, fixed: string): string {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');
    const diff: string[] = [];

    for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
      const orig = originalLines[i];
      const fix = fixedLines[i];
      if (orig !== fix) {
        if (orig !== undefined) diff.push(`- Dòng ${i + 1}: ${orig}`);
        if (fix !== undefined) diff.push(`+ Dòng ${i + 1}: ${fix}`);
      }
    }
    return diff.join('\n');
  }
}

export class MarkdownChecksMiddleware implements AgentMiddleware {
  readonly name = 'MarkdownChecksMiddleware';
  readonly priority = 6; 

  private checker: MarkdownRulesChecker;
  private rulesDir: string;

  constructor(rulesDir?: string) {
    this.rulesDir = rulesDir ?? path.join(process.cwd(), '.ghita', 'checks');
    this.checker = new MarkdownRulesChecker(this.rulesDir);
  }

  async preTool(
    toolName: string,
    args: Record<string, unknown>,
    _context: MiddlewareContext,
  ): Promise<{ proceed: boolean; reason?: string } | void> {
    const writeTools = [
      'writeFile',
      'write_to_file',
      'replace_file_content',
      'multi_replace_file_content',
    ];
    if (!writeTools.includes(toolName)) return;

    const targetPath = (args.TargetFile ||
      args.targetFile ||
      args.filePath ||
      args.targetPath) as string;
    const newContent = (args.CodeContent ||
      args.codeContent ||
      args.ReplacementContent ||
      args.replacementContent ||
      args.content) as string;

    if (!targetPath || !newContent) return;

    const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath);

    this.checker.loadRules(this.rulesDir);
    const issues = this.checker.checkFile(resolvedPath, newContent);

    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      
      this.logViolations(resolvedPath, errors);

      const errorDetail = errors
        .map((e) => `- [Dòng ${e.line}, Cột ${e.column}] Lỗi [${e.ruleId}]: ${e.message}`)
        .join('\n');

      const proposedFix = this.checker.generateFix(newContent);
      const proposedDiff = this.checker.generateDiff(newContent, proposedFix);
      const diffSection = proposedDiff
        ? `\n\n💡 Đề xuất tự động sửa đổi chuẩn cú pháp:\n\`\`\`diff\n${proposedDiff}\n\`\`\``
        : '';

      return {
        proceed: false,
        reason: `[CI CHECK GATE BLOCKED (AST-RULE-001)]\nLưu tệp tin bị từ chối do vi phạm quy chuẩn code sạch được định nghĩa trong '.ghita/checks/'.\nChi tiết vi phạm:\n${errorDetail}${diffSection}\nVui lòng sửa đổi lại code để tiếp tục.`,
      };
    }
    return { proceed: true };
  }

  private logViolations(filePath: string, errors: CheckIssue[]): void {
    try {
      const logDir = path.join(process.cwd(), '.ghita');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'markdown-checks-violations.log');
      const timestamp = new Date().toISOString();
      for (const e of errors) {
        const logMsg = `[${timestamp}] [VIOLATION] File: ${filePath} Line: ${e.line} Rule: ${e.ruleId} - ${e.message}\n`;
        fs.appendFileSync(logPath, logMsg, 'utf8');
      }
    } catch {
      // Tránh crash
    }
  }
}
