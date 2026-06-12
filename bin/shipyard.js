#!/usr/bin/env node
// shipyard — drain a backlog one quality-gated task at a time, by looping a
// Claude Code command (default /ship-next). Cross-platform (Windows/macOS/Linux).
// Part of @shaal/shipyard. MIT © Ofer Shaal.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { homedir, tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
const IS_WIN = platform() === 'win32';

// ---------------------------------------------------------------- config (env)
const CMD = process.env.SHIPYARD_CMD || '/ship-next';
const MODEL = process.env.SHIPYARD_MODEL ?? 'claude-opus-4-8';
const PROGRESS_REF = process.env.SHIPYARD_PROGRESS_REF || 'HEAD';
const ZERO_STREAK_LIMIT = parseInt(process.env.SHIPYARD_ZERO_STREAK_LIMIT || '2', 10);
const EXTRA_ARGS = process.env.SHIPYARD_CLAUDE_ARGS || '';
const MCP_OFF = (process.env.SHIPYARD_MCP || 'off') !== 'on';
const READY_CMD = process.env.SHIPYARD_READY_CMD || '';

// --------------------------------------------------------------------- helpers
const log = (s = '') => process.stdout.write(s + '\n');
const err = (s = '') => process.stderr.write(s + '\n');

// Run a binary, capture trimmed stdout, or null on any failure.
function cap(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function commandExists(cmd) {
  return spawnSync(IS_WIN ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}
function quote(a) {
  a = String(a);
  return IS_WIN ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, `'\\''`)}'`;
}
function nowStamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function usage() {
  log(`shipyard ${PKG.version} — loop a Claude Code command to drain a backlog,
one quality-gated task at a time. https://github.com/shaal/shipyard

Usage:
  shipyard init [--force]   Install the /ship skill + /ship-next command into ~/.claude
  shipyard                  Loop until the backlog is empty or progress stalls
  shipyard 3                Run at most 3 iterations, then stop
  shipyard --dry-run        Print the plan + the exact claude command, don't run
  shipyard 3 --dry-run
  shipyard --help | --version

Env vars (all optional):
  SHIPYARD_CMD=/ship-next            slash command run each iteration. Must exist
                                     in the project or globally (run 'shipyard init').
  SHIPYARD_MODEL=claude-opus-4-8     --model for claude. Default opus (max quality);
                                     set claude-sonnet-4-6 for a faster/cheaper run.
  SHIPYARD_MCP=off                   off (default) drops all MCP servers (faster);
                                     'on' keeps them.
  SHIPYARD_PROGRESS_REF=HEAD         git ref whose advance means "a task shipped".
                                     Use origin/<branch> for a push/PR flow.
  SHIPYARD_READY_CMD=                command that SUCCEEDS while work remains.
                                     Auto: 'bd ready' in a beads workspace, else
                                     stall-detection only.
  SHIPYARD_ZERO_STREAK_LIMIT=2       stop after N consecutive no-progress iters.
  SHIPYARD_CLAUDE_ARGS=              extra args appended to the claude invocation.

Per-iteration logs: <tmp>/shipyard-<timestamp>/iter-NN.jsonl`);
}

// --------------------------------------------------------------- `shipyard init`
function init(force) {
  const skillSrc = join(PKG_ROOT, 'assets', 'skills', 'ship');
  const cmdSrc = join(PKG_ROOT, 'assets', 'commands', 'ship-next.md');
  const skillDst = join(homedir(), '.claude', 'skills', 'ship');
  const cmdDst = join(homedir(), '.claude', 'commands', 'ship-next.md');

  const existed = existsSync(skillDst) || existsSync(cmdDst);
  if (existed && !force) log('Updating an existing install (use --force to silence).');

  mkdirSync(skillDst, { recursive: true });
  mkdirSync(dirname(cmdDst), { recursive: true });
  cpSync(skillSrc, skillDst, { recursive: true, force: true });
  cpSync(cmdSrc, cmdDst, { force: true });

  log(`✓ installed skill   /ship       → ${skillDst}`);
  log(`✓ installed command /ship-next  → ${cmdDst}`);
  log(`\nClaude Code picks them up on its next launch. Then, in any git repo with a`);
  log(`task list or beads backlog:  shipyard 5`);
}

