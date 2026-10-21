#!/usr/bin/env node
// known-hashes — record the sha256 of every version of each installed asset that
// shipyard has ever shipped, in assets/known-hashes.json. `shipyard init` uses it
// to recognise an untouched older install that predates its manifest (or whose
// manifest is gone), so it can update that file instead of treating it as
// hand-edited. Re-run after changing anything under assets/skills/ship/ or
// assets/commands/, and commit the result.
//
//   node scripts/known-hashes.js           write assets/known-hashes.json
//   node scripts/known-hashes.js --check   exit 1 if the file is out of date
//
// Part of @shaal/shipyard. MIT © Ofer Shaal.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(PKG_ROOT, 'assets');
const OUT = join(ASSETS, 'known-hashes.json');
const CHECK = process.argv.includes('--check');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (args, opts = {}) => execFileSync('git', args, { cwd: PKG_ROOT, ...opts });

// The files init installs, as paths relative to assets/ with forward slashes.
function walk(abs) {
  if (!statSync(abs).isDirectory()) return [abs];
  return readdirSync(abs).sort().flatMap((n) => walk(join(abs, n)));
}
const installed = [...walk(join(ASSETS, 'skills', 'ship')), join(ASSETS, 'commands', 'ship-next.md')]
  .map((abs) => relative(ASSETS, abs).split(sep).join('/'));

const known = {};
for (const rel of installed) {
  const path = `assets/${rel}`;
  const hashes = new Set([sha256(readFileSync(join(ASSETS, rel)))]);
  const revs = git(['rev-list', 'HEAD', '--', path], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const rev of revs) {
    try { hashes.add(sha256(git(['show', `${rev}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] }))); }
    catch { /* the file did not exist at this revision (a deleting commit) */ }
  }
  known[rel] = [...hashes].sort();
}

const text = JSON.stringify(known, null, 2) + '\n';
if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== text) {
    process.stderr.write('known-hashes: assets/known-hashes.json is out of date — run `npm run known-hashes`\n');
    process.exit(1);
  }
  process.stdout.write('ok       assets/known-hashes.json\n');
} else {
  writeFileSync(OUT, text);
  const total = Object.values(known).reduce((n, a) => n + a.length, 0);
  process.stdout.write(`wrote assets/known-hashes.json (${installed.length} files, ${total} versions)\n`);
}
