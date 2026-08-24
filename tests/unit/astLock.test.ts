import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ASTLockEngine,
  ASTLockMiddleware,
  buildHierarchy,
  computeSemanticHash,
  loadASTLockConfig,
} from '../../packages/agents/src/index.js';
import type { SymbolTag } from '@ghita/shared';

describe('3: AST-Lock Unit Tests', () => {
  
  // 1. buildHierarchy & computeSemanticHash
  
  describe('buildHierarchy & computeSemanticHash', () => {
    it('should build hierarchical scope strings (Class.Method) correctly', () => {
      const mockTags: SymbolTag[] = [
        {
          name: 'MyClass',
          kind: 'definition',
          type: 'class',
          startLine: 10,
          endLine: 50,
          nodeText: 'class MyClass { ... }',
        },
        {
          name: 'methodA',
          kind: 'definition',
          type: 'method',
          startLine: 15,
          endLine: 30,
          nodeText: 'methodA() { ... }',
        },
        {
          name: 'methodB',
          kind: 'definition',
          type: 'method',
          startLine: 35,
          endLine: 48,
          nodeText: 'methodB() { ... }',
        },
        {
          name: 'nestedHelper',
          kind: 'definition',
          type: 'function',
          startLine: 20,
          endLine: 28,
          nodeText: 'function nestedHelper() { ... }',
        },
        {
          name: 'externalFunc',
          kind: 'definition',
          type: 'function',
          startLine: 60,
          endLine: 70,
          nodeText: 'function externalFunc() { ... }',
        },
      ];

      const hierarchy = buildHierarchy(mockTags);
      const definitions = hierarchy.filter((d) => d.kind === 'definition');

      const myClass = definitions.find((d) => d.name === 'MyClass');
      const methodA = definitions.find((d) => d.name === 'methodA');
      const methodB = definitions.find((d) => d.name === 'methodB');
      const nestedHelper = definitions.find((d) => d.name === 'nestedHelper');
      const externalFunc = definitions.find((d) => d.name === 'externalFunc');

      // Scope checks
      expect(myClass?.scope).toBe('MyClass');
      expect(methodA?.scope).toBe('MyClass.methodA');
      expect(methodB?.scope).toBe('MyClass.methodB');
      expect(nestedHelper?.scope).toBe('MyClass.methodA.nestedHelper');
      expect(externalFunc?.scope).toBe('externalFunc');

      // Parent relations
      expect(methodA.parentName).toBe('MyClass');
      expect(nestedHelper.parentName).toBe('methodA');
      expect(externalFunc.parentName).toBeUndefined();
    });

    it('should ignore all spaces and newlines in computeSemanticHash to prevent False Alarms', () => {
      const code1 = `
        function calculate() {
          return 42;
        }
      `;
      const code2 = `function calculate(){\n\treturn 42;\n}`;

      const hash1 = computeSemanticHash(code1);
      const hash2 = computeSemanticHash(code2);

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(
        crypto.createHash('sha256').update('functioncalculate(){return42;}').digest('hex'),
      );
    });
  });

  // 2. loadASTLockConfig YAML Loader
  
  describe('loadASTLockConfig', () => {
    const dummyYamlPath = path.resolve('.ghita/rules.yaml.test');

    beforeEach(() => {
      const dir = path.dirname(dummyYamlPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(dummyYamlPath)) fs.unlinkSync(dummyYamlPath);
    });

    it('should parse enabled status, locked symbols and excluded files correctly from rules.yaml', () => {
      const yamlContent = `
# GHITA Rules Config
astLock:
  enabled: true
  lockedSymbols:
    - "SecurityGate"
    - "calculateInternal"
    - "Class.lockedMethod"
  excludeFiles:
    - "**/tests/**"
    - "**/*.test.ts"
      `;
      fs.writeFileSync(dummyYamlPath, yamlContent, 'utf-8');

      const config = loadASTLockConfig(dummyYamlPath);
      expect(config.enabled).toBe(true);
      expect(config.lockedSymbols).toEqual([
        'SecurityGate',
        'calculateInternal',
        'Class.lockedMethod',
      ]);
      expect(config.excludeFiles).toEqual(['**/tests/**', '**/*.test.ts']);
    });

    it('should return fallback default config if rules.yaml does not exist', () => {
      const config = loadASTLockConfig('non-existent-rules.yaml');
      expect(config.enabled).toBe(true);
      expect(config.lockedSymbols).toEqual([]);
      expect(config.excludeFiles).toEqual([]);
    });
  });

  // 3. ASTLockEngine Symbol Hashing & Verification
  
  describe('ASTLockEngine', () => {
    let engine: ASTLockEngine;

    beforeEach(() => {
      engine = new ASTLockEngine();
    });

    it('should lock symbols and validate code changes successfully when locked symbols are not modified', async () => {
      const mockCode = `
        export class Auth {
          login(user: string) {
            return true;
          }
          logout() {
            return false;
          }
        }
      `;

      // Simulates PolyglotTagParser returning SymbolTags
      const extractSpy = vi.spyOn((engine as unknown).parser, 'extractSymbols').mockResolvedValue([
        {
          name: 'Auth',
          kind: 'definition',
          type: 'class',
          startLine: 2,
          endLine: 9,
          nodeText: 'export class Auth { ... }',
        },
        {
          name: 'login',
          kind: 'definition',
          type: 'method',
          startLine: 3,
          endLine: 5,
          nodeText: 'login(user: string) { return true; }',
        },
        {
          name: 'logout',
          kind: 'definition',
          type: 'method',
          startLine: 6,
          endLine: 8,
          nodeText: 'logout() { return false; }',
        },
      ]);

      await engine.lockSymbols('dummy.ts', mockCode, 'typescript', ['Auth.logout']);
      expect(engine.getLockedSymbols()).toHaveLength(1);
      expect(engine.getLockedSymbols()[0]).toContain('Auth.logout');

      // 1. Validation Success: new code doesn't change locked 'logout' method
      extractSpy.mockResolvedValue([
        {
          name: 'Auth',
          kind: 'definition',
          type: 'class',
          startLine: 2,
          endLine: 10,
          nodeText: 'export class Auth { ... }',
        },
        {
          name: 'login',
          kind: 'definition',
          type: 'method',
          startLine: 3,
          endLine: 6,
          nodeText: 'login(user: string) { console.log(user); return true; }',
        }, // modified
        {
          name: 'logout',
          kind: 'definition',
          type: 'method',
          startLine: 7,
          endLine: 9,
          nodeText: 'logout() { return false; }',
        }, // identical logic
      ]);

      const res = await engine.validate('dummy.ts', 'some new code', 'typescript');
      expect(res.valid).toBe(true);
      expect(res.violations).toHaveLength(0);
    });

    it('should fail validation when a locked symbol is modified or deleted', async () => {
      const mockCode = `
        export class Engine {
          start() {
            return "started";
          }
        }
      `;

      const extractSpy = vi.spyOn((engine as unknown).parser, 'extractSymbols').mockResolvedValue([
        {
          name: 'Engine',
          kind: 'definition',
          type: 'class',
          startLine: 2,
          endLine: 6,
          nodeText: 'export class Engine { ... }',
        },
        {
          name: 'start',
          kind: 'definition',
          type: 'method',
          startLine: 3,
          endLine: 5,
          nodeText: 'start() { return "started"; }',
        },
      ]);

      // Lock 'Engine.start'
      await engine.lockSymbols('dummy.ts', mockCode, 'typescript', ['Engine.start']);

      // 1. Fail because locked method is modified
      extractSpy.mockResolvedValue([
        {
          name: 'Engine',
          kind: 'definition',
          type: 'class',
          startLine: 2,
          endLine: 6,
          nodeText: 'export class Engine { ... }',
        },
        {
          name: 'start',
          kind: 'definition',
          type: 'method',
          startLine: 3,
          endLine: 5,
          nodeText: 'start() { return "hacked"; }',
        }, // modified
      ]);

      let res = await engine.validate('dummy.ts', 'modified code', 'typescript');
      expect(res.valid).toBe(false);
      expect(res.violations[0]).toContain('AST-LOCK-001');
      expect(res.violations[0]).toContain('Engine.start');

      // 2. Fail because locked method is deleted
      extractSpy.mockResolvedValue([
        {
          name: 'Engine',
          kind: 'definition',
          type: 'class',
          startLine: 2,
          endLine: 3,
          nodeText: 'export class Engine {}',
        },
      ]);

      res = await engine.validate('dummy.ts', 'deleted code', 'typescript');
      expect(res.valid).toBe(false);
      expect(res.violations[0]).toContain('AST-LOCK-001');
      expect(res.violations[0]).toContain('Engine.start');
      expect(res.violations[0]).toContain('xoá hoặc đổi tên');
    });
  });

  // 4. ASTLockMiddleware Integration & PreTool Gate
  
  describe('ASTLockMiddleware', () => {
    let engine: ASTLockEngine;
    let middleware: ASTLockMiddleware;
    const testFile = path.resolve('test-file.ts');

    beforeEach(() => {
      engine = new ASTLockEngine();
      middleware = new ASTLockMiddleware(engine);

      // Mock rules config path
      (middleware as unknown).configPath = 'non-existent-rules.yaml';
    });

    afterEach(() => {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      if (fs.existsSync('.ghita/ast-lock-violations.log')) {
        fs.unlinkSync('.ghita/ast-lock-violations.log');
      }
    });

    it('should bypass checking for non-write tools', async () => {
      const res = await middleware.preTool('readFile', { filePath: 'test.ts' }, {} as unknown);
      expect(res).toBeUndefined(); // Bypassed
    });

    it('should block writeFile when locked symbol is edited', async () => {
      const originalCode = `
        export function safeCalc() {
          return 100;
        }
      `;
      fs.writeFileSync(testFile, originalCode, 'utf8');

      // Mock PolyglotTagParser to yield symbol dynamically
      vi.spyOn((engine as unknown).parser, 'extractSymbols').mockImplementation(
        async (code: string) => {
          if (code.includes('100')) {
            return [
              {
                name: 'safeCalc',
                kind: 'definition',
                type: 'function',
                startLine: 2,
                endLine: 4,
                nodeText: 'export function safeCalc() { return 100; }',
              },
            ];
          } else {
            return [
              {
                name: 'safeCalc',
                kind: 'definition',
                type: 'function',
                startLine: 2,
                endLine: 4,
                nodeText: 'export function safeCalc() { return 200; }',
              },
            ];
          }
        },
      );

      // Write physical rules.yaml mock
      const yamlContent = `
astLock:
  enabled: true
  lockedSymbols:
    - "safeCalc"
      `;
      const dir = path.dirname('.ghita/rules.yaml.test-mock');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync('.ghita/rules.yaml.test-mock', yamlContent, 'utf-8');

      // Mock detectLanguageFromPath and configPath
      const loadConfigSpy = vi
        .spyOn(middleware as unknown, 'detectLanguageFromPath')
        .mockReturnValue('typescript');
      (middleware as unknown).configPath = '.ghita/rules.yaml.test-mock';

      // Lock original
      await engine.lockSymbols(testFile, originalCode, 'typescript', ['safeCalc']);

      const res = await middleware.preTool(
        'writeFile',
        { targetFile: testFile, content: 'export function safeCalc() { return 200; }' },
        { agent: { id: 'agent-1' } } as unknown,
      );

      expect(res).toBeDefined();
      expect(res?.proceed).toBe(false);
      expect(res?.reason).toContain('AST-LOCK ERROR');
      expect(res?.reason).toContain('safeCalc');

      // Check that violation was logged
      expect(fs.existsSync('.ghita/ast-lock-violations.log')).toBe(true);
      const logContent = fs.readFileSync('.ghita/ast-lock-violations.log', 'utf8');
      expect(logContent).toContain('VIOLATION');
      expect(logContent).toContain('safeCalc');

      if (fs.existsSync('.ghita/rules.yaml.test-mock')) {
        fs.unlinkSync('.ghita/rules.yaml.test-mock');
      }
      loadConfigSpy.mockRestore();
    });

    it('should correctly detect language from file extensions', () => {
      expect((middleware as unknown).detectLanguageFromPath('file.ts')).toBe('typescript');
      expect((middleware as unknown).detectLanguageFromPath('file.py')).toBe('python');
      expect((middleware as unknown).detectLanguageFromPath('file.kt')).toBe('kotlin');
      expect((middleware as unknown).detectLanguageFromPath('file.scala')).toBe('scala');
      expect((middleware as unknown).detectLanguageFromPath('file.pas')).toBe('pascal');
      expect((middleware as unknown).detectLanguageFromPath('file.unknown')).toBe('typescript');
    });

    it('should bypass validation for excluded files in config', async () => {
      const yamlContent = `
astLock:
  enabled: true
  excludeFiles:
    - "**/excluded/**"
      `;
      const configMockPath = '.ghita/rules.yaml.test-exclude';
      const dir = path.dirname(configMockPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configMockPath, yamlContent, 'utf-8');

      (middleware as unknown).configPath = configMockPath;

      const mockExcludedFile = path.resolve('src/excluded/somefile.ts');

      const res = await middleware.preTool(
        'writeFile',
        { targetFile: mockExcludedFile, content: 'some code' },
        { agent: { id: 'agent-1' } } as unknown,
      );

      expect(res).toBeUndefined();

      if (fs.existsSync(configMockPath)) {
        fs.unlinkSync(configMockPath);
      }
    });
  });
});
