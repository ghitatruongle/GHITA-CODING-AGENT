import type { SkillManifest } from './types.js';

// Generator types

export type TemplateId = 'http-api' | 'cli-wrapper' | 'data-transform' | 'browser-task';

export interface GeneratorOptions {
  /** Template id; auto-detected from manifest if omitted. */
  template?: TemplateId;
  /** Output language. Defaults to TypeScript. */
  language?: 'typescript' | 'javascript';
  /** Indentation. Defaults to 2 spaces. */
  indent?: string;
  /** Include the verification harness (smoke test). Defaults to true. */
  withSmokeTest?: boolean;
}

export interface GeneratedFile {
  /** Path relative to the skill directory. */
  path: string;
  /** File contents. */
  content: string;
  /** Whether this file is executable (e.g. shell script). */
  executable?: boolean;
}

export interface GenerationResult {
  template: TemplateId;
  files: GeneratedFile[];
  /** When manifest was missing required fields; generator filled defaults. */
  warnings: string[];
  /** Detected template when not provided. */
  detectedTemplate: TemplateId;
}

// Detection

export function detectTemplate(manifest: SkillManifest): TemplateId {
  const tag = (manifest.tags ?? []).join(' ').toLowerCase();
  const desc = (manifest.description ?? '').toLowerCase();
  if (/browser|scrape|crawl|web\s*page|playwright/.test(`${tag  } ${  desc}`)) return 'browser-task';
  if (/http|api|rest|graphql|webhook/.test(`${tag  } ${  desc}`)) return 'http-api';
  if (/cli|shell|exec|command|terminal|process/.test(`${tag  } ${  desc}`)) return 'cli-wrapper';
  return 'data-transform';
}

// Code generators

function renderManifest(manifest: SkillManifest, indent: string): string {
  const entries = Object.entries(manifest)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      const value = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
      return `${indent}${JSON.stringify(k)}: ${value}`;
    });
  return `{\n${entries.join(',\n')}\n}`;
}

function importsBlock(language: 'typescript' | 'javascript'): string {
  if (language === 'javascript') {
    return "const { defineSkill, ok, fail } = require('@ghita/sdk');\n";
  }
  return "import { defineSkill, ok, fail } from '@ghita/sdk';\n";
}

function renderBody(template: TemplateId, indent: string): string {
  switch (template) {
    case 'http-api':
      return [
        `${indent}const url = String(input.url ?? '');`,
        `${indent}if (!url) return fail('url is required');`,
        `${indent}const res = await fetch(url, {`,
        `${indent}  method: String(input.method ?? 'GET'),`,
        `${indent}  headers: input.headers && typeof input.headers === 'object'`,
        `${indent}    ? input.headers`,
        `${indent}    : undefined,`,
        `${indent}  body: typeof input.body === 'string' ? input.body : undefined,`,
        `${indent}});`,
        `${indent}const text = await res.text();`,
        `${indent}return ok({ status: res.status, body: text });`,
      ].join('\n');
    case 'cli-wrapper':
      return [
        `${indent}const cmd = String(input.command ?? '');`,
        `${indent}if (!cmd) return fail('command is required');`,
        `${indent}const { spawn } = require('node:child_process');`,
        `${indent}// Parse command into argv to avoid shell injection`,
        `${indent}const argv = cmd.split(/\\s+/).filter(Boolean);`,
        `${indent}if (argv.length === 0) return fail('command is empty');`,
        `${indent}return await new Promise((resolve) => {`,
        `${indent}  const child = spawn(argv[0], argv.slice(1), { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });`,
        `${indent}  let out = ''; let err = '';`,
        `${indent}  child.stdout.on('data', (b) => (out += b.toString()));`,
        `${indent}  child.stderr.on('data', (b) => (err += b.toString()));`,
        `${indent}  child.on('close', (code) => resolve(ok({ code, stdout: out, stderr: err })));`,
        `${indent}});`,
      ].join('\n');
    case 'browser-task':
      return [
        `${indent}const goal = String(input.goal ?? '');`,
        `${indent}if (!goal) return fail('goal is required');`,
        `${indent}const { chromium } = require('playwright');`,
        `${indent}const browser = await chromium.launch({ headless: true });`,
        `${indent}try {`,
        `${indent}  const ctx = await browser.newContext();`,
        `${indent}  const page = await ctx.newPage();`,
        `${indent}  if (input.url) await page.goto(String(input.url));`,
        `${indent}  // TODO: map goal to Playwright actions via the ai-browser module.`,
        `${indent}  return ok({ title: await page.title() });`,
        `${indent}} finally {`,
        `${indent}  await browser.close();`,
        `${indent}}`,
      ].join('\n');
    case 'data-transform':
    default:
      return [
        `${indent}const value = input.value;`,
        `${indent}if (value === undefined) return fail('value is required');`,
        `${indent}return ok({ transformed: String(value).toUpperCase() });`,
      ].join('\n');
  }
}

