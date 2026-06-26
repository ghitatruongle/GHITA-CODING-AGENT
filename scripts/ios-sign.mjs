#!/usr/bin/env node
// ==============================================================================
// GHITA CODING AGENT — iOS Development Build Script
// Builds the iOS app for ad-hoc testing (no App Store signing required).
// Run: node scripts/ios-sign.mjs [--release]
// ==============================================================================

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const iosDir = resolve(root, 'apps/mobile/ios');
const isRelease = process.argv.includes('--release');

console.log('📱 iOS Development Build Script');
console.log(`   Mode: ${isRelease ? 'Release' : 'Debug'}`);
console.log('');

// Step 1: Build shared package
console.log('1️⃣  Building shared package...');
try {
  execSync('pnpm --filter @ghita/shared build', { cwd: root, stdio: 'inherit' });
  console.log('   ✅ Shared package built\n');
} catch (e) {
  console.error('   ❌ Failed to build shared package');
  process.exit(1);
}

// Step 2: Install CocoaPods
console.log('2️⃣  Installing CocoaPods...');
try {
  execSync('pod install', { cwd: iosDir, stdio: 'inherit' });
  console.log('   ✅ CocoaPods installed\n');
} catch (e) {
  console.error('   ❌ Failed to install CocoaPods. Run: cd apps/mobile/ios && pod install');
  process.exit(1);
}

// Step 3: Build
console.log(`3️⃣  Building iOS ${isRelease ? 'Release' : 'Debug'}...`);
const config = isRelease ? 'Release' : 'Debug';
const sdk = isRelease ? 'iphoneos' : 'iphonesimulator';
const signArgs = isRelease ? 'CODE_SIGNING_ALLOWED=NO' : '';

try {
  execSync(
    `xcodebuild -workspace GhitaMobile.xcworkspace ` +
    `-scheme GhitaMobile ` +
    `-configuration ${config} ` +
    `-sdk ${sdk} ` +
    `-derivedDataPath build ` +
    signArgs,
    { cwd: iosDir, stdio: 'inherit' }
  );
  console.log(`   ✅ iOS ${config} build complete\n`);
} catch (e) {
  console.error(`   ❌ iOS build failed. Check Xcode for errors.`);
  process.exit(1);
}

// Step 4: Report
const appPath = resolve(iosDir, 'build/Build/Products/Debug-iphonesimulator/GhitaMobile.app');
const releaseAppPath = resolve(iosDir, 'build/Build/Products/Release-iphoneos/GhitaMobile.app');
const finalPath = isRelease ? releaseAppPath : appPath;

if (existsSync(finalPath)) {
  console.log('📦 Build Output:');
  console.log(`   ${finalPath}`);
  console.log('');
  if (!isRelease) {
    console.log('💡 To install on Simulator:');
    console.log('   xcrun simctl boot "iPhone 15"');
    console.log(`   xcrun simctl install booted "${finalPath}"`);
  }
} else {
  console.log('⚠️  Build output not found at expected path.');
}

console.log('\n🎉 Done!');
