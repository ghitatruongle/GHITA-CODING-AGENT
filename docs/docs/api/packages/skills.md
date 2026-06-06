---
id: packages-skills
title: @ghita/skills
sidebar_label: skills
---

# @ghita/skills

Skill registry & runtime.

```typescript
import { defineSkill, SkillRegistry } from '@ghita/skills';

const mySkill = defineSkill({
  name: 'my-skill',
  description: '...',
  run: async (inputs) => ({ ok: true }),
});

const registry = new SkillRegistry();
registry.register(mySkill);

const result = await registry.run('my-skill', { foo: 'bar' });
```
