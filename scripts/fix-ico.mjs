/**
 * Generate proper ICO file from PNG
 * Run: node scripts/fix-ico.mjs
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'docs', 'logo_official.png');
const ICONS_DIR = join(ROOT, 'apps', 'desktop', 'src-tauri', 'icons');

async function main() {
  console.log('Generating proper ICO from:', SOURCE);

  // Generate multiple PNG sizes for ICO
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push(buf);
    console.log(`  Prepared ${size}x${size} PNG`);
  }

  // Create ICO
  const icoBuffer = await pngToIco(pngBuffers);
  const icoPath = join(ICONS_DIR, 'icon.ico');
  writeFileSync(icoPath, icoBuffer);
  console.log(`  ✅ icon.ico created (${icoBuffer.length} bytes)`);

  // Also create proper ICNS placeholder (PNG-based, works for Tauri build)
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(ICONS_DIR, 'icon.icns'));
  console.log('  ✅ icon.icns created (512x512 PNG)');

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
