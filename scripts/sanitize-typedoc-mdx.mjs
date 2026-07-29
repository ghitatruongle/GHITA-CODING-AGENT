#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const apiDirectory = resolve(projectRoot, 'docs/docs/api');
let changedFiles = 0;

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }),
  );
  return files.flat();
}

function encodeMdxText(line) {
  let output = '';
  let inlineCodeDelimiter = 0;

  for (let index = 0; index < line.length; ) {
    if (line[index] === '`') {
      let end = index + 1;
      while (line[end] === '`') end++;
      const runLength = end - index;
      if (inlineCodeDelimiter === 0) inlineCodeDelimiter = runLength;
      else if (inlineCodeDelimiter === runLength) inlineCodeDelimiter = 0;
      output += line.slice(index, end);
      index = end;
      continue;
    }

    const character = line[index];
    if (inlineCodeDelimiter === 0) {
      if (character === '{' && line[index - 1] !== '\\') output += '&#123;';
      else if (character === '}' && line[index - 1] !== '\\') output += '&#125;';
      else if (character === '<' && line[index - 1] !== '\\') output += '&lt;';
      else if (character === '>' && line[index - 1] !== '\\') output += '&gt;';
      else output += character;
    } else {
      output += character;
    }
    index++;
  }

  return output;
}

function sanitizeMarkdown(source) {
  let fence;
  return source
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!fence) fence = marker;
        else if (fence === marker) fence = undefined;
        return line;
      }
      return fence ? line : encodeMdxText(line);
    })
    .join('\n');
}

for (const file of await markdownFiles(apiDirectory)) {
  const source = await readFile(file, 'utf8');
  const sanitized = sanitizeMarkdown(source);
  if (sanitized !== source) {
    await writeFile(file, sanitized, 'utf8');
    changedFiles++;
  }
}

console.log(
  `[typedoc-mdx] Sanitized ${changedFiles} generated Markdown file(s) under ${relative(
    projectRoot,
    apiDirectory,
  )}.`,
);
