// Slash commands for managing skills in the hub:
//   /skills create   — Create a new skill
//   /skills list     — List all skills
//   /skills search   — Search skills
//   /skills info     — Show skill details
//   /skills delete   — Delete a skill
//   /skills enable   — Enable a skill
//   /skills disable  — Disable a skill
//   /skills verify   — Verify skill integrity
//   /skills audit    — Show audit log
//   /skills lock     — Show lock file status
//   /skills trust    — Manage trust levels

import type { SlashCommand, ParsedArgs } from '../commands/registry.js';
import type { HubRegistry } from './hub-registry.js';
import type { SkillMeta, TrustLevel, AuditEntry } from './types.js';

// --- Helper: Format SkillMeta for display ---
function formatSkill(meta: SkillMeta): string {
  const trust =
    meta.trustLevel === 'trusted'
      ? '🟢'
      : meta.trustLevel === 'verified'
        ? '🔵'
        : meta.trustLevel === 'restricted'
          ? '🔴'
          : '⚪';
  return [
    `**${meta.name}** (${meta.id})`,
    `  Category: ${meta.category} | Version: ${meta.version}`,
    `  Trust: ${trust} ${meta.trustLevel} | Source: ${meta.source}`,
    `  Enabled: ${meta.enabled ? '✅' : '❌'}`,
    `  Hash: ${meta.contentHash.substring(0, 12)}...`,
    meta.author ? `  Author: ${meta.author}` : '',
    meta.tags.length > 0 ? `  Tags: ${meta.tags.join(', ')}` : '',
    `  ${meta.description}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// --- Create /skills commands ---
export function createSkillsCommands(hub: HubRegistry): SlashCommand[] {
  return [
    // /skills list
    {
      name: 'List Skills',
      description: 'List all skills in the hub',
      trigger: '/skills list',
      usage: '/skills list [--category <cat>] [--trust <level>]',
      flags: [
        { name: '--category', short: '-c', description: 'Filter by category', type: 'string' },
        { name: '--trust', short: '-t', description: 'Filter by trust level', type: 'string' },
      ],
      execute: async (_args: string, parsed?: ParsedArgs) => {
        const category = parsed?.flags?.category as string | undefined;
        const trust = parsed?.flags?.trust as TrustLevel | undefined;

        let skills = hub.list();

        if (category) {
          skills = skills.filter((s) => s.category === category);
        }
        if (trust) {
          skills = skills.filter((s) => s.trustLevel === trust);
        }

        if (skills.length === 0) {
          return '📋 No skills found.';
        }

        const lines = [`📋 **${skills.length} skill(s):**\n`];
        for (const s of skills) {
          const trust =
            s.trustLevel === 'trusted'
              ? '🟢'
              : s.trustLevel === 'verified'
                ? '🔵'
                : s.trustLevel === 'restricted'
                  ? '🔴'
                  : '⚪';
          lines.push(
            `${s.enabled ? '✅' : '❌'} ${trust} **${s.name}** (${s.id}) v${s.version} — ${s.category}`,
          );
        }
        return lines.join('\n');
      },
    },

    // /skills create
    {
      name: 'Create Skill',
      description: 'Create a new skill in the hub',
      trigger: '/skills create',
      usage:
        '/skills create <id> <name> [--category <cat>] [--desc <description>] [--tags <t1,t2>]',
      flags: [
        {
          name: '--category',
          short: '-c',
          description: 'Skill category',
          type: 'string',
          default: 'terminal',
        },
        { name: '--desc', short: '-d', description: 'Skill description', type: 'string' },
        { name: '--tags', short: '-t', description: 'Comma-separated tags', type: 'string' },
        {
          name: '--version',
          short: '-v',
          description: 'Version string',
          type: 'string',
          default: '0.1.0',
        },
        { name: '--author', short: '-a', description: 'Author name', type: 'string' },
      ],
      execute: async (_args: string, parsed?: ParsedArgs) => {
        const positional = parsed?.positional || [];
        const skillId = positional[0];
        const skillName = positional[1];

        if (!skillId || !skillName) {
          return '❌ Usage: /skills create <id> <name> [--category <cat>] [--desc <desc>]';
        }

        const category = (parsed?.flags?.category as SkillMeta['category']) || 'terminal';
        const description = (parsed?.flags?.desc as string) || `Auto-created skill: ${skillName}`;
        const tags = parsed?.flags?.tags
          ? (parsed.flags.tags as string).split(',').map((t) => t.trim())
          : [];
        const version = (parsed?.flags?.version as string) || '0.1.0';
        const author = parsed?.flags?.author as string | undefined;

        try {
          const meta = hub.create({
            id: skillId,
            name: skillName,
            description,
            category,
            version,
            source: 'local',
            author,
            tags,
          });
          return `✅ Skill created!\n\n${formatSkill(meta)}`;
        } catch (err) {
          return `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // /skills info
    {
      name: 'Skill Info',
      description: 'Show detailed info about a skill',
      trigger: '/skills info',
      usage: '/skills info <skill-id>',
      execute: async (args: string) => {
        const skillId = args.trim();
        if (!skillId) return '❌ Usage: /skills info <skill-id>';

        const meta = hub.get(skillId);
        if (!meta) return `❌ Skill not found: ${skillId}`;

        return formatSkill(meta);
      },
    },

    // /skills search
    {
      name: 'Search Skills',
      description: 'Search skills by keyword',
      trigger: '/skills search',
      usage: '/skills search <query>',
      execute: async (args: string) => {
        const query = args.trim();
        if (!query) return '❌ Usage: /skills search <query>';

        const results = hub.search(query);
        if (results.length === 0) return `🔍 No skills matching "${query}".`;

        const lines = [`🔍 **${results.length} result(s) for "${query}":**\n`];
        for (const s of results) {
          lines.push(`- **${s.name}** (${s.id}) — ${s.description}`);
        }
        return lines.join('\n');
      },
    },

    // /skills delete
    {
      name: 'Delete Skill',
      description: 'Delete a skill from the hub',
      trigger: '/skills delete',
      usage: '/skills delete <skill-id>',
      execute: async (args: string) => {
        const skillId = args.trim();
        if (!skillId) return '❌ Usage: /skills delete <skill-id>';

        const deleted = hub.delete(skillId);
        return deleted ? `✅ Deleted skill: ${skillId}` : `❌ Skill not found: ${skillId}`;
      },
    },

    // /skills enable
    {
      name: 'Enable Skill',
      description: 'Enable a skill',
      trigger: '/skills enable',
      usage: '/skills enable <skill-id>',
      execute: async (args: string) => {
        const skillId = args.trim();
        if (!skillId) return '❌ Usage: /skills enable <skill-id>';

        try {
          const meta = hub.enable(skillId);
          return `✅ Enabled: ${meta.name} (${meta.id})`;
        } catch (err) {
          return `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // /skills disable
    {
      name: 'Disable Skill',
      description: 'Disable a skill',
      trigger: '/skills disable',
      usage: '/skills disable <skill-id>',
      execute: async (args: string) => {
        const skillId = args.trim();
        if (!skillId) return '❌ Usage: /skills disable <skill-id>';

        try {
          const meta = hub.disable(skillId);
          return `✅ Disabled: ${meta.name} (${meta.id})`;
        } catch (err) {
          return `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // /skills verify
    {
      name: 'Verify Skills',
      description: 'Verify skill integrity hashes',
      trigger: '/skills verify',
      usage: '/skills verify [<skill-id>]',
      execute: async (args: string) => {
        const skillId = args.trim();

        if (skillId) {
          const result = hub.verify(skillId);
          return result.ok ? `✅ Verified: ${skillId}` : `❌ Verification failed: ${result.error}`;
        }

        const results = hub.verifyAll();
        const passed = results.filter((r) => r.ok).length;
        const failed = results.length - passed;

        const lines = [`🔐 **Verification: ${passed}/${results.length} passed**\n`];
        for (const r of results) {
          lines.push(r.ok ? `  ✅ ${r.skillId}` : `  ❌ ${r.skillId} — ${r.error}`);
        }
        if (failed > 0) {
          lines.push(`\n⚠️ ${failed} skill(s) failed verification!`);
        }
        return lines.join('\n');
      },
    },

    // /skills audit
    {
      name: 'Audit Log',
      description: 'Show audit log entries',
      trigger: '/skills audit',
      usage: '/skills audit [--recent <n>] [--action <action>] [--skill <id>]',
      flags: [
        {
          name: '--recent',
          short: '-r',
          description: 'Show last N entries',
          type: 'string',
          default: '10',
        },
        { name: '--action', short: '-a', description: 'Filter by action', type: 'string' },
        { name: '--skill', short: '-s', description: 'Filter by skill ID', type: 'string' },
      ],
      execute: async (_args: string, parsed?: ParsedArgs) => {
        const auditLog = hub.getAuditLog();
        const action = parsed?.flags?.action as string | undefined;
        const skillId = parsed?.flags?.skill as string | undefined;
        const recent = parseInt((parsed?.flags?.recent as string) || '10', 10);

        let entries;
        if (skillId) {
          entries = auditLog.getBySkill(skillId);
        } else if (action) {
          entries = auditLog.getByAction(action as AuditEntry['action']);
        } else {
          entries = auditLog.getRecent(recent);
        }

        if (entries.length === 0) return '📜 No audit entries found.';

        const lines = [`📜 **${entries.length} audit entry(ies):**\n`];
        for (const e of entries.slice(-20)) {
          const time = new Date(e.timestamp).toISOString().substring(0, 19);
          const status = e.success ? '✅' : '❌';
          lines.push(
            `${status} [${time}] ${e.action} ${e.skillId} v${e.skillVersion} by ${e.actor}${e.details ? ` — ${e.details}` : ''}`,
          );
        }
        return lines.join('\n');
      },
    },

    // /skills lock
    {
      name: 'Lock Status',
      description: 'Show lock file status and diff',
      trigger: '/skills lock',
      usage: '/skills lock',
      execute: async () => {
        const entries = hub.getLockEntries();
        const diff = hub.getLockDiff();

        const lines = [
          `🔒 **Lock File:** ${entries.length} locked skill(s)\n`,
          `Added: ${diff.added.length} | Updated: ${diff.updated.length} | Removed: ${diff.removed.length} | Unchanged: ${diff.unchanged.length}`,
        ];

        if (diff.added.length > 0) {
          lines.push('\n📥 **New:**');
          for (const e of diff.added) lines.push(`  + ${e.id} v${e.version}`);
        }
        if (diff.updated.length > 0) {
          lines.push('\n🔄 **Updated:**');
          for (const e of diff.updated) lines.push(`  ~ ${e.id} v${e.version}`);
        }
        if (diff.removed.length > 0) {
          lines.push('\n🗑️ **Removed:**');
          for (const id of diff.removed) lines.push(`  - ${id}`);
        }

        return lines.join('\n');
      },
    },

    // /skills trust
    {
      name: 'Trust Management',
      description: 'Manage trust levels and trusted repos',
      trigger: '/skills trust',
      usage: '/skills trust <skill-id> <level> | /skills trust --repos [add|remove|list] [<repo>]',
      flags: [
        { name: '--repos', short: '-r', description: 'Manage trusted repos', type: 'boolean' },
        { name: '--add', description: 'Add repo to trusted list', type: 'string' },
        { name: '--remove', description: 'Remove repo from trusted list', type: 'string' },
        { name: '--list', short: '-l', description: 'List trusted repos', type: 'boolean' },
      ],
      execute: async (_args: string, parsed?: ParsedArgs) => {
        const positional = parsed?.positional || [];

        // Repo management mode
        if (
          parsed?.flags?.repos ||
          parsed?.flags?.add ||
          parsed?.flags?.remove ||
          parsed?.flags?.list
        ) {
          if (parsed.flags.add) {
            hub.addTrustedRepo(parsed.flags.add as string);
            return `✅ Added trusted repo: ${parsed.flags.add}`;
          }
          if (parsed.flags.remove) {
            const removed = hub.removeTrustedRepo(parsed.flags.remove as string);
            return removed
              ? `✅ Removed trusted repo: ${parsed.flags.remove}`
              : `❌ Repo not found: ${parsed.flags.remove}`;
          }
          // Default: list
          const repos = hub.listTrustedRepos();
          if (repos.length === 0) return '📋 No trusted repos configured.';
          const lines = [`📋 **${repos.length} trusted repo(s):**\n`];
          for (const r of repos) lines.push(`  🔒 ${r}`);
          return lines.join('\n');
        }

        // Skill trust level mode
        const skillId = positional[0];
        const level = positional[1] as TrustLevel | undefined;

        if (!skillId) {
          return '❌ Usage: /skills trust <skill-id> <trusted|verified|unverified|restricted>';
        }

        if (!level || !['trusted', 'verified', 'unverified', 'restricted'].includes(level)) {
          return '❌ Trust level must be: trusted, verified, unverified, or restricted';
        }

        try {
          const meta = hub.setTrustLevel(skillId, level);
          return `✅ Trust updated: ${meta.name} → ${level}`;
        } catch (err) {
          return `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
