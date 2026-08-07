#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function parseArgs(values) {
  const parsed = { _: [] };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!value.startsWith('--')) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    parsed[key] = values[index + 1];
    index++;
  }
  return parsed;
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) throw new Error(`Missing required argument --${name}`);
  return value;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createRecord(args) {
  const platform = requireArg(args, 'platform');
  const assetsDirectory = resolve(requireArg(args, 'assets-dir'));
  const suffix = requireArg(args, 'suffix');
  const output = resolve(requireArg(args, 'output'));
  const artifacts = listFiles(assetsDirectory).filter(
    (path) => path.endsWith(suffix) && !path.endsWith('.sig'),
  );
  if (artifacts.length !== 1) {
    throw new Error(
      `Expected exactly one ${suffix} artifact for ${platform}, found ${artifacts.length}`,
    );
  }

  const artifact = artifacts[0];
  const signaturePath = `${artifact}.sig`;
  const signature = readFileSync(signaturePath, 'utf8').trim();
  if (!signature) throw new Error(`Updater signature is empty: ${signaturePath}`);
  writeJson(output, { platform, file: basename(artifact), signature });
}

function createManifest(args) {
  const recordsDirectory = resolve(requireArg(args, 'records-dir'));
  const output = resolve(requireArg(args, 'output'));
  const version = requireArg(args, 'version');
  const repository = requireArg(args, 'repository');
  const tag = requireArg(args, 'tag');
  const requiredPlatforms = ['windows-x86_64', 'linux-x86_64', 'darwin-x86_64', 'darwin-aarch64'];
  const platforms = {};

  for (const path of listFiles(recordsDirectory).filter((file) => file.endsWith('.json'))) {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (!record.platform || !record.file || !record.signature) {
      throw new Error(`Invalid updater record: ${path}`);
    }
    platforms[record.platform] = {
      signature: record.signature,
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(record.file)}`,
    };
  }

  // Emit a manifest for whatever platforms actually produced a signed
  // artifact. A missing platform (e.g. no macOS certs / no Android keystore)
  // must NOT block publishing the platforms that did build successfully.
  const missing = requiredPlatforms.filter((platform) => !platforms[platform]);
  if (missing.length > 0) {
    console.warn(`WARN: no updater record for ${missing.join(', ')} — omitted from manifest`);
  }
  if (Object.keys(platforms).length === 0) {
    throw new Error('No updater records found — nothing to publish');
  }

  writeJson(output, {
    version,
    notes: `See https://github.com/${repository}/releases/tag/${tag}`,
    pub_date: new Date().toISOString(),
    platforms,
  });
}

const [command, ...values] = process.argv.slice(2);
const args = parseArgs(values);

if (command === 'record') createRecord(args);
else if (command === 'manifest') createManifest(args);
else {
  console.error('Usage: updater-manifest.mjs <record|manifest> [options]');
  process.exit(2);
}
