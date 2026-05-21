#!/usr/bin/env node
/**
 * Pre-submission compliance check for the Obsidian community plugin
 * directory. Catches the common reasons reviewers (human or AI) reject
 * plugins, so the first pass is as clean as possible.
 *
 * This is heuristic — passing this check is not approval. It does codify
 * the documented submission requirements and the most-cited reviewer asks.
 *
 * Usage: node scripts/check.mjs [--strict]
 *   --strict  Treat warnings as failures (exit non-zero).
 *
 * Sources for rules:
 *   - https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
 *   - https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const STRICT = process.argv.includes('--strict');

let fails = 0;
let warns = 0;

const COLORS = process.stdout.isTTY
  ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m' }
  : { red: '', yellow: '', green: '', dim: '', reset: '' };

const fail = (msg) => { console.log(`  ${COLORS.red}[FAIL]${COLORS.reset} ${msg}`); fails++; };
const warn = (msg) => { console.log(`  ${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`); warns++; };
const ok   = (msg) => { console.log(`  ${COLORS.green}[ OK ]${COLORS.reset} ${msg}`); };
const head = (msg) => { console.log(`\n${COLORS.dim}==>${COLORS.reset} ${msg}`); };

const readJson = (path) => {
  try { return JSON.parse(readFileSync(join(ROOT, path), 'utf8')); }
  catch (e) { return null; }
};

const isUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s);
const isSemver = (s) => typeof s === 'string' && /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(s);

// =============================================================
// manifest.json — the document Obsidian reads to identify the plugin.
// =============================================================
head('manifest.json');
const manifest = readJson('manifest.json');
if (!manifest) {
  fail('manifest.json missing or invalid JSON at repo root');
} else {
  const { id, name, version, minAppVersion, description, author, authorUrl, fundingUrl, isDesktopOnly } = manifest;

  // id
  if (!id) fail('manifest.id is missing');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`manifest.id "${id}" must be lowercase kebab-case (a-z, 0-9, hyphens)`);
  else if (id.startsWith('obsidian-')) fail(`manifest.id "${id}" must not start with "obsidian-"`);
  else ok(`id: ${id}`);

  // name
  if (!name) fail('manifest.name is missing');
  else if (/^obsidian\b/i.test(name)) fail(`manifest.name "${name}" must not start with "Obsidian"`);
  else if (/\bplugin\b/i.test(name)) fail(`manifest.name "${name}" must not contain the word "Plugin"`);
  else if (/\s$/.test(name)) fail(`manifest.name "${name}" has trailing whitespace`);
  else ok(`name: ${name}`);

  // version
  if (!isSemver(version)) fail(`manifest.version "${version}" is not valid semver`);
  else ok(`version: ${version}`);

  // minAppVersion
  if (!isSemver(minAppVersion)) fail(`manifest.minAppVersion "${minAppVersion}" is not valid semver`);
  else if (parseInt(minAppVersion.split('.')[0], 10) < 1) {
    fail(`manifest.minAppVersion "${minAppVersion}" looks unrealistic — Obsidian is on 1.x. Set this to a real release you actually require.`);
  } else ok(`minAppVersion: ${minAppVersion}`);

  // description
  if (!description) fail('manifest.description is missing');
  else if (description.length < 20) warn(`manifest.description is very short (${description.length} chars): "${description}"`);
  else if (description.length > 250) warn(`manifest.description is long (${description.length} chars) — the plugin browser truncates`);
  else if (/\bobsidian\b/i.test(description)) warn(`manifest.description mentions "Obsidian" — reviewers usually ask for this to be removed (it's redundant in the Obsidian plugin browser)`);
  else ok(`description present (${description.length} chars)`);

  // author
  if (!author) fail('manifest.author is missing');
  else ok(`author: ${author}`);

  // optional URLs
  if (authorUrl !== undefined && !isUrl(authorUrl)) fail(`manifest.authorUrl "${authorUrl}" is not a valid URL`);
  else if (authorUrl) ok(`authorUrl: ${authorUrl}`);

  if (fundingUrl !== undefined) {
    if (typeof fundingUrl === 'string' && !isUrl(fundingUrl)) fail(`manifest.fundingUrl "${fundingUrl}" is not a valid URL`);
    else if (typeof fundingUrl === 'object') {
      for (const [k, v] of Object.entries(fundingUrl)) {
        if (!isUrl(v)) fail(`manifest.fundingUrl["${k}"] = "${v}" is not a valid URL`);
      }
    }
  }

  if (isDesktopOnly === undefined) warn('manifest.isDesktopOnly is not set — defaults to false (mobile-compatible). Confirm your plugin works on mobile or set it to true explicitly.');
  else ok(`isDesktopOnly: ${isDesktopOnly}`);
}

// =============================================================
// versions.json — plugin version → minAppVersion mapping. Obsidian uses
// this to tell users on older app builds which plugin version they can
// install.
// =============================================================
head('versions.json');
const versions = readJson('versions.json');
if (!versions) {
  fail('versions.json missing or invalid JSON at repo root');
} else if (typeof versions !== 'object' || Array.isArray(versions)) {
  fail('versions.json must be a JSON object {pluginVersion: minAppVersion}');
} else {
  const currentVersion = manifest?.version;
  if (currentVersion && !versions[currentVersion]) {
    fail(`versions.json has no entry for current manifest version "${currentVersion}". Run update-versions-json.mjs in the monorepo.`);
  } else if (currentVersion) {
    ok(`entry for ${currentVersion}: ${versions[currentVersion]}`);
  }
  for (const [v, min] of Object.entries(versions)) {
    if (!isSemver(v)) fail(`versions.json key "${v}" is not valid semver`);
    if (!isSemver(min)) fail(`versions.json["${v}"] = "${min}" is not valid semver`);
  }
}

// =============================================================
// package.json — version should track manifest.json so the two never drift.
// =============================================================
head('package.json');
const pkg = readJson('package.json');
if (!pkg) {
  fail('package.json missing or invalid JSON');
} else {
  if (manifest && pkg.version !== manifest.version) {
    fail(`package.json version "${pkg.version}" does not match manifest.json version "${manifest.version}"`);
  } else if (manifest) {
    ok(`package.json version matches manifest (${pkg.version})`);
  }
}

// =============================================================
// Required repo files for the community plugin directory.
// =============================================================
head('required files');
for (const f of ['manifest.json', 'versions.json', 'README.md', 'LICENSE']) {
  if (existsSync(join(ROOT, f))) ok(`${f} present`);
  else fail(`${f} missing at repo root`);
}
if (existsSync(join(ROOT, 'styles.css'))) ok('styles.css present');
else warn('styles.css missing at repo root (only a problem if your plugin has any styles)');

// =============================================================
// Built dist/ — what publish.sh attaches to the GitHub release.
// =============================================================
head('dist/ (built artifacts)');
const distExists = existsSync(join(ROOT, 'dist'));
if (!distExists) {
  warn('dist/ does not exist — run `npm run build` before publishing');
} else {
  for (const f of ['main.js', 'manifest.json', 'styles.css']) {
    const p = join(ROOT, 'dist', f);
    if (!existsSync(p)) {
      fail(`dist/${f} missing — required as a GitHub release asset`);
      continue;
    }
    const size = statSync(p).size;
    if (size < 100) fail(`dist/${f} is suspiciously small (${size} bytes)`);
    else if (f === 'main.js' && size > 10 * 1024 * 1024) warn(`dist/main.js is large (${(size / 1024 / 1024).toFixed(1)} MB) — Obsidian recommends staying under a few MB; users on slow networks may notice`);
    else ok(`dist/${f} (${(size / 1024).toFixed(1)} KB)`);
  }
  const distManifest = readJson('dist/manifest.json');
  if (manifest && distManifest && distManifest.version !== manifest.version) {
    fail(`dist/manifest.json version "${distManifest.version}" does not match root manifest.json "${manifest.version}" — rebuild`);
  }
}

// =============================================================
// Source anti-patterns. Greps src/ for the patterns AI reviewers and
// human reviewers most commonly call out. Vendor/ is checked too but only
// at WARN level since you may not control all of it.
// =============================================================
head('source anti-patterns');

// Files to skip from source grep — known false-positive sources:
//   - *.test.ts            test runners legitimately use console.log
//   - src/docs/index.ts    bundled docs site HTML/JS as a string literal;
//                          innerHTML inside the string is content, not code
const EXCLUDED_FILES = new Set([join(ROOT, 'src/docs/index.ts')]);
const isExcluded = (path) => EXCLUDED_FILES.has(path) || path.endsWith('.test.ts');

const collectFiles = (dir, exts) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p, exts));
    else if (exts.some((e) => entry.name.endsWith(e)) && !isExcluded(p)) out.push(p);
  }
  return out;
};

const srcFiles = collectFiles(join(ROOT, 'src'), ['.ts', '.vue']);
const vendorFiles = collectFiles(join(ROOT, 'vendor'), ['.ts', '.vue']);

const grepHits = (files, pattern) => {
  const re = new RegExp(pattern);
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) hits.push({ file: relative(ROOT, f), line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
};

const reportHits = (label, hits, severity, max = 3) => {
  if (hits.length === 0) { ok(`${label}: no hits`); return; }
  const report = severity === 'fail' ? fail : warn;
  report(`${label}: ${hits.length} hit${hits.length === 1 ? '' : 's'}`);
  for (const h of hits.slice(0, max)) console.log(`         ${COLORS.dim}${h.file}:${h.line}${COLORS.reset} ${h.text.slice(0, 100)}`);
  if (hits.length > max) console.log(`         ${COLORS.dim}... and ${hits.length - max} more${COLORS.reset}`);
};

// Hard rejects. The innerHTML/outerHTML regex requires a preceding dot so
// it matches actual property access (el.innerHTML = ...) but not type
// declarations (innerHTML: string;) or getter/setter signatures.
reportHits('src: innerHTML/outerHTML/insertAdjacentHTML', grepHits(srcFiles, '\\.(innerHTML|outerHTML)\\b|\\.insertAdjacentHTML\\s*\\('), 'fail');
reportHits('src: sample-plugin placeholder strings',     grepHits(srcFiles, '(Sample Plugin|MyPlugin|sample-plugin|my-plugin|your-plugin-id)'), 'fail');
reportHits('src: hardcoded API key patterns',            grepHits(srcFiles, '(sk-[A-Za-z0-9]{20,}|api[_-]?key\\s*[:=]\\s*["\'][^"\']+["\'])'), 'fail');

// Warn-level.
reportHits('src: console.log',                           grepHits(srcFiles, '\\bconsole\\.log\\b'), 'warn');
reportHits('src: console.debug',                         grepHits(srcFiles, '\\bconsole\\.debug\\b'), 'warn');
reportHits('src: deprecated workspace.activeLeaf',       grepHits(srcFiles, '\\.workspace\\.activeLeaf\\b'), 'warn');
reportHits('src: alert()',                               grepHits(srcFiles, '\\balert\\s*\\('), 'warn');
reportHits('src: TODO/FIXME/XXX',                        grepHits(srcFiles, '\\b(TODO|FIXME|XXX)\\b'), 'warn');

// Vendor — same patterns, all at WARN since these are bundled deps you
// may or may not control upstream.
reportHits('vendor: innerHTML/outerHTML/insertAdjacentHTML', grepHits(vendorFiles, '\\.(innerHTML|outerHTML)\\b|\\.insertAdjacentHTML\\s*\\('), 'warn');
reportHits('vendor: console.log',                           grepHits(vendorFiles, '\\bconsole\\.log\\b'), 'warn');

// =============================================================
// Summary
// =============================================================
console.log('');
if (fails === 0 && warns === 0) {
  console.log(`${COLORS.green}All checks passed.${COLORS.reset}`);
} else {
  console.log(`Result: ${fails} fail${fails === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}.`);
}

if (fails > 0 || (STRICT && warns > 0)) process.exit(1);
