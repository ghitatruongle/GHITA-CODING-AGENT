#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT - v1.1.5-beta1 Track 1.3: Headless / CI entrypoint
// ------------------------------------------------------------------------------
// Runs a scripted agent task with no UI and streams JSON-lines events.
//   node scripts/headless.mjs -p "summarize this repo" [--max-turns 5]
//     [--tools get_date,read_file] [--fork-session <id>] [--output-format text]
// Exit codes: 0 success · 1 runtime error · 2 exhausted (no final answer).
// The CLI uses a scripted dry-run LLM so CI can exercise the full event stream
// without network or API keys; real provider wiring lands with ai-engine
// integration (Track 4) — headlessRunner tests cover the scripted contract.
// ==============================================================================

import { parseArgs } from 'node:util';
import { runHeadless } from '@ghita/agents';

const HELP = `
Usage:
  node scripts/headless.mjs -p "<prompt>" [options]

Options:
  -p, --prompt <text>        task prompt (required)
  --system <text>            system prompt override
  --max-turns <n>            hard cap on agent turns (default 10)
  --tools <a,b,c>            tool allowlist (comma-separated)
  --fork-session <id>        fork from an existing session id
  --session-id <id>          explicit session id
  --output-format <fmt>      streaming-json (default) | text
`;

/** Scripted dry-run LLM: echoes the last message without tool calls. */
async function dryRunLlm(messages) {
  const last = messages[messages.length - 1];
  const text = last?.getText?.() ?? '';
  const reply = `[dry-run] ${text.slice(0, 500)}`;
  return {
    getText: () => reply,
    toData: () => ({ role: 'assistant', content: reply }),
    metadata: undefined,
  };
}

function parseArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      p: { type: 'string' },
      prompt: { type: 'string' },
      system: { type: 'string' },
      'max-turns': { type: 'string' },
      tools: { type: 'string' },
      'fork-session': { type: 'string' },
      'session-id': { type: 'string' },
      'output-format': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  return values;
}

async function main() {
  const values = parseArgv(process.argv.slice(2));
  const prompt = values.p ?? values.prompt;
  if (values.help || !prompt) {
    process.stdout.write(HELP);
    return prompt ? 0 : 2;
  }

  const result = await runHeadless(
    {
      prompt,
      systemPrompt: values.system,
      maxTurns: values['max-turns'] ? Number(values['max-turns']) : undefined,
      toolsAllowlist: values.tools
        ? values.tools.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
      forkSession: values['fork-session'],
      sessionId: values['session-id'],
      outputFormat: values['output-format'] === 'text' ? 'text' : 'streaming-json',
      tools: [],
    },
    { llmCall: dryRunLlm },
  );
  return result.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