// ----------------------------------------------------------- backlog "oracle"
function bdHasReady() {
  const j = cap('bd', ['ready', '--json']);
  if (j) { try { const a = JSON.parse(j); if (Array.isArray(a) && a.length) return true; } catch { /* fall through */ } }
  const t = cap('bd', ['ready']);
  return !!(t && /^[a-z]+-[a-z0-9]+/m.test(t));
}
// Only treat this as a beads workspace if there's a project-local `.beads`
// (cwd or git root) — `bd ready` alone can resolve to a HOME-level ~/.beads db
// outside any git repo and falsely report the backlog empty.
function hasProjectBeads() {
  const bases = [process.cwd(), cap('git', ['rev-parse', '--show-toplevel'])].filter(Boolean);
  return bases.some((b) => existsSync(join(b, '.beads')));
}
const BEADS_MODE = !READY_CMD && commandExists('bd') && hasProjectBeads() && cap('bd', ['ready']) !== null;
function workRemains() {
  if (READY_CMD) return spawnSync(READY_CMD, { shell: true, stdio: 'ignore' }).status === 0;
  if (BEADS_MODE) return bdHasReady();
  return true; // no oracle → stall-detection is the stopper
}
const ORACLE = READY_CMD ? `custom: ${READY_CMD}`
  : BEADS_MODE ? 'beads (bd ready)'
  : `none — stop on ${ZERO_STREAK_LIMIT} no-progress iters / max-iter`;

// ------------------------------------------------------------- progress ref
const NEEDS_FETCH = PROGRESS_REF.startsWith('origin/');
function readRef() {
  if (NEEDS_FETCH) cap('git', ['fetch', 'origin', '--quiet']);
  return cap('git', ['rev-parse', PROGRESS_REF]) || 'no-ref';
}

