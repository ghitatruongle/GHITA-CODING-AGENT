import { describe, it, expect } from 'vitest';
import { createLinkedPair } from '@ghita/mcp';
import { createMCPClient } from '@ghita/mcp';
import { createSkillsMCPServer, type SkillLike } from './mcp-server.js';

const stubSkills: SkillLike = {
  list: () => [
    { id: 'format', name: 'format', description: 'Format code' },
    { id: 'lint', name: 'lint', description: 'Lint code' },
  ],
  get: (id) => (id === 'format' ? { id: 'format', name: 'format' } : undefined),
  run: async (id) => ({ id, ok: true }),
};

describe('createSkillsMCPServer', () => {
  it('lists skills and runs an allowlisted skill', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createSkillsMCPServer({ skills: stubSkills, allowList: ['format'] });
    await server.connect(serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    const list = await client.callTool('skills.list', {});
    expect(list.isError).toBe(false);
    expect(list.content[0]?.text).toContain('format');

    const run = await client.callTool('skills.run', { id: 'format' });
    expect(run.isError).toBe(false);

    const denied = await client.callTool('skills.run', { id: 'lint' });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]?.text).toContain('allowlist');

    await client.close();
  });

  it('returns isError for unknown skills', async () => {
    const [clientTransport, serverTransport] = createLinkedPair();
    const server = createSkillsMCPServer({ skills: stubSkills });
    await server.connect(serverTransport);
    const client = createMCPClient('c', { kind: 'in-memory', transport: clientTransport });
    await client.connect();

    const res = await client.callTool('skills.run', { id: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('not found');

    await client.close();
  });
});
