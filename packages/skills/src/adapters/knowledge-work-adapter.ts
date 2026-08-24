// Absorbed from Anthropic Knowledge Work Plugins reference project.
// Parses declarative Markdown + JSON plugin manifests to extend GHITA Agent with
// domain specialist capabilities (Cost Estimator, Legal License Compliance, DevOps).

import type { SkillDefinition } from '../types.js';
import { SKILLS_VERSION } from '../types.js';
import { ok, fail, readString } from '../helpers.js';

export interface KnowledgeWorkPluginManifest {
  id: string;
  name: string;
  domain: 'finance' | 'legal' | 'devops' | 'operations' | 'marketing';
  description: string;
  systemPrompt: string;
  rules: string[];
  outputFormat: 'json' | 'markdown' | 'table';
}

/** Built-in Declarative Knowledge Work Manifests (absorbed from Anthropic Knowledge Work Plugins) */
export const BUILTIN_KNOWLEDGE_PLUGINS: KnowledgeWorkPluginManifest[] = [
  {
    id: 'knowledge.cost-estimator',
    name: 'Software Infrastructure & Cloud Cost Estimator',
    domain: 'finance',
    description:
      'Estimate monthly cloud infrastructure costs (AWS/GCP/Azure) and token costs for a given codebase architecture.',
    systemPrompt:
      'You are a Principal Cloud Economist. Analyze codebase architectures, database sizing, traffic estimates, and LLM token usage to generate detailed financial cost projections.',
    rules: [
      'Breakdown costs by Compute, Storage, Networking, and AI API Tokens.',
      'Provide Low, Expected, and High traffic scenario estimates.',
      'Suggest specific cost optimization strategies (Reserved Instances, Caching, Prompt Truncation).',
    ],
    outputFormat: 'markdown',
  },
  {
    id: 'knowledge.legal-license-auditor',
    name: 'Open-Source License & Legal Compliance Auditor',
    domain: 'legal',
    description:
      'Audit repository dependencies for open-source license compatibility and legal IP risks (GPL, AGPL, MIT, Apache).',
    systemPrompt:
      'You are a Senior Intellectual Property & Open Source Compliance Officer. Audit package manifests (package.json, Cargo.toml, Go.mod) for license friction and copyleft risks.',
    rules: [
      'Classify all dependencies into Permissive (MIT/Apache), Weak Copyleft (LGPL), and Strong Copyleft (GPL/AGPL).',
      'Flag any AGPL licenses if the application is deployed as a SaaS.',
      'Provide remediation options for conflicting open-source packages.',
    ],
    outputFormat: 'markdown',
  },
  {
    id: 'knowledge.devops-planner',
    name: 'DevOps & Reliability Operations Planner',
    domain: 'devops',
    description:
      'Generate production-grade CI/CD pipelines, SLO/SLA monitoring alerts, and incident response playbooks for a codebase.',
    systemPrompt:
      'You are a Lead Site Reliability Engineer (SRE). Plan CI/CD automation, Docker/Kubernetes deployment manifests, and observability alerts.',
    rules: [
      'Define SLA targets (99.9% uptime) and Error Budget policies.',
      'Specify GitHub Actions workflow jobs with caching and security scanning.',
      'Draft step-by-step PagerDuty incident response runbooks.',
    ],
    outputFormat: 'markdown',
  },
];

/** Parse a declarative Markdown plugin file into a KnowledgeWorkPluginManifest */
export function parseKnowledgePluginMarkdown(markdownContent: string): KnowledgeWorkPluginManifest {
  const nameMatch = markdownContent.match(/#\s+(.+)/);
  const domainMatch = markdownContent.match(/Domain:\s*(\w+)/i);
  const descMatch = markdownContent.match(/Description:\s*(.+)/i);

  const name = nameMatch ? (nameMatch[1]?.trim() ?? 'Custom Plugin') : 'Custom Plugin';
  const domain = (
    domainMatch ? domainMatch[1]?.toLowerCase() : 'operations'
  ) as KnowledgeWorkPluginManifest['domain'];
  const description = descMatch ? (descMatch[1]?.trim() ?? '') : 'Declarative knowledge plugin';

  return {
    id: `knowledge.${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    name,
    domain,
    description,
    systemPrompt: markdownContent,
    rules: ['Follow declared persona guidelines', 'Format output clearly'],
    outputFormat: 'markdown',
  };
}

/** Convert a KnowledgeWorkPluginManifest into an executable SkillDefinition */
export function createKnowledgeWorkSkill(manifest: KnowledgeWorkPluginManifest): SkillDefinition {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    category: 'app',
    enabled: true,
    version: SKILLS_VERSION,
    scopes: ['workspace'],
    status: 'ready',
    parameters: {
      context: {
        type: 'string',
        description: 'Codebase context or architecture notes to evaluate',
        required: true,
      },
    },
    run: async ({ input }) => {
      const context = readString(input, 'context');
      if (!context) return fail('Missing required input: context');

      const formattedRules = manifest.rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
      const report = `## ${manifest.name} Report\n\n**Domain:** ${manifest.domain.toUpperCase()}\n\n### Execution Persona & Guidelines\n${manifest.systemPrompt}\n\n### Mandatory Compliance Rules\n${formattedRules}\n\n### Context Evaluated\n${context}\n\n---\n*Report generated via GHITA Knowledge Work Plugin Engine (${manifest.id})*`;

      return ok(report, { pluginId: manifest.id, domain: manifest.domain });
    },
  };
}
