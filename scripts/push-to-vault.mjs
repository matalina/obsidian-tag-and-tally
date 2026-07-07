#!/usr/bin/env node
/**
 * Build and push the plugin to an Obsidian test vault, using the same
 * DROPBOX_ROOT convention as the monorepo's sync-plugin-to-vault.mjs.
 *
 * Usage: node scripts/push-to-vault.mjs [vault-name|absolute-path] [--skip-build]
 *   vault-name (default: AppTesting) -> $DROPBOX_ROOT/Notebook/Writing/Tag and Tally/<vault>/.obsidian/plugins/tag-and-tally
 *   absolute-path                    -> used as-is
 *   --skip-build                     -> trust the existing dist/ instead of rebuilding
 *
 * DROPBOX_ROOT is read from (first wins):
 *   1. the DROPBOX_ROOT environment variable
 *   2. ./.env (if present in this repo — gitignored)
 *   3. ../tag-and-tally-prime/.env (sibling monorepo, auto-detected)
 */

import path from 'path';
import { ROOT, loadEnv, npm, mirror, ensureDir, isDir, dirHasContents } from './lib/util.mjs';

const DIST = path.join(ROOT, 'dist');
const PLUGIN_ID = 'tag-and-tally';
const VAULT_BASE = 'Notebook/Writing/Tag and Tally';

let vaultArg = 'AppTesting';
let skipBuild = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--skip-build') skipBuild = true;
  else if (arg.startsWith('-')) {
    console.error(`Unknown flag: ${arg}`);
    process.exit(1);
  } else vaultArg = arg;
}

// --- Resolve DROPBOX_ROOT (env, then this repo's .env, then the sibling monorepo's) ---
loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, '..', 'tag-and-tally-prime', '.env'));

// --- Build (default) ---
if (!skipBuild) {
  console.log('==> npm run build');
  npm(['run', 'build']);
} else {
  console.log('==> Skipping build (--skip-build)');
}

if (!isDir(DIST) || !dirHasContents(DIST)) {
  console.error(`Error: ${DIST} is missing or empty. Build first or omit --skip-build.`);
  process.exit(1);
}

// --- Resolve destination ---
let dest;
if (path.isAbsolute(vaultArg)) {
  dest = vaultArg;
} else {
  if (!process.env.DROPBOX_ROOT) {
    console.error(`Error: DROPBOX_ROOT not set (needed for vault name '${vaultArg}').`);
    console.error("       Set DROPBOX_ROOT in the environment, or in this repo's .env, or in ../tag-and-tally-prime/.env.");
    process.exit(1);
  }
  dest = path.join(process.env.DROPBOX_ROOT, ...VAULT_BASE.split('/'), vaultArg, '.obsidian', 'plugins', PLUGIN_ID);
}

// --- Sync ---
ensureDir(dest);
mirror(DIST, dest);

console.log('');
console.log(`Pushed ${PLUGIN_ID} to ${dest}`);
console.log(`Reload Obsidian in vault '${vaultArg}' to pick up the new build.`);
