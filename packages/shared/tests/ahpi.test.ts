import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  ghitaProfiler,
  getHeatmapColor,
  instrumentCode,
  profileFunction,
  profileExecution,
  type ProfilerRecord,
} from '../src/parser/ahpi.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Automatic Hot-Path Instrumentation (AHPI)', () => {
  beforeEach(() => {
    ghitaProfiler.clear();
  });

  describe('GHITAProfilerRegistry & getHeatmapColor', () => {
    it('should record calls and execution times', async () => {
      const name = 'test-func';
      const id = ghitaProfiler.enter(name);

      // Delay to simulate some execution time
      await new Promise((resolve) => setTimeout(resolve, 20));
      ghitaProfiler.exit(id);

      const reports = ghitaProfiler.getReports();
      expect(reports).toHaveLength(1);
      expect(reports[0].name).toBe(name);
      expect(reports[0].calls).toBe(1);
      expect(reports[0].totalTimeMs).toBeGreaterThanOrEqual(15);
      expect(reports[0].averageTimeMs).toBeGreaterThanOrEqual(15);
    });

    it('should classify heatmap colors based on execution thresholds', () => {
      const fastRecord: ProfilerRecord = {
        name: 'fast',
        calls: 1,
        totalTimeMs: 5,
        averageTimeMs: 5,
      };
      const warningRecord: ProfilerRecord = {
        name: 'warn',
        calls: 1,
        totalTimeMs: 50,
        averageTimeMs: 50,
      };
      const criticalRecord: ProfilerRecord = {
        name: 'crit',
        calls: 1,
        totalTimeMs: 150,
        averageTimeMs: 150,
      };

      expect(getHeatmapColor(fastRecord)).toBe('green');
      expect(getHeatmapColor(warningRecord)).toBe('orange');
      expect(getHeatmapColor(criticalRecord)).toBe('red');
    });
  });

  describe('instrumentCode (Brace-Balanced Parser)', () => {
    it('should instrument standard function declarations and class methods', () => {
      const code = `
        function calculateSum(a, b) {
          return a + b;
        }
        class Calculator {
          async computeAsync(x) {
            return x * 2;
          }
        }
      `;
      const instrumented = instrumentCode(code, 'math.js');

      expect(instrumented).toContain('__ghita_perf_id');
      expect(instrumented).toContain('globalThis.__ghita_profiler.enter("math.js:calculateSum")');
      expect(instrumented).toContain('globalThis.__ghita_profiler.enter("math.js:computeAsync")');
      expect(instrumented).toContain('finally');
    });

    it('should skip reserved keywords matching function signature patterns', () => {
      const code = `
        if (x) {
          console.log(x);
        }
        while (y) {
          y--;
        }
      `;
      const instrumented = instrumentCode(code, 'loops.js');
      expect(instrumented).not.toContain('__ghita_perf_id');
    });

    it('should skip string literals and comments with braces inside', () => {
      const code = `
        function parseJson(str) {
          // comments with braces: } {
          /* block comment: } */
          const template = \`nested \${x} bracing }\`;
          const s = "ignore brace }";
          return JSON.parse(str);
        }
      `;
      const instrumented = instrumentCode(code, 'parser.js');
      expect(instrumented).toContain('globalThis.__ghita_profiler.enter("parser.js:parseJson")');
      // Ensure it parsed correctly to the actual closing brace at the end of function
      expect(instrumented.endsWith('}\n      ')).toBe(true);
    });

    it('should skip already instrumented code blocks', () => {
      const code = `
        function test() {
          const __ghita_perf_id = globalThis.__ghita_profiler.enter("test");
          try {
            console.log(123);
          } finally {
            globalThis.__ghita_profiler.exit(__ghita_perf_id);
          }
        }
      `;
      const instrumented = instrumentCode(code, 'test.js');
      // Number of occurrences of __ghita_perf_id should not double
      const occurrences = (instrumented.match(/__ghita_perf_id/g) || []).length;
      expect(occurrences).toBe(2);
    });
  });

  describe('profileFunction wrapper', () => {
    it('should profile synchronous function boundaries', () => {
      const fn = (a: number, b: number) => a + b;
      const wrapped = profileFunction('syncAdd', fn);

      const result = wrapped(2, 3);
      expect(result).toBe(5);

      const reports = ghitaProfiler.getReports();
      expect(reports).toHaveLength(1);
      expect(reports[0].name).toBe('syncAdd');
      expect(reports[0].calls).toBe(1);
    });

    it('should profile asynchronous function boundaries', async () => {
      const fn = async (val: string) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return val.toUpperCase();
      };
      const wrapped = profileFunction('asyncUpper', fn);

      const result = await wrapped('hello');
      expect(result).toBe('HELLO');

      const reports = ghitaProfiler.getReports();
      expect(reports).toHaveLength(1);
      expect(reports[0].name).toBe('asyncUpper');
      expect(reports[0].calls).toBe(1);
      expect(reports[0].totalTimeMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('profileExecution disk instrumentation', () => {
    const tempTestFile = path.resolve(__dirname, 'temp-test-file.cjs');

    beforeEach(() => {
      if (fs.existsSync(tempTestFile)) {
        fs.unlinkSync(tempTestFile);
      }
    });

    afterEach(() => {
      if (fs.existsSync(tempTestFile)) {
        fs.unlinkSync(tempTestFile);
      }
    });

    it('should temporarily instrument, execute, restore, and return profiler records', async () => {
      const sourceCode = `
        function runHeavyLoop() {
          let sum = 0;
          for (let i = 0; i < 1000; i++) {
            sum += i;
          }
          return sum;
        }
        module.exports = { runHeavyLoop };
      `;
      fs.writeFileSync(tempTestFile, sourceCode, 'utf8');

      const reports = await profileExecution(tempTestFile, async () => {
        // Execute by importing the module and running the function
        const mod = require(tempTestFile);
        mod.runHeavyLoop();
      });

      // Original code should be restored
      const restored = fs.readFileSync(tempTestFile, 'utf8');
      expect(restored).toBe(sourceCode);

      // We should have a report for runHeavyLoop
      expect(reports.some((r) => r.name.includes('runHeavyLoop'))).toBe(true);
    });
  });
});
