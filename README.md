# shipyard

**Drain a backlog one quality-gated task at a time — autonomously.**

Shipyard is three small pieces for [Claude Code](https://claude.com/claude-code) that work together:

| Piece | What it is | Replaces |
|---|---|---|
| **`/ship`** | A **skill** that completes one task end-to-end behind a four-axis *confidence gate* — it won't commit until the work is honestly proven ≥95/100. | a careful human review |
| **`/ship-next`** | A **command** that drives `/ship` **unattended** on the next backlog/roadmap task, then ships it via a squash-merged GitHub PR into the target branch. | "do the next one" |
| **`shipyard`** | A **CLI** that loops `/ship-next`, draining the whole backlog one merged PR at a time, and stops cleanly when it's done or stuck. | babysitting the loop |

```
shipyard (loop the backlog)  →  /ship-next (one task, unattended, PR-merged)  →  /ship (do it + gate it)
```

**How each task ships:** the target branch is whatever you have checked out when you launch shipyard. Each iteration syncs that branch, cuts a short-lived `ship/<task>` branch, does the work behind the gate, then **pushes, opens a GitHub PR, and squash-merges it back into the target** with `gh pr merge --squash --admin` (an unattended admin merge that doesn't wait for CI). The iteration ends back on the target branch, fast-forwarded to the merge — which is how the loop detects progress.

The point is the **confidence gate**. Each task is scored on four 0–25 axes — **Requirements Fit · Functional Robustness · Verification Evidence · System Safety** — each backed by *executed* evidence (tests, real runs, adversarial review), not "I read the code and it looks right." Total must be **≥95 with no axis below 15**. A task that can't clear the bar **parks itself** (no commit) instead of shipping weak work, so an unattended run never piles junk onto your branch.

## Install

Needs **[Node.js](https://nodejs.org) 18+**, **git**, and **Claude Code** on your `PATH`. Works on **Windows, macOS, and Linux**. Pick either — **no `npm install` required**:

**Zero-install (npx)** — nothing left on your system but the skill files:

```bash
npx @shaal/shipyard init     # one-time: add /ship + /ship-next to ~/.claude
npx @shaal/shipyard 5        # run the loop (prefix every command with npx)
```

**Global install** — shorter command, nicer if you'll use it often:

```bash
npm install -g @shaal/shipyard
shipyard init
shipyard 5
```

Run `… init` **once either way**: it copies the `/ship` skill into `~/.claude/skills/ship/` and the `/ship-next` command into `~/.claude/commands/ship-next.md` (cross-platform — uses your home dir, no symlinks). This is a *file copy* Claude Code loads from disk, so it's needed even with npx. Restart Claude Code and `/ship` + `/ship-next` are available everywhere.

> Before it's on npm, run straight from GitHub: `npx github:shaal/shipyard init`. With npx, pin freshness via `npx @shaal/shipyard@latest …` to dodge a stale cache.

## Quick start

In any git repo that has a task list — a markdown checklist with `- [ ]` items (e.g. `ROADMAP.md`, `TASKS.md`) **or** a [beads](https://github.com/steveyegge/beads) backlog:

```bash
shipyard 5          # ship up to 5 tasks, each behind the gate, one commit each
shipyard            # ship until the backlog is empty or progress stalls
shipyard --dry-run  # show the plan + exact command, run nothing
```

> Using npx instead of a global install? Prefix each command: `npx @shaal/shipyard 5`.

Each iteration runs `claude -p "/ship-next"`, which finds the next unchecked task, branches off your target, completes it, runs an adversarial review, scores the gate, then **pushes, opens a PR, and squash-merges it back into the target**. Shipyard watches your git `HEAD`: if an iteration ships **no merge** (a task parked at the gate), it counts that as no-progress and stops after a couple of those — so it halts instead of spinning.

> **Needs the [GitHub CLI](https://cli.github.com) (`gh`), authenticated.** The default flow opens and admin-merges a PR per task. Run `gh auth login` first; shipyard warns at startup if `gh` is missing.

## Tuning quality vs speed

Shipyard defaults to **max quality**: `claude-opus-4-8` on every task, plus an adversarial-review pass (independent subagents that try to *refute* the work before the gate passes). That's thorough but slow (~10–25 min/task). Dial it with env vars:

```bash
# Faster / cheaper — sonnet does the work, gate still runs:
SHIPYARD_MODEL=claude-sonnet-4-6 shipyard
```

## Configuration

All optional; sensible defaults:

| Env var | Default | Meaning |
|---|---|---|
| `SHIPYARD_CMD` | `/ship-next` | Slash command run each iteration. A project can ship its own `.claude/commands/ship-next.md` to override. |
| `SHIPYARD_MODEL` | `claude-opus-4-8` | `--model` for claude. `claude-sonnet-4-6` for speed. |
| `SHIPYARD_MCP` | `off` | `off` drops all MCP servers (faster cold start; none are needed to ship code). `on` keeps them. |
| `SHIPYARD_PROGRESS_REF` | `HEAD` | Git ref whose advance = "a task shipped". Use `origin/<branch>` for a push flow. |
| `SHIPYARD_READY_CMD` | auto | A command that succeeds while work remains. Auto-detects `bd ready` in a beads workspace; otherwise relies on stall-detection. |
| `SHIPYARD_ZERO_STREAK_LIMIT` | `2` | Stop after N consecutive iterations that ship nothing. |
| `SHIPYARD_CLAUDE_ARGS` | — | Extra args appended to the `claude` invocation. |

Per-iteration logs (the full `stream-json`) land in `<tmp>/shipyard-<timestamp>/iter-NN.jsonl`.

## How a task ships (the four phases of `/ship`)

1. **Complete** the next task to its "done when" criteria.
2. **Gate** — score the four axes against executed evidence; iterate until ≥95 (no axis <15). Adversarial reviewers try to break it first.
3. **Document** — update only what actually changed.
4. **Commit** — one task, specific files, a conventional message. (Interactively, `/ship` pauses for your "go ahead" here; `/ship-next` skips that pause and commits autonomously, since the loop is unattended.)

Under the `shipyard` loop, `/ship-next` wraps those phases in a branch-per-task PR flow: it cuts a `ship/<task>` branch off the target, runs the four phases on it, then pushes and squash-merges a PR back into the target. **The PR body embeds the four confidence scores verbatim** — per-axis number, evidence, and self-critique from the Phase 2 gate — so every merged PR carries the introspection that justified shipping it.

## Platform notes

- **macOS / Linux** — works out of the box. On macOS, long runs stay awake via `caffeinate`.
- **Windows** — runs natively (no WSL/Git Bash required); the CLI is plain Node. Ensure `claude` and `git` are on your `PATH`.

## Components, separately

- The `/ship` skill: [`assets/skills/ship/`](assets/skills/ship/) — usable on its own (`/ship`, or "ship the next task").
- The `/ship-next` command: [`assets/commands/ship-next.md`](assets/commands/ship-next.md).
- The `shipyard` CLI: [`bin/shipyard.js`](bin/shipyard.js).

## License

[MIT](LICENSE) © Ofer Shaal
