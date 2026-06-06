import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  mainSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['getting-started', 'installation', 'configuration'],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: ['architecture', 'packages', 'data-flow'],
    },
    {
      type: 'category',
      label: 'Features',
      items: [
        'features/multi-provider',
        'features/skills',
        'features/computer-use',
        'features/memory',
        'features/marketplace',
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      items: ['tutorials/first-agent', 'tutorials/custom-skill', 'tutorials/multi-modal'],
    },
    {
      type: 'category',
      label: 'Operations',
      items: ['deployment', 'monitoring', 'security', 'contributing'],
    },
  ],
  apiSidebar: [
    'api/overview',
    {
      type: 'category',
      label: 'Packages',
      items: [
        'api/packages/shared',
        'api/packages/ai-engine',
        'api/packages/agents',
        'api/packages/memory',
        'api/packages/skills',
        'api/packages/communication',
        'api/packages/code-graph',
        'api/packages/marketplace',
        'api/packages/monitoring',
        'api/packages/quotas',
        'api/packages/security',
        'api/packages/browser-control',
        'api/packages/computer-use',
        'api/packages/relay-server',
      ],
    },
    {
      type: 'category',
      label: 'CLI',
      items: ['api/cli/commands', 'api/cli/config'],
    },
  ],
};

export default sidebars;
