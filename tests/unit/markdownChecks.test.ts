import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MarkdownRulesChecker,
  MarkdownChecksMiddleware,
} from '../../packages/agents/src/checker/markdownRules.js';

describe('11: Source-Controlled Markdown CI Checks Gates Unit Tests', () => {
  const tempDir = path.resolve('temp-checks-test');

  beforeEach(() => {
    vi.restoreAllMocks();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('1. Rule Parsing & Loading', () => {
    it('should parse markdown rule format correctly', () => {
      const ruleMd = `
# Rule: any-prevention
Severity: error
Files: **/*.ts, **/*.tsx
ASTCheck: any-keyword

## Description
Any type is strictly prohibited in our production code.
`;
      const rulePath = path.join(tempDir, 'any-prevention.md');
      fs.writeFileSync(rulePath, ruleMd, 'utf8');

      const checker = new MarkdownRulesChecker(tempDir);
      const rules = checker.getRules();

      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe('any-prevention');
      expect(rules[0].severity).toBe('error');
      expect(rules[0].files).toEqual(['**/*.ts', '**/*.tsx']);
      expect(rules[0].astCheck).toBe('any-keyword');
      expect(rules[0].description).toContain('Any type is strictly prohibited');
    });

    it('should parse warning severity and regex patterns', () => {
      const ruleMd = `
# Rule: no-eval
Severity: warning
Files: **/*.js
Pattern: \\beval\\(

## Description
Eval functions are unsafe.
`;
      const rulePath = path.join(tempDir, 'no-eval.md');
      fs.writeFileSync(rulePath, ruleMd, 'utf8');

      const checker = new MarkdownRulesChecker(tempDir);
      const rules = checker.getRules();

      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe('no-eval');
      expect(rules[0].severity).toBe('warning');
      expect(rules[0].files).toEqual(['**/*.js']);
      expect(rules[0].pattern).toBe('\\beval\\(');
    });
  });

  describe('2. AST Checks Enforcement (typescript Compiler)', () => {
    it('should detect TSAnyKeyword (any keyword) in TS code with precise line and column', () => {
      const ruleMd = `
# Rule: no-any
Severity: error
Files: **/*.ts
ASTCheck: any-keyword

## Description
Forbidden any type.
`;
      fs.writeFileSync(path.join(tempDir, 'no-any.md'), ruleMd, 'utf8');
      const checker = new MarkdownRulesChecker(tempDir);

      const invalidCode = `
function test(param: any): void {
  const x: any = 10;
}
`;
      const issues = checker.checkFile('src/index.ts', invalidCode);
      expect(issues.length).toBe(2);

      // Issue 1: param: any
      expect(issues[0].ruleId).toBe('no-any');
      expect(issues[0].line).toBe(2);
      expect(issues[0].column).toBe(22);

      // Issue 2: const x: any
      expect(issues[1].line).toBe(3);
      expect(issues[1].column).toBe(12);
    });

    it('should not detect anything in clean code without any type', () => {
      const ruleMd = `
# Rule: no-any
Severity: error
Files: **/*.ts
ASTCheck: any-keyword

## Description
Forbidden any type.
`;
      fs.writeFileSync(path.join(tempDir, 'no-any.md'), ruleMd, 'utf8');
      const checker = new MarkdownRulesChecker(tempDir);

      const cleanCode = `
function test(param: number): void {
  const x: string = "hello";
}
`;
      const issues = checker.checkFile('src/index.ts', cleanCode);
      expect(issues.length).toBe(0);
    });
  });

  describe('3. Regex Pattern Checks', () => {
    it('should match code text patterns using regex', () => {
      const ruleMd = `
# Rule: no-todo
Severity: warning
Files: **/*.ts
Pattern: TODO:

## Description
Please resolve all pending TODOs.
`;
      fs.writeFileSync(path.join(tempDir, 'no-todo.md'), ruleMd, 'utf8');
      const checker = new MarkdownRulesChecker(tempDir);

      const code = `
// TODO: refactor this method
const x = 10;
`;
      const issues = checker.checkFile('src/main.ts', code);
      expect(issues.length).toBe(1);
      expect(issues[0].ruleId).toBe('no-todo');
      expect(issues[0].line).toBe(2);
      expect(issues[0].column).toBe(4);
    });
  });

  describe('4. MarkdownChecksMiddleware Interception', () => {
    it('should block file saving when rule violations with error severity occur', async () => {
      const ruleMd = `
# Rule: no-any
Severity: error
Files: **/*.ts
ASTCheck: any-keyword

## Description
Forbidden any type.
`;
      fs.writeFileSync(path.join(tempDir, 'no-any.md'), ruleMd, 'utf8');

      const middleware = new MarkdownChecksMiddleware(tempDir);
      const invalidCode = `const x: any = 'test';`;

      const result = await middleware.preTool(
        'writeFile',
        {
          targetFile: 'src/app.ts',
          codeContent: invalidCode,
        },
        {} as any,
      );

      expect(result).toBeDefined();
      expect(result!.proceed).toBe(false);
      expect(result!.reason).toContain('[CI CHECK GATE BLOCKED (AST-RULE-001)]');
      expect(result!.reason).toContain('Forbidden any type');
    });

    it('should allow file saving on clean code or warnings', async () => {
      const ruleMd = `
# Rule: no-todo
Severity: warning
Files: **/*.ts
Pattern: TODO:

## Description
Todo is fine.
`;
      fs.writeFileSync(path.join(tempDir, 'no-todo.md'), ruleMd, 'utf8');

      const middleware = new MarkdownChecksMiddleware(tempDir);
      const warnCode = `// TODO: fix this`;

      const result = await middleware.preTool(
        'writeFile',
        {
          targetFile: 'src/app.ts',
          codeContent: warnCode,
        },
        {} as any,
      );

      expect(result).toBeDefined();
      expect(result!.proceed).toBe(true);
    });
  });

  describe('5. AST Automatic Syntax Fix & Diff Generation', () => {
    it('should replace any keywords with unknown', () => {
      const checker = new MarkdownRulesChecker(tempDir);
      const originalCode = 'const a: any = 10;\nconst b: any[] = [];';
      const fixedCode = checker.generateFix(originalCode);

      expect(fixedCode).toBe('const a: unknown = 10;\nconst b: unknown[] = [];');
    });

    it('should generate accurate line diffs', () => {
      const checker = new MarkdownRulesChecker(tempDir);
      const originalCode = 'const a: any = 10;';
      const fixedCode = 'const a: unknown = 10;';

      const diff = checker.generateDiff(originalCode, fixedCode);
      expect(diff).toContain('- Dòng 1: const a: any = 10;');
      expect(diff).toContain('+ Dòng 1: const a: unknown = 10;');
    });

    it('should include proposed diff in middleware blocker response reason', async () => {
      const ruleMd = `
# Rule: no-any
Severity: error
Files: **/*.ts
ASTCheck: any-keyword

## Description
Forbidden any.
`;
      fs.writeFileSync(path.join(tempDir, 'no-any.md'), ruleMd, 'utf8');

      const middleware = new MarkdownChecksMiddleware(tempDir);
      const invalidCode = 'const x: any = 123;';

      const result = await middleware.preTool(
        'writeFile',
        {
          targetFile: 'src/app.ts',
          codeContent: invalidCode,
        },
        {} as any,
      );

      expect(result).toBeDefined();
      expect(result!.proceed).toBe(false);
      expect(result!.reason).toContain('💡 Đề xuất tự động sửa đổi chuẩn cú pháp:');
      expect(result!.reason).toContain('- Dòng 1: const x: any = 123;');
      expect(result!.reason).toContain('+ Dòng 1: const x: unknown = 123;');
    });
  });
});
