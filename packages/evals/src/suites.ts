import type { EvalSuite, EvalTask } from './types.js';

/**
 * Internal engineering suite: 20 tasks covering the domains the agent actually
 * performs (edit, terminal, browser, memory, security, skills). Tasks are
 * assertion-based via `expected` markers; fixtures power offline CI runs.
 */
export function createInternalSuite(): EvalSuite {
  const t = (
    id: string,
    title: string,
    prompt: string,
    expected: string[],
    fixture: string,
  ): EvalTask => ({ id, title, prompt, expected, fixture });

  return {
    name: 'internal-v1.1.0',
    tasks: [
      t(
        'edit-add-fix-todo',
        'Fix a TODO in a file',
        'Find the TODO in src/main.ts and implement it.',
        ['implemented', 'done'],
        'implemented: mark TODO as handled. done.',
      ),
      t(
        'edit-rename-func',
        'Rename a function',
        'Rename `run()` to `execute()` everywhere, keep exports working.',
        ['execute'],
        'execute() exported.',
      ),
      t(
        'edit-fix-typo',
        'Fix typo in comment',
        'Fix the typo in the license header comment.',
        ['ghi'],
        'All headers now say "GHITA".',
      ),
      t(
        'edit-remove-dead-code',
        'Remove dead code',
        'Delete the unused imports and the empty function placeholder.',
        ['removed'],
        'removed placeholder function.',
      ),
      t(
        'terminal-run-test',
        'Run test suite',
        'Run the package tests and report the outcome.',
        ['passed', '1 passing'],
        'All tests passed: 1 passing.',
      ),
      t(
        'terminal-git-status',
        'Git status report',
        'Run git status and summarize changed files.',
        ['modified', 'changes'],
        'git status: 2 modified files.',
      ),
      t(
        'terminal-lint',
        'Lint the project',
        'Run eslint and fix any reported errors.',
        ['all files', 'without errors'],
        'Lint complete: all files without errors.',
      ),
      t(
        'websimple',
        'Fetch a public page',
        'Fetch https://example.com and extract the heading text.',
        ['Example Domain'],
        'The page title is Example Domain.',
      ),
      t(
        'websearch',
        'Search for a definition',
        'Search the web for the definition of OKR and summarize.',
        ['objective', 'key results'],
        'OKR = objective and key results.',
      ),
      t(
        'browser-fill',
        'Fill a form',
        'Open the local demo page, fill the name field and submit.',
        ['submitted'],
        'Form submitted with the given name.',
      ),
      t(
        'browser-extract',
        'Extract a price',
        'Open the demo product page and extract the price.',
        ['$49'],
        'Extracted price: $49.99.',
      ),
      t(
        'repo-map',
        'Explain repo structure',
        'Build a map of the module and explain the key files.',
        ['package.json', 'src'],
        'Key files: package.json, src/index.ts.',
      ),
      t(
        'symbol-search',
        'Find a symbol',
        'Find where `computeRunScore` is defined and list callers.',
        ['scoring.ts'],
        'Defined in packages/evals/src/scoring.ts.',
      ),
      t(
        'memory-recall',
        'Recall prior fact',
        'From memory, tell me what color the user preferred in the last session.',
        ['blue'],
        'The user preferred blue.',
      ),
      t(
        'memory-store',
        'Remember a fact',
        'Remember that the user works on Windows for future sessions.',
        ['stored', 'remembered'],
        'Remembered: user works on Windows.',
      ),
      t(
        'security-scan',
        'Scan for secrets',
        'Scan the workspace for hardcoded API keys and propose fixes.',
        ['secret', 'found'],
        'Found 1 potential secret (sk-…). Proposed fix.',
      ),
      t(
        'security-owasp',
        'Check agentic OWASP',
        'Check the memory trust level and flag latency poisoning if low.',
        ['trust', 'ok'],
        'Memory trust is 0.8; OWASP check ok.',
      ),
      t(
        'skill-format',
        'Run formatting skill',
        'Run the prettier skill over the source folder.',
        ['formatted', 'clean'],
        'Formatted; 0 files changed.',
      ),
      t(
        'skill-lint',
        'Run lint skill',
        'Run the lint skill and report errors count.',
        ['0 errors'],
        'Lint skill reported 0 errors.',
      ),
      t(
        'workflow-deploy',
        'Run a workflow',
        'Execute the nightly flow: lint → test → report.',
        ['report', 'generated'],
        'Workflow executed, report generated.',
      ),
    ],
  };
}

/**
 * Browser evaluation suite (WebVoyager-style act/extract/observe tasks).
 * Fixtures power offline CI; a real adapter drives the browser via
 * @ghita/browser-control AIPageController.
 */
export function createBrowserSuite(): EvalSuite {
  const t = (
    id: string,
    title: string,
    prompt: string,
    expected: string[],
    fixture: string,
  ): EvalTask => ({
    id,
    title,
    prompt,
    expected,
    fixture,
    tags: ['browser'],
  });
  return {
    name: 'browser-v1.1.0',
    tasks: [
      t(
        'browser-nav-title',
        'Get page title',
        'Open https://example.com and report the title.',
        ['Example Domain'],
        'Title: Example Domain',
      ),
      t(
        'browser-extract-price',
        'Extract a price',
        'Open the demo product page and extract the price.',
        ['$49'],
        'Price: $49.99',
      ),
      t(
        'browser-fill-submit',
        'Fill and submit a form',
        'Fill the name field on the local demo form and submit.',
        ['submitted'],
        'Form submitted.',
      ),
      t(
        'browser-act-click',
        'Click a button',
        'Click the "Get Started" button and report the new state.',
        ['started'],
        'Started.',
      ),
      t(
        'browser-observe-list',
        'Observe actionables',
        'List the actionable elements on the page.',
        ['button', 'link'],
        'Actionables: 2 buttons, 3 links.',
      ),
      t(
        'browser-search-result',
        'Search and extract result',
        'Search the demo site for "ghita" and extract the first result title.',
        ['ghita'],
        'Result: GHITA docs.',
      ),
    ],
  };
}

/**
 * Skill evaluation suite: each task exercises one built-in skill end to end.
 * Fixtures power offline CI; a real adapter runs SkillRegistry.run(id).
 */
export function createSkillSuite(): EvalSuite {
  const t = (
    id: string,
    title: string,
    prompt: string,
    expected: string[],
    fixture: string,
  ): EvalTask => ({
    id,
    title,
    prompt,
    expected,
    fixture,
    tags: ['skill'],
  });
  return {
    name: 'skills-v1.1.0',
    tasks: [
      t(
        'skill-format-run',
        'Format a file',
        'Run the format skill on the source file.',
        ['formatted'],
        'Formatted: 0 changes.',
      ),
      t(
        'skill-lint-run',
        'Lint a file',
        'Run the lint skill and report errors.',
        ['0 errors'],
        'Lint: 0 errors.',
      ),
      t(
        'skill-git-status',
        'Git status',
        'Run the git skill and summarize the working tree.',
        ['modified'],
        'Git: 2 modified files.',
      ),
      t(
        'skill-grep-search',
        'Search symbols',
        'Run the grep skill for "TODO" in the workspace.',
        ['found'],
        'Found 3 TODOs.',
      ),
      t(
        'skill-doc-read',
        'Read a document',
        'Run the doc skill to summarize the README.',
        ['summary'],
        'Summary generated.',
      ),
    ],
  };
}
