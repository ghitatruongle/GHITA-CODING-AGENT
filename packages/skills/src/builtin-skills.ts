// All 20+ built-in skill definitions (file, terminal, git, docker, db, http,
// code quality, search, compress, deploy). Extracted from index.ts for clarity.

import type { SkillDefinition } from './types.js';
import { SKILLS_VERSION } from './types.js';
import {
  ok,
  fail,
  readString,
  readNumber,
  readStringArray,
  readBoolean,
  escapeShellArg,
  escapePowerShellString,
  missingAdapter,
} from './helpers.js';
import { presentationDeckSkill } from './builtin/presentation-deck.js';
import {
  BUILTIN_KNOWLEDGE_PLUGINS,
  createKnowledgeWorkSkill,
} from './adapters/knowledge-work-adapter.js';
import { dotnetDiagSkill, dotnetUpgradeSkill } from './builtin/dotnet/dotnet-enterprise-suite.js';
import { deepTechResearchSkill } from './builtin/academic/deep-tech-research.js';

/** Create all built-in skill definitions. */
export function createBuiltinSkills(): SkillDefinition[] {
  const knowledgeSkills = BUILTIN_KNOWLEDGE_PLUGINS.map(createKnowledgeWorkSkill);

  return [
    presentationDeckSkill,
    dotnetDiagSkill,
    dotnetUpgradeSkill,
    deepTechResearchSkill,
    ...knowledgeSkills,
    // ── File Skills ─────────────────────────────────────────────────────────
    {
      id: 'file.read',
      name: 'Read File',
      description: 'Read a text file from the current workspace.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        path: { type: 'string', description: 'File path to read', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.file?.readFile) return missingAdapter('File read');
        const content = await adapters.file.readFile(path);
        return ok(content, { path, bytes: content.length });
      },
    },
    {
      id: 'file.write',
      name: 'Write File',
      description: 'Write text content to a workspace file.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      dangerous: true,
      parameters: {
        path: { type: 'string', description: 'File path to write', required: true },
        content: { type: 'string', description: 'Text content', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path');
        const content = readString(input, 'content') ?? '';
        if (!path) return fail('Missing required input: path');
        if (!adapters.file?.writeFile) return missingAdapter('File write');
        await adapters.file.writeFile(path, content);
        return ok(`Wrote ${content.length} characters to ${path}.`, {
          path,
          bytes: content.length,
        });
      },
    },
    {
      id: 'file.list',
      name: 'List Files',
      description: 'List files and folders in a workspace directory.',
      category: 'file',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        path: {
          type: 'string',
          description: 'Directory path to list',
          required: true,
          default: '.',
        },
      },
      run: async ({ input }, { adapters }) => {
        const path = readString(input, 'path') ?? '.';
        if (!adapters.file?.listDirectory) return missingAdapter('File list');
        const entries = await adapters.file.listDirectory(path);
        return ok(`Found ${entries.length} entries in ${path}.`, { path, entries });
      },
    },

    // ── Terminal Skills ─────────────────────────────────────────────────────
    {
      id: 'terminal.run',
      name: 'Run Terminal Command',
      description: 'Run a terminal command and capture stdout/stderr.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace', 'system'],
      status: 'ready',
      dangerous: true,
      parameters: {
        command: { type: 'string', description: 'Command to execute', required: true },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in milliseconds',
          required: false,
          default: 30000,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const command = readString(input, 'command');
        const timeoutMs = readNumber(input, 'timeoutMs') ?? 30000;
        if (!command) return fail('Missing required input: command');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const result = await adapters.terminal.runCommand(command, { cwd, timeoutMs, signal });
        return {
          success: result.exitCode === 0,
          output: result.stdout || result.stderr,
          error:
            result.exitCode === 0
              ? undefined
              : result.stderr || `Command exited with ${result.exitCode}`,
          data: result,
        };
      },
    },

    // ── Screenshot Skills ───────────────────────────────────────────────────
    {
      id: 'screenshot.capture',
      name: 'Capture Screenshot',
      description: 'Capture the current screen for visual analysis.',
      category: 'screenshot',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['desktop'],
      status: 'ready',
      run: async (_invocation, { adapters }) => {
        if (!adapters.screenshot?.captureScreen) return missingAdapter('Screenshot');
        const screenshot = await adapters.screenshot.captureScreen();
        return ok('Screenshot captured.', screenshot);
      },
    },

    // ── App Control Skills ──────────────────────────────────────────────────
    {
      id: 'app.open',
      name: 'Open App',
      description: 'Open an app, executable, file, or URL.',
      category: 'app',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        target: { type: 'string', description: 'App path, command, file, or URL', required: true },
        args: { type: 'array', description: 'Optional arguments', required: false },
      },
      run: async ({ input }, { adapters }) => {
        const target = readString(input, 'target');
        const args = readStringArray(input, 'args') ?? [];
        if (!target) return fail('Missing required input: target');
        if (!adapters.app?.openApp) return missingAdapter('App control');
        await adapters.app.openApp(target, args);
        return ok(`Opened ${target}.`, { target, args });
      },
    },
    {
      id: 'app.close',
      name: 'Close App',
      description: 'Request that a named app or process closes.',
      category: 'app',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        target: { type: 'string', description: 'App or process name', required: true },
      },
      run: async ({ input }, { adapters }) => {
        const target = readString(input, 'target');
        if (!target) return fail('Missing required input: target');
        if (!adapters.app?.closeApp) return missingAdapter('App control');
        await adapters.app.closeApp(target);
        return ok(`Close requested for ${target}.`, { target });
      },
    },

    // ── Git Skills ──────────────────────────────────────────────────────────
    {
      id: 'git.status',
      name: 'Git Status',
      description: 'Show working tree status.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        porcelain: { type: 'boolean', description: 'Use porcelain format', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const porcelain = readBoolean(input, 'porcelain');
        const cmd = porcelain ? 'git status --porcelain' : 'git status';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'git.commit',
      name: 'Git Commit',
      description: 'Record changes to the repository.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        message: { type: 'string', description: 'Commit message', required: true },
        amend: { type: 'boolean', description: 'Amend last commit', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const message = readString(input, 'message');
        if (!message) return fail('Missing required input: message');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const amend = readBoolean(input, 'amend');
        const cmd = amend
          ? `git commit --amend -m ${escapeShellArg(message)}`
          : `git commit -m ${escapeShellArg(message)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, message },
        };
      },
    },
    {
      id: 'git.diff',
      name: 'Git Diff',
      description: 'Show changes between commits, working tree, etc.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        target: {
          type: 'string',
          description: 'Diff target (e.g. HEAD, branch name)',
          required: false,
          default: 'HEAD',
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const target = readString(input, 'target') ?? 'HEAD';
        const r = await adapters.terminal.runCommand(`git diff ${escapeShellArg(target)}`, {
          cwd,
          signal,
        });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'git.branch',
      name: 'Git Branch',
      description: 'List, create, or delete branches.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        action: {
          type: 'string',
          description: 'Action: list, create, delete',
          required: false,
          default: 'list',
        },
        name: { type: 'string', description: 'Branch name (for create/delete)', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const action = readString(input, 'action') ?? 'list';
        const name = readString(input, 'name');
        let cmd: string;
        if (action === 'create') {
          if (!name) return fail('Missing required input: name for create action');
          cmd = `git checkout -b ${escapeShellArg(name)}`;
        } else if (action === 'delete') {
          if (!name) return fail('Missing required input: name for delete action');
          cmd = `git branch -d ${escapeShellArg(name)}`;
        } else {
          cmd = 'git branch';
        }
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── Docker Skills ───────────────────────────────────────────────────────
    {
      id: 'docker.run',
      name: 'Docker Run',
      description: 'Run a command in a new Docker container.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        image: { type: 'string', description: 'Docker image name', required: true },
        command: {
          type: 'string',
          description: 'Command to run inside container',
          required: false,
        },
        detach: { type: 'boolean', description: 'Run in detached mode', required: false },
        ports: { type: 'string', description: 'Port mapping (e.g. 8080:80)', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const image = readString(input, 'image');
        if (!image) return fail('Missing required input: image');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const command = readString(input, 'command');
        const detach = readBoolean(input, 'detach');
        const ports = readString(input, 'ports');
        let cmd = 'docker run';
        if (detach) cmd += ' -d';
        if (ports) cmd += ` -p ${escapeShellArg(ports)}`;
        cmd += ` ${escapeShellArg(image)}`;
        if (command) cmd += ` ${escapeShellArg(command)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'docker.build',
      name: 'Docker Build',
      description: 'Build a Docker image from a Dockerfile.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'disabled',
      parameters: {
        tag: { type: 'string', description: 'Image tag (e.g. myapp:latest)', required: true },
        context: {
          type: 'string',
          description: 'Build context path',
          required: false,
          default: '.',
        },
        file: { type: 'string', description: 'Dockerfile path', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const tag = readString(input, 'tag');
        if (!tag) return fail('Missing required input: tag');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const context = readString(input, 'context') ?? '.';
        const file = readString(input, 'file');
        let cmd = `docker build -t ${escapeShellArg(tag)}`;
        if (file) cmd += ` -f ${escapeShellArg(file)}`;
        cmd += ` ${escapeShellArg(context)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },
    {
      id: 'docker.ps',
      name: 'Docker PS',
      description: 'List Docker containers.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        all: {
          type: 'boolean',
          description: 'Show all containers (including stopped)',
          required: false,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const all = readBoolean(input, 'all');
        const cmd = all ? 'docker ps -a' : 'docker ps';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── Database Skill ──────────────────────────────────────────────────────
    {
      id: 'db.query',
      name: 'Database Query',
      description: 'Execute a read-only SQL query on a SQLite database.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      dangerous: true,
      parameters: {
        database: { type: 'string', description: 'Path to SQLite database file', required: true },
        query: { type: 'string', description: 'SQL query (SELECT only)', required: true },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const database = readString(input, 'database');
        const query = readString(input, 'query');
        if (!database) return fail('Missing required input: database');
        if (!query) return fail('Missing required input: query');
        if (!query.trim().toUpperCase().startsWith('SELECT'))
          return fail('Only SELECT queries are allowed for safety.');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const r = await adapters.terminal.runCommand(
          `sqlite3 ${database} ${escapeShellArg(query)}`,
          { cwd, signal },
        );
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── HTTP Skill ──────────────────────────────────────────────────────────
    {
      id: 'http.request',
      name: 'HTTP Request',
      description: 'Make an HTTP request using curl.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['system'],
      status: 'ready',
      parameters: {
        url: { type: 'string', description: 'Request URL', required: true },
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, etc.)',
          required: false,
          default: 'GET',
        },
        headers: { type: 'string', description: 'Request headers (key:value)', required: false },
        body: { type: 'string', description: 'Request body', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const url = readString(input, 'url');
        if (!url) return fail('Missing required input: url');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const method = readString(input, 'method') ?? 'GET';
        const headers = readString(input, 'headers');
        const body = readString(input, 'body');
        let cmd = `curl -s -X ${method}`;
        if (headers) cmd += ` -H ${escapeShellArg(headers)}`;
        if (body) cmd += ` -d ${escapeShellArg(body)}`;
        cmd += ` ${escapeShellArg(url)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, timeoutMs: 15000, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── Code Quality Skills ─────────────────────────────────────────────────
    {
      id: 'code.format',
      name: 'Format Code',
      description: 'Format code using a configured formatter.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        path: { type: 'string', description: 'File or directory path', required: true },
        formatter: {
          type: 'string',
          description: 'Formatter: prettier, black, rustfmt',
          required: false,
          default: 'prettier',
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const formatter = readString(input, 'formatter') ?? 'prettier';
        const cmd = `${escapeShellArg(formatter)} --write ${escapeShellArg(path)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, formatter },
        };
      },
    },
    {
      id: 'code.lint',
      name: 'Lint Code',
      description: 'Run a linter on the codebase.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        path: { type: 'string', description: 'File or directory path', required: true },
        linter: {
          type: 'string',
          description: 'Linter: eslint, flake8, clippy',
          required: false,
          default: 'eslint',
        },
        fix: { type: 'boolean', description: 'Auto-fix issues', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const path = readString(input, 'path');
        if (!path) return fail('Missing required input: path');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const linter = readString(input, 'linter') ?? 'eslint';
        const fix = readBoolean(input, 'fix');
        let cmd = `${escapeShellArg(linter)} ${escapeShellArg(path)}`;
        if (fix) cmd += ' --fix';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, linter },
        };
      },
    },

    // ── Test Skill ──────────────────────────────────────────────────────────
    {
      id: 'test.run',
      name: 'Run Tests',
      description: 'Run the test suite.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        framework: {
          type: 'string',
          description: 'Test framework: vitest, jest, pytest, cargo',
          required: false,
          default: 'vitest',
        },
        path: { type: 'string', description: 'Specific test file or directory', required: false },
        watch: { type: 'boolean', description: 'Watch mode', required: false },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const framework = readString(input, 'framework') ?? 'vitest';
        const path = readString(input, 'path');
        const watch = readBoolean(input, 'watch');
        let cmd = escapeShellArg(framework);
        if (path) cmd += ` ${path}`;
        if (watch) cmd += ' --watch';
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: { ...r, framework },
        };
      },
    },

    // ── Search Skill ────────────────────────────────────────────────────────
    {
      id: 'search.codebase',
      name: 'Search Codebase',
      description: 'Search for patterns in the codebase using ripgrep or grep.',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      parameters: {
        query: { type: 'string', description: 'Search pattern', required: true },
        path: { type: 'string', description: 'Directory to search', required: false, default: '.' },
        extension: {
          type: 'string',
          description: 'File extension filter (e.g. ts)',
          required: false,
        },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const query = readString(input, 'query');
        if (!query) return fail('Missing required input: query');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const path = readString(input, 'path') ?? '.';
        const extension = readString(input, 'extension');
        let cmd = `rg ${escapeShellArg(query)} ${path}`;
        if (extension) cmd += ` -g "*.${escapeShellArg(extension)}"`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, timeoutMs: 10000, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || r.stderr,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── Compress Skill ──────────────────────────────────────────────────────
    {
      id: 'compress.zip',
      name: 'Compress Files',
      description: 'Create a compressed archive.',
      category: 'terminal',
      enabled: false,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'disabled',
      parameters: {
        source: { type: 'string', description: 'Source path', required: true },
        output: { type: 'string', description: 'Output archive path', required: true },
      },
      run: async ({ input, cwd, signal }, { adapters }) => {
        const source = readString(input, 'source');
        const output = readString(input, 'output');
        if (!source) return fail('Missing required input: source');
        if (!output) return fail('Missing required input: output');
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const isWin = process.platform === 'win32';
        const cmd = isWin
          ? `powershell -NoProfile -Command "Compress-Archive -LiteralPath ${escapePowerShellString(source)} -DestinationPath ${escapePowerShellString(output)} -Force"`
          : `tar -czf ${escapeShellArg(output)} ${escapeShellArg(source)}`;
        const r = await adapters.terminal.runCommand(cmd, { cwd, signal });
        return {
          success: r.exitCode === 0,
          output: r.stdout || `Created ${output}`,
          error: r.exitCode !== 0 ? r.stderr : undefined,
          data: r,
        };
      },
    },

    // ── Deploy Check Skill ──────────────────────────────────────────────────
    {
      id: 'deploy.check',
      name: 'Deploy Check',
      description: 'Check deployment readiness (clean git, recent commits).',
      category: 'terminal',
      enabled: true,
      version: SKILLS_VERSION,
      scopes: ['workspace'],
      status: 'ready',
      run: async ({ cwd, signal }, { adapters }) => {
        if (!adapters.terminal?.runCommand) return missingAdapter('Terminal');
        const status = await adapters.terminal.runCommand('git status --porcelain', {
          cwd,
          signal,
        });
        if (status.exitCode !== 0) {
          return {
            success: false,
            output: 'Failed to check git status. Is this a git repository?',
            error: status.stderr || 'git status failed',
            data: { isClean: false, status: '', log: '' },
          };
        }
        const log = await adapters.terminal.runCommand('git log --oneline -5', { cwd, signal });
        const isClean = status.stdout.trim().length === 0;
        const output = [
          `Git status: ${isClean ? 'CLEAN' : 'DIRTY'}`,
          status.stdout.trim() ? `\nUncommitted changes:\n${status.stdout}` : '',
          `\nRecent commits:\n${log.stdout}`,
        ].join('');
        return {
          success: isClean,
          output,
          error: isClean ? undefined : 'There are uncommitted changes.',
          data: { isClean, status: status.stdout, log: log.stdout },
        };
      },
    },
  ];
}