function renderEntry(
  manifest: SkillManifest,
  template: TemplateId,
  language: 'typescript' | 'javascript',
  indent: string,
): string {
  return [
    importsBlock(language),
    '',
    '// Auto-generated by GHITA Skill Generator',
    `// Template: ${template}`,
    `// Skill: ${manifest.id}@${manifest.version}`,
    '',
    'export default defineSkill({',
    `${indent}id: ${JSON.stringify(manifest.id)},`,
    `${indent}name: ${JSON.stringify(manifest.name)},`,
    `${indent}description: ${JSON.stringify(manifest.description)},`,
    `${indent}run: async (input) => {`,
    renderBody(template, indent + indent),
    `${indent}},`,
    '});',
    '',
  ].join('\n');
}

function renderSmokeTest(
  manifest: SkillManifest,
  language: 'typescript' | 'javascript',
  indent: string,
): string {
  const runner = language === 'javascript' ? 'require' : 'import';
  return [
    `// Smoke test for ${manifest.id}`,
    `const skill = ${runner === 'require' ? "require('./index.cjs').default" : "(await import('./index.js')).default"};`,
    '',
    'const result = await skill.run({ hello: "world" });',
    'if (!result.success) {',
    `${indent}console.error('Smoke test failed:', result.error);`,
    `${indent}process.exit(1);`,
    '}',
    'console.log("smoke test passed");',
    '',
  ].join('\n');
}

// Top-level generate

export function generateSkill(
  manifest: SkillManifest,
  options: GeneratorOptions = {},
): GenerationResult {
  const language = options.language ?? 'typescript';
  const indent = options.indent ?? '  ';
  const detectedTemplate = options.template ?? detectTemplate(manifest);
  const warnings: string[] = [];
  if (!manifest.id) warnings.push('Manifest missing id; used empty string');
  if (!manifest.name) warnings.push('Manifest missing name; used empty string');
  if (!manifest.description) warnings.push('Manifest missing description; used empty string');

  const files: GeneratedFile[] = [
    {
      path: 'manifest.json',
      content: renderManifest(manifest, indent),
    },
    {
      path: language === 'typescript' ? 'index.ts' : 'index.cjs',
      content: renderEntry(manifest, detectedTemplate, language, indent),
    },
  ];

  if (options.withSmokeTest !== false) {
    files.push({
      path: language === 'typescript' ? 'test/smoke.ts' : 'test/smoke.cjs',
      content: renderSmokeTest(manifest, language, indent),
    });
  }

  return { template: detectedTemplate, files, warnings, detectedTemplate };
}

/**
 * Convenience helper: write the generated files to disk in `outDir`. The
 * caller is responsible for ensuring `outDir` is a safe, dedicated location
 * (typically a temporary scratch directory per install).
 */
export async function writeGeneratedSkill(
  manifest: SkillManifest,
  outDir: string,
  fs: {
    mkdir: (p: string, opts?: { recursive?: boolean }) => Promise<void>;
    writeFile: (p: string, c: string) => Promise<void>;
    chmod?: (p: string, mode: number) => Promise<void>;
  },
  options: GeneratorOptions = {},
): Promise<GenerationResult> {
  const result = generateSkill(manifest, options);
  for (const file of result.files) {
    const target = `${outDir}/${file.path}`;
    const dir = target.split('/').slice(0, -1).join('/');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(target, file.content);
    if (file.executable && fs.chmod) await fs.chmod(target, 0o755);
  }
  return result;
}
