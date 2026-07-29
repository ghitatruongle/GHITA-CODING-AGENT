#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const androidDirectory = join(scriptDirectory, '..', 'android');
const tasks = process.argv.slice(2);

if (tasks.length === 0) {
  console.error('Usage: node scripts/run-gradle.mjs <task> [...args]');
  process.exit(2);
}

const isWindows = process.platform === 'win32';
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : './gradlew';
const args = isWindows ? ['/d', '/s', '/c', 'gradlew.bat', ...tasks] : tasks;
const result = spawnSync(command, args, {
  cwd: androidDirectory,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
