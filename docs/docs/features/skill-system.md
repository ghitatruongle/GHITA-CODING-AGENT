---
id: skill-system
title: Skill System
sidebar_label: Skill System
sidebar_position: 4
---

# Skill System

The Skill System is the capability layer that gives GHITA agents the power to interact with your machine, files, terminal, browser, and external services.

## Core Concepts

### SkillDefinition

Every skill implements the `SkillDefinition` interface:

```typescript
interface SkillDefinition {
  id: string;            // Unique identifier (e.g., 'file_read')
  name: string;          // Human-readable name
  description: string;   // What the skill does
  category: SkillCategory; // 'file' | 'terminal' | 'browser' | 'computer' | 'screenshot' | 'app'
  enabled: boolean;      // Can be toggled at runtime
  version: string;       // Semver version
  scopes: SkillScope[];  // 'workspace' | 'system' | 'browser' | 'desktop'
  status: SkillStatus;   // 'ready' | 'disabled' | 'missing-adapter' | 'error'
  run: (invocation, context) => Promise<SkillResult>;
}
```

### SkillRegistry

The `SkillRegistry` manages skill lifecycle:

```typescript
const registry = new SkillRegistry({
  file: fileAdapter,
  terminal: terminalAdapter,
});

// Register built-in skills
registry.registerMany(createBuiltInSkills());

// List all skills
const skills = registry.list(); // Sorted by category, then name

// Execute a skill
const result = await registry.run('terminal_exec', {
  input: { command: 'git status', cwd: '/my-project' },
});

// Toggle skills on/off
registry.setEnabled('docker_list', false);

// Subscribe to registry changes
registry.subscribe((snapshot) => {
  console.log(`${snapshot.enabled}/${snapshot.total} skills enabled`);
});
```

## Built-in Skills (20+)

### File Operations

| Skill ID | Description |
|----------|-------------|
| `file_read` | Read file contents |
| `file_write` | Write content to a file |
| `file_append` | Append content to a file |
| `file_delete` | Delete a file |
| `file_rename` | Rename or move a file |
| `file_list` | List directory contents |
| `file_search` | Search files by pattern |
| `file_info` | Get file metadata (size, modified date) |

### Terminal

| Skill ID | Description |
|----------|-------------|
| `terminal_exec` | Execute a shell command with timeout |
| `terminal_exec_bg` | Execute a command in the background |

### Git

| Skill ID | Description |
|----------|-------------|
| `git_status` | Run `git status` |
| `git_diff` | Show unstaged changes |
| `git_log` | Show recent commit history |
| `git_commit` | Stage and commit changes |

### Docker

| Skill ID | Description |
|----------|-------------|
| `docker_list` | List running containers |
| `docker_logs` | View container logs |
| `docker_exec` | Execute command in container |

### Code Quality

| Skill ID | Description |
|----------|-------------|
| `code_format` | Format code with Prettier |
| `code_lint` | Run ESLint analysis |
| `code_test` | Execute test suite |
| `code_search` | Search codebase with ripgrep |

### Database

| Skill ID | Description |
|----------|-------------|
| `db_query` | Execute SELECT-only SQL queries |

### HTTP

| Skill ID | Description |
|----------|-------------|
| `http_request` | Make HTTP requests (GET, POST, etc.) |

## Runtime Adapters

Skills don't directly access the filesystem or terminal — they use **adapters** injected at construction time. This allows the same skill code to work across:

- **Tauri Desktop**: Adapters use Tauri IPC to call Rust backend.
- **Node.js Server**: Adapters use Node.js `fs` and `child_process`.
- **Test Environment**: Adapters use mocks/stubs.

```typescript
interface SkillRuntimeAdapters {
  file?: FileSkillAdapter;       // readFile, writeFile, listDirectory
  terminal?: TerminalSkillAdapter; // runCommand
  screenshot?: ScreenshotSkillAdapter; // captureScreen
  app?: AppControlSkillAdapter;  // openApp, closeApp
  onSkillComplete?: (id, result) => void; // callback after execution
}
```

## Creating Custom Skills

```typescript
import type { SkillDefinition, SkillInvocation, SkillExecutionContext } from '@ghita/skills';

const mySkill: SkillDefinition = {
  id: 'custom_weather',
  name: 'Weather Lookup',
  description: 'Fetch current weather for a city',
  category: 'app',
  enabled: true,
  version: '1.0.0',
  scopes: ['workspace'],
  status: 'ready',
  async run(invocation: SkillInvocation, context: SkillExecutionContext) {
    const city = invocation.input?.city as string;
    if (!city) return { success: false, error: 'City is required' };

    // Use HTTP adapter or fetch directly
    const response = await fetch(`https://api.weather.example/${city}`);
    const data = await response.json();

    return {
      success: true,
      output: `Weather in ${city}: ${data.temperature}°C, ${data.condition}`,
      data,
    };
  },
};

// Register with the registry
registry.register(mySkill);
```

## Session-Scoped Forking

Create isolated registries for per-conversation skill configuration:

```typescript
const sessionRegistry = registry.fork();
sessionRegistry.setEnabled('docker_list', false); // Disable for this session only
// Original registry remains unchanged
```

## Security

- **Shell Escaping**: All commands passed to the terminal are escaped via `escapeShellArg()` (POSIX) or `escapePowerShellString()` (Windows).
- **SQL Safety**: The `db_query` skill only allows `SELECT` statements — `INSERT`, `UPDATE`, `DELETE`, `DROP` are blocked.
- **Path Traversal**: File skills validate paths to prevent directory traversal attacks.
- **Timeout**: Terminal commands have configurable timeouts (default: 30s).
