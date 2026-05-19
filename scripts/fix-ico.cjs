/**
 * Generate proper ICO file from PNG
 * Run: node scripts/fix-ico.cjs
 */

const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const { writeFileSync } = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'logo_official.png');
const ICONS_DIR = path.join(ROOT, 'apps', 'desktop', 'src-tauri', 'icons');

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
  const icoPath = path.join(ICONS_DIR, 'icon.ico');
  writeFileSync(icoPath, icoBuffer);
  console.log(`  ✅ icon.ico created (${icoBuffer.length} bytes)`);

  // Also create proper ICNS placeholder (PNG-based, works for Tauri build)
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(ICONS_DIR, 'icon.icns'));
  console.log('  ✅ icon.icns created (512x512 PNG)');

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
