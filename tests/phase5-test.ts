import { createNodeSkillRegistry } from '../packages/skills/src/node.js';
import { createNutJsAdapter } from '../packages/computer-use/src/node.js';
import { createPlaywrightAdapter } from '../packages/browser-control/src/node.js';

async function main() {
  console.log("Testing Phase 5 Components...\n");

  // 1. Skill Registry
  try {
    const registry = createNodeSkillRegistry();
    const result = await registry.run('terminal.run', { input: { command: 'echo hello from skills' }});
    console.log("[Skill Registry] Terminal run result:", result.success ? "SUCCESS" : "FAILED");
    if (result.success) {
        console.log("  Output:", result.output?.trim());
    } else {
        console.log("  Error:", result.error);
    }
  } catch (e) {
    console.error("[Skill Registry] ERROR:", e);
  }
  console.log("");

  // 2. Playwright Wrapper
  try {
    const browserAdapter = await createPlaywrightAdapter({ headless: true });
    await browserAdapter.navigate('https://example.com');
    const text = await browserAdapter.extractText('h1');
    console.log("[Playwright] Extract Text from example.com:", text === 'Example Domain' ? "SUCCESS" : "FAILED", `("${text}")`);
    await browserAdapter.close();
  } catch (e) {
    console.error("[Playwright] ERROR:", e);
  }
  console.log("");

  // 3. Nut.js Wrapper
  try {
    const nutAdapter = await createNutJsAdapter();
    const size = await nutAdapter.getScreenSize();
    console.log(`[Nut.js] Screen Size: ${size.width}x${size.height} -> SUCCESS`);
  } catch (e) {
    console.error("[Nut.js] ERROR:", e);
  }
  console.log("\nPhase 5 Test Complete.");
}

main().catch(console.error);
