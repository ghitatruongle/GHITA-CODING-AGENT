import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'src', 'proto');
const distDir = path.join(__dirname, 'dist', 'proto');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

try {
  fs.copyFileSync(path.join(srcDir, 'agent.proto'), path.join(distDir, 'agent.proto'));
  console.log('Successfully copied agent.proto to dist/proto');
} catch (err) {
  console.error('Failed to copy agent.proto:', err);
  process.exit(1);
}
