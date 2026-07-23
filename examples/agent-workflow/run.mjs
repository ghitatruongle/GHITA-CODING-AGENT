#!/usr/bin/env node
/**
 * Minimal fake-LLM ReAct-style loop for docs/examples.
 * No network, no API keys.
 */
import { pathToFileURL } from 'node:url';

export async function runAgentWorkflow({ maxIterations = 3 } = {}) {
  const steps = [];
  let finished = false;
  let output = '';

  const tools = {
    echo: async (input) => `echo:${input.text ?? ''}`,
  };

  async function llm(turn) {
    if (turn === 0) {
      return { type: 'tool', tool: 'echo', input: { text: 'hello' } };
    }
    return { type: 'final', text: 'workflow complete' };
  }

  for (let i = 0; i < maxIterations && !finished; i++) {
    const msg = await llm(i);
    if (msg.type === 'tool') {
      const observation = await tools[msg.tool](msg.input);
      steps.push({ tool: msg.tool, observation });
      continue;
    }
    output = msg.text;
    finished = true;
  }

  return { finished, output, steps };
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runAgentWorkflow().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.finished) process.exit(1);
  });
}
