// `$plugin-installer`-like skill: lets the coding agent install plugins during
// a session ("discover → install → report"), matching OpenAI's agent-driven
// skill-installer pattern.

import type { PluginManifest } from '../types.js';

export interface InstallFn {
  (spec: string, pluginId?: string): Promise<{ manifest?: PluginManifest; warnings: string[] }>;
}

export interface ListInstalledFn {
  (): Array<{ id: string; name: string; version: string }>;
}

export interface PluginInstallerSkillOptions {
  install: InstallFn;
  listInstalled: ListInstalledFn;
}

export interface PluginInstallerSkill {
  id: string;
  name: string;
  description: string;
  /** Invoke the installer: input.repo = "<user>/<repo>[@ref]". */
  run(input: {
    repo?: string;
    id?: string;
  }): Promise<{ success: boolean; output: string; error?: string }>;
}

/**
 * Create the agent-driven plugin installer skill. The agent invokes it with a
 * repo spec; the skill discovers, installs and reports back — no UI needed.
 */
export function createPluginInstallerSkill(
  options: PluginInstallerSkillOptions,
): PluginInstallerSkill {
  return {
    id: '$plugin-installer',
    name: 'Plugin Installer',
    description:
      'Use this skill whenever the user asks to install or update a plugin or skill from a repository. ' +
      'Triggers include: "install plugin", "add skill", "install <user>/<repo>".',
    async run(input) {
      const repo = input.repo?.trim();
      if (!repo) {
        return {
          success: false,
          output: '',
          error: 'missing required input: repo (e.g. "<user>/<repo>[@ref]")',
        };
      }
      try {
        const { manifest, warnings } = await options.install(repo, input.id);
        if (!manifest) {
          return { success: false, output: warnings.join('\n'), error: 'install failed' };
        }
        const installed = options.listInstalled().find((p) => p.id === manifest.id);
        const lines = [
          `✅ Installed ${manifest.name}@${manifest.version} (id: ${manifest.id})`,
          installed ? `Installed entries: ${installed.id}@${installed.version}` : '',
          ...warnings.map((w) => `⚠️ ${w}`),
        ];
        return { success: true, output: lines.filter(Boolean).join('\n') };
      } catch (err) {
        return {
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
