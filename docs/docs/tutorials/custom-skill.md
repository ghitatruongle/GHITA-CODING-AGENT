---
id: custom-skill
title: Custom Skill
sidebar_label: Custom Skill
sidebar_position: 2
---

# Tutorial: Custom Skill

Tạo skill tự động format code với Prettier.

## Bước 1: Tạo thư mục

```bash
mkdir -p skills/format-code/src
cd skills/format-code
```

## Bước 2: skill.yaml

```yaml
name: format-code
version: 1.0.0
description: Format code với Prettier
tags: [format, prettier, code-quality]
inputs:
  files:
    type: array
    items: { type: string }
    required: true
  write:
    type: boolean
    default: false
outputs:
  formatted:
    type: array
    items: { type: string }
execution:
  type: script
  entry: ./src/run.ts
```

## Bước 3: src/run.ts

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import prettier from 'prettier';

export async function run(inputs: { files: string[]; write: boolean }) {
  const formatted: string[] = [];
  for (const file of inputs.files) {
    const source = await readFile(file, 'utf-8');
    const output = await prettier.format(source, { filepath: file });
    formatted.push(output);
    if (inputs.write) {
      await writeFile(file, output);
    }
  }
  return { formatted };
}
```

## Bước 4: Test

```bash
ghita skill run format-code --files=src/*.ts --write=true
```
