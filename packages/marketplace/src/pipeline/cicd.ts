// ==============================================================================
// GHITA CODING AGENT - CI/CD Workflow Generator (Phase 37)
// ==============================================================================

import type { CicdResult } from './types.js';

/**
 * Generates GitHub Actions workflow YAML for a marketplace skill.
 * Lint → Test → Build → Publish to GHITA registry.
 */
export class CicdGenerator {
  generate(nodeVersion = '22', registry = 'registry.ghita.ai'): CicdResult {
    const jobs = ['lint', 'test', 'build', 'publish'];
    const content = `name: Publish Skill

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --reporter=spec

  build:
    name: Build
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  publish:
    name: Publish to GHITA Registry
    needs: [build]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - name: Publish
        run: |
          echo "Publishing to ${registry}"
          ghita skill publish --tarball dist/skill.tgz --registry ${registry}
        env:
          GHITA_TOKEN: \${{ secrets.GHITA_TOKEN }}
`;

    return {
      workflowPath: '.github/workflows/publish.yml',
      content,
      jobs,
    };
  }
}
