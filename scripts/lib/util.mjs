/**
 * Cross-platform helpers for this repo's Node scripts (self-contained so the
 * standalone release repo has no dependency on the monorepo). Replaces the
 * Unix-only bits the old bash scripts used: `. .env`, `rsync -av --delete`,
 * `mkdir -p`, `rm -rf`, `command -v`, `node -p`. Works in PowerShell on Windows
 * and bash on Linux — no Git Bash or rsync required.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Repo root: this file lives at <root>/scripts/lib/util.mjs
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const isWindows = process.platform === 'win32';

const SHIMS = new Set(['npm', 'npx', 'netlify', 'vite', 'pnpm', 'yarn']);

// Node 24 warns (DEP0190) when an args array is combined with shell:true because
// the args aren't escaped. For the shell path (Windows .cmd shims) we pre-join into
// a single command string instead; those args are fixed, space-free literals.
function quoteArg(a) {
  return /[\s"]/.test(String(a)) ? `"${String(a).replace(/"/g, '\\"')}"` : a;
}
function invoke(command, args, useShell, spawnOpts) {
  return useShell
    ? spawnSync([command, ...args.map(quoteArg)].join(' '), spawnOpts)
    : spawnSync(command, args, spawnOpts);
}

/** Run a command inheriting stdio. Aborts (like `set -e`) on failure unless allowFail. */
export function run(command, args = [], opts = {}) {
  const { cwd = ROOT, env = process.env, allowFail = false } = opts;
  const shell = opts.shell ?? (isWindows && SHIMS.has(command));
  const res = invoke(command, args, shell, { cwd, env, shell, stdio: 'inherit' });
  if (res.error) {
    if (allowFail) return res;
    console.error(`Failed to run: ${command} ${args.join(' ')}\n${res.error.message}`);
    process.exit(1);
  }
  if (!allowFail && res.status !== 0) process.exit(res.status ?? 1);
  return res;
}

export function npm(args, opts = {}) {
  return run('npm', args, opts);
}

/** Run a command and return trimmed stdout. Throws on failure unless allowFail. */
export function capture(command, args = [], opts = {}) {
  const { cwd = ROOT, env = process.env, allowFail = false } = opts;
  const shell = opts.shell ?? (isWindows && SHIMS.has(command));
  const res = invoke(command, args, shell, { cwd, env, shell, encoding: 'utf8' });
  if (res.error) {
    if (allowFail) return '';
    throw res.error;
  }
  if (!allowFail && res.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${res.status}: ${res.stderr ?? ''}`);
  }
  return (res.stdout ?? '').trim();
}

/** True if `command` is runnable (replacement for `command -v`). */
export function commandExists(command) {
  const shell = isWindows && SHIMS.has(command);
  const res = invoke(command, ['--version'], shell, { shell, stdio: 'ignore' });
  if (!res.error) return true;
  if (res.error.code === 'ENOENT') {
    const res2 = invoke(command, [], shell, { shell, stdio: 'ignore' });
    return !(res2.error && res2.error.code === 'ENOENT');
  }
  return true;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function exists(target) {
  return fs.existsSync(target);
}

export function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function dirHasContents(dir) {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readVersion(file) {
  const v = readJson(file).version;
  if (!v) throw new Error(`No "version" field in ${file}`);
  return v;
}

const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

/** Mirror `src` into `dest` like `rsync -a --delete`. `exclude(rel, isDir)` skips + protects. */
export function mirror(src, dest, opts = {}) {
  const skip = opts.exclude ?? (() => false);
  ensureDir(dest);
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    filter(s) {
      if (path.resolve(s) === path.resolve(src)) return true;
      const rel = toRel(src, s);
      let isDirEntry = false;
      try {
        isDirEntry = fs.statSync(s).isDirectory();
      } catch {
        /* vanished mid-walk */
      }
      return !skip(rel, isDirEntry);
    },
  });
  pruneExtras(src, dest, '', skip);
}

function pruneExtras(srcRoot, destRoot, rel, skip) {
  const destDir = path.join(destRoot, rel);
  let entries;
  try {
    entries = fs.readdirSync(destDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (skip(childRel, entry.isDirectory())) continue;
    if (!fs.existsSync(path.join(srcRoot, childRel))) {
      rmrf(path.join(destRoot, childRel));
    } else if (entry.isDirectory()) {
      pruneExtras(srcRoot, destRoot, childRel, skip);
    }
  }
}

/** Load KEY=VALUE pairs from a .env into process.env (does not overwrite set vars). */
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return false;
  for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}
