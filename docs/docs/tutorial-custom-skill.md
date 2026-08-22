---
id: tutorial-custom-skill
title: 'Tutorial: Custom skill'
sidebar_position: 9
---

# Tutorial: Tạo custom skill

Skills là cách mở rộng GHITA bằng các khả năng mới (tools, prompts, behaviors). Mỗi skill là một thư mục chứa file `SKILL.md`.

## 1. Cấu trúc skill

```
my-skills/
└── weather/
    ├── SKILL.md
    ├── index.ts
    └── package.json
```

## 2. `SKILL.md` với frontmatter

```markdown
---
name: weather
description: Tra cứu thời tiết theo thành phố
version: 1.0.0
author: your-name
trust_level: community
tools:
  - get_weather
---

# Weather Skill

Cung cấp tool `get_weather` để lấy thời tiết hiện tại.

## Usage

User hỏi: "Hôm nay Hà Nội có mưa không?"
→ Agent gọi `get_weather(city="Hanoi")` → trả lời user.
```

## 3. `index.ts` — implement tool

```ts
import { registerTool } from '@ghita/skills';

registerTool({
  name: 'get_weather',
  description: 'Lấy thời tiết hiện tại theo thành phố',
  input: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'Tên thành phố' },
    },
    required: ['city'],
  },
  handler: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const data = await res.json();
    const cur = data.current_condition[0];
    return {
      city,
      temp_c: cur.temp_C,
      description: cur.weatherDesc[0].value,
      humidity: cur.humidity,
    };
  },
});
```

## 4. `package.json`

```json
{
  "name": "@my-skills/weather",
  "version": "1.0.3",
  "main": "index.ts",
  "ghita": {
    "type": "skill",
    "manifest": "SKILL.md"
  }
}
```

## 5. Đăng ký vào Skills Hub

```bash
# Local: copy vào ~/.ghita/skills/
ghita skills install ./my-skills/weather

# Hoặc publish lên registry
ghita skills publish ./my-skills/weather
```

File `~/.ghita/skills/weather/SKILL.md` sẽ tự động được hot-reload.

## 6. Verify

```ts
import { listSkills } from '@ghita/skills';

const skills = await listSkills();
console.log(skills.find((s) => s.name === 'weather'));
```

Xong! Skill mới đã sẵn sàng để agent sử dụng.
