import { pathToFileURL } from 'node:url';
#!/usr/bin/env node

export async function runBrowserDryRun() {
  const calls = [];
  const adapter = {
    launch: async () => {
      calls.push('launch');
    },
    navigate: async (url) => {
      calls.push(`nav:${url}`);
    },
    close: async () => {
      calls.push('close');
    },
  };

  await adapter.launch({ headless: true });
  await adapter.navigate('https://example.com');
  await adapter.close();
  return { ok: true, calls };
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runBrowserDryRun().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
