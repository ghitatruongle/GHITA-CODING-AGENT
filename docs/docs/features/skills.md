---
id: skills
title: Skills
sidebar_label: Skills
sidebar_position: 2
---

# Skills

Skill là 1 đơn vị automation có thể tái sử dụng. Mỗi skill định nghĩa:

- **Name, description, tags**
- **Inputs** (JSON schema)
- **Outputs** (JSON schema)
- **Execution script** (TypeScript hoặc shell)

## Cấu trúc 1 skill

```yaml
# skills/my-skill/skill.yaml
name: deploy-to-vercel
version: 1.0.0
description: Deploy a Vite/React app lên Vercel
tags: [deploy, vercel, frontend]
inputs:
  projectPath:
    type: string
    required: true
  production:
    type: boolean
    default: true
outputs:
  url:
    type: string
execution:
  type: script
  script: |
    import { exec } from 'node:child_process';
    export async function run(inputs) {
      await execAsync(`cd ${inputs.projectPath} && vercel deploy --prod`);
      return { url: 'https://...' };
    }
```

## Tạo skill programmatically

```typescript
import { defineSkill } from '@ghita/skills';

export const MySkill = defineSkill({
  name: 'git-commit',
  description: 'Tự động commit với conventional message',
  run: async ({ files, message }) => {
    await execAsync(`git add ${files.join(' ')}`);
    await execAsync(`git commit -m "${message}"`);
    return { committed: true };
  },
});
```

## Marketplace

Community skills có thể browse và install qua `@ghita/marketplace`:

```bash
ghita skill install vercel-deploy
ghita skill list
ghita skill run vercel-deploy --projectPath=./dist
```