// ------------------------------------------------------------- claude command
function claudeArgs() {
  const a = ['-p', CMD, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
  if (MODEL) a.push('--model', MODEL);
  if (MCP_OFF) a.push('--strict-mcp-config');
  if (EXTRA_ARGS) a.push(...EXTRA_ARGS.split(/\s+/).filter(Boolean));
  return a;
}
// Run one claude iteration, streaming assistant text to stdout + raw JSONL to the log.
function runClaude(args, logPath) {
  return new Promise((resolve) => {
    const cmdline = ['claude', ...args].map(quote).join(' ');
    const child = spawn(cmdline, { shell: true });
    const out = createWriteStream(logPath);
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      out.write(line + '\n');
      try {
        const o = JSON.parse(line);
        if (o.type === 'assistant') for (const c of o.message?.content || []) {
          if (c.type === 'text' && c.text) log(c.text);
          else if (c.type === 'tool_use') log(`  ↳ [tool: ${c.name}]`);
        }
      } catch { /* non-JSON line — ignore */ }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', (e) => { out.end(); err(`✗ failed to launch claude: ${e.message}`); resolve(127); });
    child.on('close', (code) => { out.end(); resolve(code ?? 1); });
  });
}

// -------------------------------------------------------------------- the loop
async function loop({ maxIter, dryRun }) {
  for (const c of ['claude', 'git']) {
    if (!commandExists(c)) { err(`✗ required command not found on PATH: ${c}`); process.exit(1); }
  }

  const model = MODEL ? `  --model ${MODEL}` : '';
  log('shipyard plan');
  log(`  command:      claude -p "${CMD}"${model}${MCP_OFF ? '  --strict-mcp-config' : ''}`);
  log(`  progress ref: ${PROGRESS_REF}${NEEDS_FETCH ? '  (fetched each iter)' : ''}`);
  log(`  backlog:      ${ORACLE}`);
  log(`  max iters:    ${maxIter > 0 ? maxIter : 'unbounded'}`);

  // No stop condition possible → require a bound.
  if (!BEADS_MODE && !READY_CMD && readRef() === 'no-ref' && maxIter === 0) {
    err(`✗ No stop condition: no backlog oracle and '${PROGRESS_REF}' doesn't resolve`);
    err(`  (not a git repo?). Pass a max iteration count, e.g. 'shipyard 5', or set`);
    err(`  SHIPYARD_READY_CMD / SHIPYARD_PROGRESS_REF.`);
    process.exit(1);
  }

  if (dryRun) {
    log(`  full cmd:     claude ${claudeArgs().join(' ')}`);
    log(`  work remains? ${workRemains() ? 'yes (would iterate)' : 'no (would stop immediately)'}`);
    log('(dry-run — nothing executed)');
    return;
  }

  const logdir = join(tmpdir(), `shipyard-${nowStamp()}`);
  mkdirSync(logdir, { recursive: true });
  log(`  logs:         ${logdir}`);

  // Keep macOS awake for long unattended runs (no-op elsewhere).
  let caffeinate = null;
  if (platform() === 'darwin' && commandExists('caffeinate')) {
    caffeinate = spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore', detached: true });
    log(`  ☕ caffeinated — idle sleep blocked.`);
  }

  let iter = 0, shipped = 0, zeroStreak = 0, failedIter = null;
  const summary = () => {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('Session summary');
    log(`  Command:     claude -p "${CMD}"`);
    log(`  Iterations:  ${iter}`);
    log(`  Shipped ok:  ${shipped}`);
    if (failedIter) log(`  Failed at:   iteration ${failedIter}`);
    if (zeroStreak > 0) log(`  No-progress streak: ${zeroStreak} (limit ${ZERO_STREAK_LIMIT})`);
    log(`  Logs:        ${logdir}`);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (caffeinate) try { process.kill(-caffeinate.pid); } catch { /* gone */ }
  };

  while (workRemains()) {
    if (maxIter > 0 && iter >= maxIter) { log(`Reached max iterations (${maxIter}); stopping.`); break; }
    iter++;
    const logPath = join(logdir, `iter-${String(iter).padStart(2, '0')}.jsonl`);
    log(`\n━━━ Iteration ${iter} → ${logPath} ━━━`);

    const before = readRef();
    const code = await runClaude(claudeArgs(), logPath);
    if (code !== 0) { failedIter = iter; err(`✗ claude exited ${code} — stopping loop`); summary(); process.exit(code); }
    const after = readRef();

    if (before === after && before !== 'no-ref') {
      zeroStreak++;
      log(`⚠ Iteration ${iter} advanced no commit on ${PROGRESS_REF} (${zeroStreak}/${ZERO_STREAK_LIMIT})`);
      if (zeroStreak >= ZERO_STREAK_LIMIT) {
        log(`✗ ${ZERO_STREAK_LIMIT} consecutive no-progress iters — backlog likely blocked or drained.`);
        log('  Stopping. Override with SHIPYARD_ZERO_STREAK_LIMIT=N.');
        summary(); process.exit(0);
      }
    } else { zeroStreak = 0; shipped++; }
    log(`━━━ Iteration ${iter} done ━━━`);
  }
  log('✓ Backlog empty.');
  summary();
}

// --------------------------------------------------------------------- main
const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) { usage(); process.exit(0); }
if (argv.includes('-v') || argv.includes('--version')) { log(PKG.version); process.exit(0); }

if (argv[0] === 'init') { init(argv.includes('--force')); process.exit(0); }

let maxIter = 0, dryRun = false;
for (const a of argv) {
  if (a === '--dry-run') dryRun = true;
  else if (/^\d+$/.test(a)) maxIter = parseInt(a, 10);
  else { err(`✗ unknown argument: ${a}`); usage(); process.exit(2); }
}
loop({ maxIter, dryRun }).catch((e) => { err(String(e?.stack || e)); process.exit(1); });
