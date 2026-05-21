# Contributing to GHITA CODING AGENT

Thank you for your interest in the project! Here are the contribution guidelines.

## Requirements

- Node.js >= 20.0.0
- pnpm >= 10.x
- Rust (for Tauri desktop)
- Android Studio (for mobile)

## Getting Started

```bash
# Clone repo
git clone https://github.com/ghitatruongle/GHITA-CODING-AGENT.git
cd GHITA-CODING-AGENT

# Install dependencies
pnpm install

# Run desktop dev
pnpm dev:desktop

# Run mobile dev
pnpm dev:android
```

## Contribution Workflow

1. Fork the repo
2. Create a branch: `git checkout -b feat/feature-name`
3. Commit: `git commit -m "feat: describe feature"`
4. Push: `git push origin feat/feature-name`
5. Create a Pull Request

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Code formatting
- `refactor:` — Code refactoring
- `test:` — Add/update tests
- `chore:` — Other tasks

## Code Style

- TypeScript strict mode
- Prettier formatting (`.prettierrc`)
- ESLint rules (`eslint.config.js`)
- Run `pnpm lint` and `pnpm typecheck` before committing

## Project Structure

```
├── apps/
│   ├── desktop/    # Tauri + React desktop app
│   └── mobile/     # React Native Android app
├── packages/
│   ├── shared/     # Types, constants, utils, logger
│   ├── ai-engine/  # Multi-provider AI engine
│   ├── skills/     # Skill registry
│   ├── agents/     # Agent management
│   ├── browser-control/
│   ├── computer-use/
│   ├── communication/
│   └── memory/
└── refer_project/  # Reference open-source projects (not project code)
```

## Pull Request Guidelines

### Before Creating a PR

- [ ] Code runs (`pnpm dev:desktop` or `pnpm dev:android`)
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] Passes lint (`pnpm lint`)
- [ ] Code is formatted (`pnpm format:check`)

### PR Rules

- **Concise**: 1 PR = 1 feature or 1 bug fix. Avoid oversized PRs.
- **Clear description**: Explain _why_ the change, not just _what_.
- **Screenshots/Video**: If UI changes, attach images or video.
- **Linked Issues**: Link related issue (if any) using `Fixes #123`.
- **Draft PR**: If work-in-progress, create a Draft PR first.

### PR Template

```markdown
## Description
[Brief explanation of the change]

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor

## How to Test
1. [Step 1]
2. [Step 2]

## Screenshots (if applicable)
```

## Bug Reports

Use [GitHub Issues](https://github.com/ghitatruongle/GHITA-CODING-AGENT/issues) to report bugs.
