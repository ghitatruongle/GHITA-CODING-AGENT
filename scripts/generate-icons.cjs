/**
 * Generate app icons from logo_official.png for all platforms
 * Run: node scripts/generate-icons.cjs
 */

const sharp = require('sharp');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'logo_official.png');
const ICONS_DIR = path.join(ROOT, 'apps', 'desktop', 'src-tauri', 'icons');

// Check source exists
if (!existsSync(SOURCE)) {
  console.error('❌ Source logo not found:', SOURCE);
  process.exit(1);
}

console.log('🎨 Generating icons from:', SOURCE);

// Tauri required icons
const tauriIcons = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

// Windows Store logos
const windowsStoreIcons = [
  { name: 'Square30x30Logo.png', size: 30 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square71x71Logo.png', size: 71 },
  { name: 'Square89x89Logo.png', size: 89 },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png', size: 50 },
];

async function generateIcons() {
  const source = sharp(SOURCE);

  // Generate PNG icons
  const allIcons = [...tauriIcons, ...windowsStoreIcons];

  for (const { name, size } of allIcons) {
    const output = path.join(ICONS_DIR, name);
    await source
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(output);
    console.log(`  ✅ ${name} (${size}x${size})`);
  }

  // Generate ICO (Windows) - 256x256
  await sharp(SOURCE)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(path.join(ICONS_DIR, 'icon.ico'));
  console.log('  ✅ icon.ico (256x256)');

  // Generate ICNS placeholder (macOS) - 512x512 PNG
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(ICONS_DIR, 'icon.icns'));
  console.log('  ✅ icon.icns (512x512)');

  // Android icons
  const androidDir = path.join(ICONS_DIR, 'android');
  if (!existsSync(androidDir)) mkdirSync(androidDir, { recursive: true });

  const androidIcons = [
    { name: 'ic_launcher.png', size: 48 },
    { name: 'ic_launcher_round.png', size: 48 },
    { name: 'ic_launcher_foreground.png', size: 108 },
  ];

  for (const { name, size } of androidIcons) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(androidDir, name));
    console.log(`  ✅ android/${name} (${size}x${size})`);
  }

  // iOS icons
  const iosDir = path.join(ICONS_DIR, 'ios');
  if (!existsSync(iosDir)) mkdirSync(iosDir, { recursive: true });

  const iosIcons = [
    { name: 'AppIcon-20.png', size: 20 },
    { name: 'AppIcon-29.png', size: 29 },
    { name: 'AppIcon-40.png', size: 40 },
    { name: 'AppIcon-60.png', size: 60 },
    { name: 'AppIcon-76.png', size: 76 },
    { name: 'AppIcon-83.5.png', size: 84 },
    { name: 'AppIcon-1024.png', size: 1024 },
  ];

  for (const { name, size } of iosIcons) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(iosDir, name));
    console.log(`  ✅ ios/${name} (${size}x${size})`);
  }

  console.log('\n🎉 All icons generated successfully!');
  console.log('📁 Output:', ICONS_DIR);
}

generateIcons().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
