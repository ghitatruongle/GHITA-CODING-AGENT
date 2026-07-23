import { describe, it, expect } from 'vitest';
import { runBrowserDryRun } from './run.mjs';

describe('browser-automation example', () => {
  it('records dry-run adapter calls', async () => {
    const r = await runBrowserDryRun();
    expect(r.ok).toBe(true);
    expect(r.calls).toEqual(['launch', 'nav:https://example.com', 'close']);
  });
});
