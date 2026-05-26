#!/usr/bin/env node
/**
 * Post-install patch: replace deprecated jcenter() with mavenCentral()
 * in react-native-bluetooth-classic/android/build.gradle
 *
 * Safe to run multiple times (idempotent).
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const targetPattern = 'react-native-bluetooth-classic/android/build.gradle';

function findFile(dir, pattern) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.startsWith('react-native-bluetooth-clas')) {
        const target = path.join(fullPath, 'android', 'build.gradle');
        if (fs.existsSync(target)) return target;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        // Only recurse into .pnpm directory
      }
    }
    // Search in .pnpm
    const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmDir)) {
      for (const entry of fs.readdirSync(pnpmDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('react-native-bluetooth-clas')) {
          const target = path.join(pnpmDir, entry.name, 'node_modules', 'react-native-bluetooth-classic', 'android', 'build.gradle');
          if (fs.existsSync(target)) return target;
        }
      }
    }
  } catch {}
  return null;
}

const file = findFile(rootDir, targetPattern);
if (file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('jcenter()')) {
    content = content.replace(/jcenter\(\)/g, 'mavenCentral() // patched: jcenter removed');
    content = content.replace(/lintOptions\s*{/g, 'lint {');
    fs.writeFileSync(file, content);
    console.log('[postinstall] Patched react-native-bluetooth-classic: jcenter() -> mavenCentral()');
  } else {
    console.log('[postinstall] react-native-bluetooth-classic already patched');
  }
} else {
  console.log('[postinstall] react-native-bluetooth-classic not found, skipping patch');
}
