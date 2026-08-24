import { describe, it, expect } from 'vitest';
import {
  generateSlideDeck,
  renderSlideDeckToHTML,
  presentationDeckSkill,
} from '../src/builtin/presentation-deck.js';
import {
  BUILTIN_KNOWLEDGE_PLUGINS,
  createKnowledgeWorkSkill,
  parseKnowledgePluginMarkdown,
} from '../src/adapters/knowledge-work-adapter.js';
import {
  dotnetDiagSkill,
  dotnetUpgradeSkill,
} from '../src/builtin/dotnet/dotnet-enterprise-suite.js';
import {
  executeDeepTechnicalResearch,
  deepTechResearchSkill,
} from '../src/builtin/academic/deep-tech-research.js';

describe('Absorbed Skills Integration (v0.3.7)', () => {
  describe('Presentation Deck Generator (Presenton)', () => {
    it('should parse markdown outline into a structured SlideDeck AST', () => {
      const outline = `# Section 1\n- Point A\n- Point B\n\n# Section 2\n\`\`\`ts\nconst x = 42;\n\`\`\``;
      const deck = generateSlideDeck('Architecture Review', outline, 'ghita-neon');

      expect(deck.title).toBe('Architecture Review');
      expect(deck.slides.length).toBe(3); // title slide + 2 sections
      expect(deck.slides[1]?.title).toBe('Section 1');
      expect(deck.slides[2]?.layout).toBe('code-focus');
    });

    it('should render slide deck AST to valid HTML', () => {
      const deck = generateSlideDeck('Test Presentation', '# Intro\nHello world');
      const html = renderSlideDeckToHTML(deck);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Presentation');
      expect(html).toContain('Intro');
    });

    it('should execute presentationDeckSkill successfully', async () => {
      const res = await presentationDeckSkill.run(
        { input: { title: 'Demo Deck', outline: '# Slide 1\nOverview' } },
        { registry: {}, now: () => Date.now(), adapters: {} },
      );

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('slideCount', 2);
    });
  });

  describe('Declarative Knowledge Work Plugin Adapter (Anthropic)', () => {
    it('should parse declarative plugin markdown', () => {
      const md = `# Cloud Infrastructure Cost Estimator\nDomain: Finance\nDescription: Calculate AWS cost`;
      const manifest = parseKnowledgePluginMarkdown(md);

      expect(manifest.name).toBe('Cloud Infrastructure Cost Estimator');
      expect(manifest.domain).toBe('finance');
    });

    it('should generate executable skill from manifest', async () => {
      const manifest = BUILTIN_KNOWLEDGE_PLUGINS[0];
      if (!manifest) throw new Error('Missing manifest');
      const skill = createKnowledgeWorkSkill(manifest);

      const res = await skill.run(
        { input: { context: 'PostgreSQL DB with 10k DAU' } },
        { registry: {}, now: () => Date.now(), adapters: {} },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Software Infrastructure & Cloud Cost Estimator Report');
    });
  });

  describe('Enterprise .NET Suite (.NET Skills)', () => {
    it('should have dotnetDiagSkill defined', () => {
      expect(dotnetDiagSkill.id).toBe('dotnet.diagnose');
    });

    it('should execute dotnetUpgradeSkill successfully', async () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">\n<PropertyGroup>\n<TargetFramework>net6.0</TargetFramework>\n</PropertyGroup>\n</Project>`;
      const res = await dotnetUpgradeSkill.run(
        { input: { csprojContent: csproj, targetFramework: 'net8.0' } },
        { registry: {}, now: () => Date.now(), adapters: {} },
      );

      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('targetFramework', 'net8.0');
      const data = res.data as Record<string, unknown>;
      expect(data['upgradedContent']).toContain('<TargetFramework>net8.0</TargetFramework>');
    });
  });

  describe('Deep Technical Research (Academic Research Skills)', () => {
    it('should execute deep technical research queries', () => {
      const report = executeDeepTechnicalResearch({
        topic: 'Multi-Agent Consensus',
        domain: 'CS',
        depth: 'deep',
      });

      expect(report.topic).toBe('Multi-Agent Consensus');
      expect(report.papersFound.length).toBeGreaterThan(0);
      expect(report.keyAlgorithms).toContain('Hierarchical Planning Agent Loop');
    });

    it('should execute deepTechResearchSkill successfully', async () => {
      const res = await deepTechResearchSkill.run(
        { input: { topic: 'Vector Search Optimization', depth: 'deep' } },
        { registry: {}, now: () => Date.now(), adapters: {} },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Deep Technical Research Report: Vector Search Optimization');
    });
  });
});
