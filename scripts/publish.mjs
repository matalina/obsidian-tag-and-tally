#!/usr/bin/env node
/**
 * Publish an Obsidian community plugin release from this repo: commit the synced
 * diff, tag (no 'v' prefix), and push. The release itself is built and published
 * by .github/workflows/release.yml. Run from repo root.
 *
 * Usage: node scripts/publish.mjs [--dry-run]
 *   --dry-run  Print what would happen; don't commit, tag, or push.
 *
 * Requires: gh CLI installed and authenticated (`gh auth login`).
 */

import path from 'path';
import { ROOT, run, capture, commandExists, readVersion } from './lib/util.mjs';

const dryRun = process.argv.slice(2).includes('--dry-run');
for (const arg of process.argv.slice(2)) {
  if (arg !== '--dry-run') {
    console.error(`Unknown arg: ${arg}`);
    process.exit(1);
  }
}

// Run a mutating command, or just print it under --dry-run.
function mut(command, args) {
  if (dryRun) {
    console.log(`[dry-run] ${command} ${args.join(' ')}`);
  } else {
    run(command, args);
  }
}

// --- Preconditions ---
if (!commandExists('gh')) {
  console.error('Error: gh CLI not installed. https://cli.github.com/');
  process.exit(1);
}
if (run('gh', ['auth', 'status'], { allowFail: true }).status !== 0) {
  console.error("Error: gh CLI not authenticated. Run 'gh auth login'.");
  process.exit(1);
}

const branch = capture('git', ['branch', '--show-current']);
if (branch !== 'main') {
  console.error(`Error: must be on branch 'main' (current: ${branch}).`);
  process.exit(1);
}

const version = readVersion(path.join(ROOT, 'manifest.json'));
console.log(`==> Publishing tag-and-tally ${version}`);

// Refuse to overwrite an existing tag — Obsidian users would silently get a
// different plugin under the same release.
if (run('git', ['rev-parse', `refs/tags/${version}`], { allowFail: true }).status === 0) {
  console.error(`Error: local tag '${version}' already exists. Bump the version in the monorepo and re-sync.`);
  process.exit(1);
}
if (run('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${version}`], { allowFail: true }).status === 0) {
  console.error(`Error: remote tag '${version}' already exists on origin. Bump the version in the monorepo and re-sync.`);
  process.exit(1);
}

// --- Commit pending sync diff (if any) ---
if (capture('git', ['status', '--porcelain'])) {
  console.log('==> Committing synced changes');
  mut('git', ['add', '-A']);
  mut('git', ['commit', '-m', `release: ${version}`]);
} else {
  console.log('==> No pending changes to commit');
}

// --- Tag, push ---
console.log(`==> Tagging ${version} (no 'v' prefix per Obsidian guidelines)`);
mut('git', ['tag', version]);

console.log('==> Pushing main + tag to origin');
mut('git', ['push', 'origin', 'main']);
mut('git', ['push', 'origin', `refs/tags/${version}`]);

if (!dryRun) {
  const repo = capture('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  console.log('');
  console.log('==> Tag pushed. The release workflow will build, attest, and publish:');
  console.log(`    https://github.com/${repo}/actions`);
  console.log('');
  console.log('Once it finishes:');
  console.log(`    https://github.com/${repo}/releases/tag/${version}`);
  console.log('');
  console.log('If this is your first release, the next step is the one-time PR to the');
  console.log('Obsidian community plugin list:');
  console.log('  https://github.com/obsidianmd/obsidian-releases/edit/HEAD/community-plugins.json');
} else {
  console.log('');
  console.log('[dry-run] No changes made. Re-run without --dry-run to publish.');
}
