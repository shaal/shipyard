#!/usr/bin/env node
// sync-skills — copy the /ship skill from this repo into a checkout of
// github.com/shaal/skills, where it is published twice: as the `ship` skill and
// as the bundled fallback inside `ship-next`. This repo is the source of truth.
//
//   node scripts/sync-skills.js [path/to/skills]          write the copies
//   node scripts/sync-skills.js [path/to/skills] --check  exit 1 if any differ
//
// The skills checkout defaults to $SKILLS_REPO, else ../skills next to this repo.
// Part of @shaal/shipyard. MIT © Ofer Shaal.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const target = resolve(args.find((a) => !a.startsWith('--'))
  || process.env.SKILLS_REPO || join(PKG_ROOT, '..', 'skills'));

if (!existsSync(join(target, 'skills', 'ship-next', 'SKILL.md'))) {
  process.stderr.write(`sync-skills: ${target} is not a shaal/skills checkout (no skills/ship-next/SKILL.md)\n`);
  process.exit(2);
}

const read = (p) => readFileSync(join(PKG_ROOT, p), 'utf8');
const skill = read('assets/skills/ship/SKILL.md');
// Everything after the closing `---` of the YAML frontmatter.
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '');
if (body === skill) {
  process.stderr.write('sync-skills: assets/skills/ship/SKILL.md has no frontmatter\n');
  process.exit(2);
}

const HEADER = [
  '<!-- Bundled copy of the `ship` skill (skills/ship/SKILL.md), minus its frontmatter.',
  'Source of truth: https://github.com/shaal/shipyard/blob/main/assets/skills/ship/SKILL.md',
  'Used by ship-next when the ship skill is not installed. Do not edit here; re-copy on change. -->',
  '',
  '',
].join('\n');

const outputs = {
  'skills/ship/SKILL.md': skill,
  // The relative LICENSE link only resolves inside this repo.
  'skills/ship/README.md': read('assets/skills/ship/README.md')
    .replace('[MIT](../../../LICENSE)', '[MIT](https://github.com/shaal/shipyard/blob/main/LICENSE)'),
  'skills/ship-next/references/ship.md': HEADER + body,
};

let stale = 0;
for (const [rel, want] of Object.entries(outputs)) {
  const file = join(target, rel);
  const have = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (have === want) { console.log(`ok       ${rel}`); continue; }
  stale++;
  if (CHECK) console.log(`STALE    ${rel}`);
  else { writeFileSync(file, want); console.log(`updated  ${rel}`); }
}

if (CHECK && stale) {
  process.stderr.write(`sync-skills: ${stale} file(s) out of date — run: npm run sync-skills -- ${target}\n`);
  process.exit(1);
}
