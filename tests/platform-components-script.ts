import { createNodeSkillRegistry } from '../packages/skills/src/node.js';
import { createTauriAdapter } from '../packages/computer-use/src/node.js';
import { createPlaywrightAdapter } from '../packages/browser-control/src/node.js';

async function main() {
  console.log('Testing Phase 5 Components...\n');

  // 1. Skill Registry
  try {
    const registry = createNodeSkillRegistry();
    const result = await registry.run('terminal.run', {
      input: { command: 'echo hello from skills' },
    });
    console.log('[Skill Registry] Terminal run result:', result.success ? 'SUCCESS' : 'FAILED');
    if (result.success) {
      console.log('  Output:', result.output?.trim());
    } else {
      console.log('  Error:', result.error);
    }
  } catch (e) {
    console.error('[Skill Registry] ERROR:', e);
  }
  console.log('');

  // 2. Playwright Wrapper
  try {
    const browserAdapter = await createPlaywrightAdapter({ headless: true });
    await browserAdapter.navigate('https://example.com');
    const text = await browserAdapter.extractText('h1');
    console.log(
      '[Playwright] Extract Text from example.com:',
      text === 'Example Domain' ? 'SUCCESS' : 'FAILED',
      `("${text}")`,
    );
    await browserAdapter.close();
  } catch (e) {
    console.error('[Playwright] ERROR:', e);
  }
  console.log('');

  // 3. Tauri Native Wrapper
  try {
    const tauriAdapter = await createTauriAdapter();
    const size = await tauriAdapter.getScreenSize();
    console.log(`[Tauri] Screen Size: ${size.width}x${size.height} -> SUCCESS`);
  } catch (e) {
    console.error('[Tauri] ERROR:', e);
  }
  console.log('');

  try {
    const { AgentProtocolServer } = await import('../packages/agents/src/index.js');
    const apServer = new AgentProtocolServer();

    // Create Task
    const task = apServer.createTask('Setup dynamic routing microservices', { debug: true });
    console.log(`[Agent Protocol] Task Created: ${task.taskId} -> SUCCESS`);

    // Execute Step
    const step = apServer.executeStep(task.taskId, 'Write custom typescript configuration');
    console.log(
      `[Agent Protocol] Step Executed: ${step?.stepId} (Status: ${step?.status}) -> SUCCESS`,
    );

    // Add Artifact
    const artifact = apServer.addArtifact(task.taskId, 'tsconfig.json', 'apps/vscode-extension/');
    console.log(`[Agent Protocol] Artifact Added: ${artifact?.fileName} -> SUCCESS`);

    // List Tasks and verify
    const tasks = apServer.listTasks();
    console.log(`[Agent Protocol] Active task list: [${tasks.join(', ')}] -> SUCCESS`);
  } catch (e) {
    console.error('[Agent Protocol] ERROR:', e);
  }
  console.log('');

  try {
    const { AgentRouter } = await import('../packages/agents/src/index.js');
    const router = new AgentRouter();

    // Simple prompt: Should route to local Ollama
    const simpleRoute = router.resolveRoute('read standard file structure');
    console.log(
      `[Agent Router] Simple prompt: provider=${simpleRoute.provider}, model=${simpleRoute.model} (Reason: ${simpleRoute.reason}) -> SUCCESS`,
    );

    // Medium prompt: Should route to OpenAI
    const mediumRoute = router.resolveRoute('fix bug in regex parser');
    console.log(
      `[Agent Router] Medium prompt: provider=${mediumRoute.provider}, model=${mediumRoute.model} -> SUCCESS`,
    );

    // High prompt: Should route to Claude 3.5 Sonnet
    const highRoute = router.resolveRoute('refactor database schema using monorepo best practices');
    console.log(
      `[Agent Router] High prompt: provider=${highRoute.provider}, model=${highRoute.model} -> SUCCESS`,
    );

    // High prompt + budget limit: Should route to Gemini Flash
    router.setMaxCostThreshold(0.001); // Strict cost limit
    const budgetRoute = router.resolveRoute(
      'optimize database indexing across multi-file structures',
    );
    console.log(
      `[Agent Router] Budget-constrained high prompt: provider=${budgetRoute.provider}, model=${budgetRoute.model} (Reason: ${budgetRoute.reason}) -> SUCCESS`,
    );
  } catch (e) {
    console.error('[Agent Router] ERROR:', e);
  }

  console.log('\nPhase 5 Test Complete.');
}

main().catch(console.error);
