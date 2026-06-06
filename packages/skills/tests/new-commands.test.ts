import { describe, it, expect } from 'vitest';
import { SlashCommandRegistry } from '../src/commands/registry.js';
import { createBuiltinSlashCommands } from '../src/commands/builtins.js';

describe('New Slash Commands', () => {
  const commands = createBuiltinSlashCommands();
  const registry = new SlashCommandRegistry();
  registry.registerMany(commands);

  const newTriggers = [
    '/test',
    '/format',
    '/lint',
    '/explain',
    '/refactor',
    '/optimize',
    '/doc',
    '/security',
    '/deps',
    '/migrate',
    '/benchmark',
  ];

  describe('Registration', () => {
    for (const trigger of newTriggers) {
      it(`should register ${trigger}`, () => {
        const cmd = registry.get(trigger);
        expect(cmd).toBeDefined();
        expect(cmd!.trigger).toBe(trigger);
      });
    }
  });

  describe('/help lists all commands', () => {
    it('should list all 19 commands', async () => {
      const helpCmd = registry.get('/help')!;
      const result = await helpCmd.execute('');
      for (const trigger of newTriggers) {
        expect(result).toContain(trigger);
      }
    });
  });

  describe('Argument parsing', () => {
    it('should parse flags', () => {
      const result = registry.resolve('/test --framework jest --watch');
      expect(result).not.toBeNull();
      expect(result!.parsedArgs.flags['framework']).toBe('jest');
      expect(result!.parsedArgs.flags['watch']).toBe(true);
    });

    it('should parse short flags', () => {
      const result = registry.resolve('/format -p src/index.ts -f prettier');
      expect(result).not.toBeNull();
      expect(result!.parsedArgs.flags['path']).toBe('src/index.ts');
    });

    it('should parse positional args', () => {
      const result = registry.resolve('/test src/app.test.ts');
      expect(result).not.toBeNull();
      expect(result!.parsedArgs.positional).toContain('src/app.test.ts');
    });

    it('should parse quoted strings', () => {
      const result = registry.resolve('/migrate --from "React 17" --to "React 18"');
      expect(result).not.toBeNull();
      expect(result!.parsedArgs.flags['from']).toBe('React 17');
      expect(result!.parsedArgs.flags['to']).toBe('React 18');
    });

    it('should handle --flag=value syntax', () => {
      const result = registry.resolve('/test --framework=vitest');
      expect(result).not.toBeNull();
      expect(result!.parsedArgs.flags['framework']).toBe('vitest');
    });
  });

  describe('Command history', () => {
    it('should push and retrieve history', () => {
      const reg = new SlashCommandRegistry();
      reg.pushHistory('/test --watch');
      reg.pushHistory('/format --path src');
      expect(reg.getHistory()).toHaveLength(2);
      expect(reg.getHistory()[0]).toBe('/test --watch');
    });

    it('should navigate history up', () => {
      const reg = new SlashCommandRegistry();
      reg.pushHistory('/first');
      reg.pushHistory('/second');
      const result = reg.navigateHistory(0, 'up');
      expect(result).not.toBeNull();
      expect(result!.entry).toBe('/second');
    });

    it('should navigate history down', () => {
      const reg = new SlashCommandRegistry();
      reg.pushHistory('/first');
      reg.pushHistory('/second');
      const result = reg.navigateHistory(1, 'down');
      expect(result).not.toBeNull();
      expect(result!.entry).toBe('/first');
    });
  });

  describe('search', () => {
    it('should find commands by prefix', () => {
      const results = registry.search('/test');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.trigger).toBe('/test');
    });

    it('should find commands by name', () => {
      const results = registry.search('format');
      expect(results.some((c) => c.trigger === '/format')).toBe(true);
    });

    it('should limit results', () => {
      const results = registry.search('/', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });
});
