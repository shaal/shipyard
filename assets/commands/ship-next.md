---
description: Ship the next backlog/roadmap task unattended — branch off the target, run /ship on it, then push, open a GitHub PR, and merge it back into the target branch. One task per invocation; designed to be looped by shipyard.
---

You are an **unattended single-task driver**. Complete exactly **one** task
end-to-end with the `/ship` skill, then **ship it through a pull request** —
without pausing for acknowledgment, because no human is watching. This command
is meant to be looped by the `shipyard` runner (one invocation = one task = one
merged PR).

Generic by design: it works for a beads project or a markdown-roadmap project.
A project may override this with its own `.claude/commands/ship-next.md`.

## The shipping model: branch → PR → merge into the target

Each task is its own short-lived branch that lands on the **target branch** via a
squash-merged GitHub PR. The target branch is **whatever branch is checked out
when this invocation starts** — capture it, never hardcode `main`.

The end state of every successful iteration is: **back on the target branch,
fast-forwarded to include the just-merged commit.** That is what the loop runner
detects as progress (its `HEAD` advanced), so returning to the target branch is
not optional.

## 0. Capture the target branch and preflight

1. `git branch --show-current` → call this **TARGET**. If it's empty (detached
   HEAD), STOP and report — there's no branch to merge into.
   - **If the current branch is itself a `ship/*` task branch**, you are not on a
     real target — this is residue from a previous iteration that was interrupted
     before it returned to the target (see step 1's recovery). Do **not** treat a
     `ship/*` branch as TARGET. Recover first: the integration branch it was cut
     from is the repo's default branch — `git symbolic-ref --short refs/remotes/origin/HEAD`
     (e.g. `origin/main` → `main`). Note the `ship/*` branch name as **RESUME**
     (you may continue it in step 4), then `git switch <default>` and use that as
     TARGET. If the default can't be resolved, STOP and report.
2. Confirm the remote and GitHub CLI are usable: `git remote get-url origin` must
   succeed, and `gh auth status` must show you authenticated. If either fails,
   STOP and report exactly what's missing — do **not** fall back to a local-only
   commit, because the loop expects the target branch to advance via a merge.

## 1. Dirty tree: recover your own residue, refuse stray work

Run `git status --short`. Untracked build output / ignored files are fine. If
there are **uncommitted tracked changes**, decide what they are before acting —
**never stash or commit unrelated work blindly**, but in an unattended loop you
must also not deadlock on residue you created yourself:

- **Residue from an interrupted attempt at a task** — you reached step 0 on a
  `ship/*` branch (you noted it as RESUME), *or* the changes sit on a `ship/<slug>`
  branch and are confined to that task's files. This is your own work-in-progress
  from an iteration that died before it could commit (e.g. it ended its turn while
  a background task was still running). **Recover, don't stop:** treat that branch
  as the resume target in step 4 — you will commit these changes there and finish
  shipping the task, rather than starting over. Do **not** discard them.
- **Unrelated stray work** — uncommitted changes on TARGET itself, or that don't
  correspond to the task you're about to pick (genuine human work-in-progress).
  Keep the guardrail: **STOP and report** — do not stash or commit them.

When in doubt (you can't attribute the changes to the current task), treat them as
stray and STOP. The recovery path is only for residue you can positively tie to a
`ship/*` task branch.

## 2. Sync the target branch

Make sure TARGET is current before branching off it, so the PR diff is clean:
`git fetch origin`, then if TARGET has an upstream, `git pull --ff-only`. If the
fast-forward fails (TARGET and its remote have diverged), STOP and report — don't
force or merge to paper over it.

## 3. Find the next task

**If a task file was passed as an argument** (`$ARGUMENTS` is non-empty — the
`shipyard --tasks <file>` runner appends it here), that file is the
**authoritative** task source. Read it, take the **first unchecked `- [ ]`** task
in document order (honoring any `depends:`/ordering notes), and do **not**
auto-discover or consult beads. If it has no unchecked boxes → STOP, say
"task file complete".

**Otherwise** (no argument), discover the source:

- **Beads project** (`bd ready` succeeds): run `bd ready --json` and take the
  highest-priority unblocked item. If empty → STOP, say "backlog empty".
- **Roadmap/checklist project**: find the project's task checklist — a tracked
  markdown file with `- [ ]` task checkboxes (e.g. `EDGENET.md`, `ROADMAP.md`,
  `TASKS.md`, or one the project's `CLAUDE.md`/`AGENTS.md` points to). Take the
  **first unchecked `- [ ]`** task in document order. Honor any
  `depends:`/ordering notes — never skip ahead to a task with unmet
  dependencies. If every task is checked → STOP, say "roadmap complete".

State which task you picked in one line before starting.

## 4. Cut a task branch off the target — or resume an existing one

The slug is the beads id (e.g. `ship/qh-42`) or a short kebab-case slug of the
task title. Decide between a fresh branch and resuming an interrupted one:

- **`ship/<slug>` already exists** — check whether it's an in-progress attempt at
  *this same task*: it is the RESUME branch noted in step 0/1, **or** it is ahead
  of TARGET (`git rev-list --count <TARGET>..ship/<slug>` > 0), **or** it carries
  uncommitted changes for this task. If so, **resume it**: `git switch ship/<slug>`,
  and if there are uncommitted task changes, commit them here as the task's WIP
  (you'll continue from there in step 5). Its existing commits are this task's
  work — do **not** start over. Only if the existing branch is **unrelated** (not
  ahead of TARGET, not this task) append a short disambiguator and start fresh.
- **`ship/<slug>` does not exist** — create it off the now-current TARGET:
  `git switch -c ship/<slug>`.

All of the work and the commit for this task happen on this branch — never
directly on TARGET. When resuming, re-verify from scratch in step 5/6: prior
partial work is **untrusted** until your own adversarial pass confirms it.

## 5. Run /ship on that task — UNATTENDED

**You are headless — there is no "later".** When your turn ends, this process
exits and **any background task you started is killed on the spot**. So you must
drive this task to a *terminal state within this one turn*: either fully shipped
(step 7, back on TARGET with a clean tree) or failed (step 8). Two rules follow:

- **Never end your turn with uncommitted work or a running background task.** If
  you launch background work (a deploy, a calibration run, a long test), **block
  on it to completion** — poll it synchronously and wait — before you score the
  gate or commit. Do **not** "park" on it expecting to be resumed; you won't be,
  and you'll strand a dirty tree that jams the next iteration.
- If a step genuinely can't finish within the turn, take the **fail path**
  (step 8) cleanly rather than yielding mid-flight.

Invoke the `/ship` skill for the chosen task, with **two overrides**:
/ship's Phase 4 normally **holds for a human "go ahead"** and **does not push**.
There is no human here and we ship via PR, so change *only* those two things —
nothing else:

- Phases 1–3 are unchanged: complete the work, score the four-axis confidence
  gate **honestly** (do not inflate to force a ship), and update docs.
- **Phase 4 (commit) becomes commit-on-the-task-branch:**
  - Gate **PASS** (total ≥95 **and** no axis <15) → **mark the task done, then
    commit** to the task branch. Marking done is part of the shipped change — it's
    what lets the loop advance instead of re-picking this same task next iteration:
      - **Markdown checklist:** flip this task's `- [ ]` to `- [x]` in the task
        file (tick any sub-items you actually finished), and stage that file with
        the rest of the work.
      - **Beads:** `bd close <id> --reason "<one-line outcome>"`, and stage any
        exported `.beads/*.jsonl` it writes.
    Then commit — one task; stage **specific files** (never `-A`/`.`); concise
    Conventional-Commits message focused on the *why*; **no AI-authorship
    trailers**. Then proceed to step 7 (ship the PR).
  - Gate **FAIL** → do **NOT** commit. Go to step 8 (fail path).

## 6. Adversarial verification (this is a MAX-QUALITY loop)

Spend capability to raise the quality ceiling — don't just run the happy-path tests:

- **Match the *probe* to the task for cost, not quality.** Pure-logic tasks
  (`src/mesh/*`, schemas, stores, detectors, math) verify via `npm test` (+
  `npm run build` if the bundle is affected) — no need to spin up a browser. Only
  run a headless **browser smoke test when the task changes what the page
  renders** (`sky.js`, `index.html`, `sky3d.js`, `draw.js`, `panels.js`,
  `gpu-sats.js`, or new UI). This trims waste, not rigor.
- **Before the gate may PASS, run an adversarial review.** Spawn independent
  reviewer subagent(s) (the Agent tool — they inherit the orchestrator's model,
  opus here) whose job is to **refute** the work, not bless it: hunt correctness
  bugs, missed edge cases, untested/hostile-input paths, ADR/spec violations, and
  regressions. Scale with risk — **1** reviewer for a small change, **2–3 with
  distinct lenses** (correctness · robustness/edges · spec-&-ADR-fit) for a hard
  or load-bearing task. Each returns concrete findings or a precise "tried X/Y/Z,
  found nothing."
- **Treat findings as blocking.** Fix every real issue they surface, then
  **re-verify** (re-run tests + a fresh refute pass). Only when reviewers can no
  longer break it AND the four-axis gate is *honestly* ≥95 (no axis <15) does it
  ship. **Do not** shortcut or inflate the gate to save time — quality is the
  whole point of this loop; iterate as long as honest progress continues.
- If it genuinely cannot reach ≥95 after real iteration, take the **fail path**
  (step 8) rather than shipping weak work.

## 7. Ship it: push → PR → squash-merge → return to target

Only reached when the gate PASSED and the commit is on the task branch. Run these
in order; if any step errors, STOP and report — do not leave a half-shipped state
silently:

1. **Push** the task branch: `git push -u origin HEAD`.
2. **Open the PR with the auto-filled description**, against the captured target.
   Let `gh` populate the title and body from the commit — do **not** pass
   `--body` here (it's mutually exclusive with `--fill`):
   ```
   gh pr create --base "$TARGET" --head ship/<slug> --fill
   ```
   Capture the PR number/URL it prints.
3. **Append the confidence scores to that description.** Read the body `gh` just
   generated, then re-write it as `<auto-filled body>` + a blank line + the
   `## Confidence` section (template below):
   ```
   gh pr edit <number> --body "$(printf '%s\n\n%s' "$(gh pr view <number> --json body -q .body)" "<confidence section>")"
   ```
   The auto-fill stays exactly as `gh` wrote it; the scores are *added after* it.
4. **Verify before merging (guardrail).** Confirm the scores actually landed:
   `gh pr view <number> --json body -q .body` must now contain the `## Confidence`
   heading and the `Total:` line. If it doesn't (the edit failed), STOP and
   report — do **not** merge a PR that's missing its confidence section.
5. **Merge immediately** — this is an unattended, admin-merge flow that does
   **not** wait for CI: `gh pr merge --squash --admin --delete-branch`. The
   `--admin` bypasses branch protection so the loop never stalls on required
   checks; `--delete-branch` cleans up the remote task branch.
6. **Return to the target and fast-forward:** `git switch "$TARGET"` then
   `git pull --ff-only`. This brings the squashed merge commit into your local
   target branch, which is what the loop runner sees as progress. Delete the
   now-merged local task branch (`git branch -D ship/<slug>`).

After this, you must be on TARGET with a clean tree and `HEAD` pointing at the new
squash-merge commit.

### The `## Confidence` section appended in step 3

This section is **load-bearing**: it carries the same per-axis introspection the
gate produced, so a reviewer (or future-you reading `git log`) gets it without
digging the conversation back up. It is appended *after* `gh`'s auto-filled
description, using this shape:

```
## Confidence

Verbatim from /ship's Phase 2 confidence gate — per-axis score (0–25), the
evidence used, and the self-critique. Treat anything below 20 as a known soft
spot to verify before relying on it.

**Requirements Fit: X/25**
- Evidence:
  - <concrete bullet — file:line or test output, not a claim>
- To honestly score 25 I would need to: <one concrete item, or "already at 25">
- Self-critique: <one sentence on what could still be wrong>

**Functional Robustness: X/25**
- Evidence:
  - <…>
- To honestly score 25 I would need to: <…>
- Self-critique: <…>

**Verification Evidence: X/25**
- Evidence:
  - <…test command + result, screenshot path, real-env probe…>
- To honestly score 25 I would need to: <…>
- Self-critique: <…>

**System Safety & Integration: X/25**
- Evidence:
  - <…>
- To honestly score 25 I would need to: <…>
- Self-critique: <…>

**Total: X/100. Gate (≥95 AND no axis <15): PASS**
```

Rules for this section:
- **Copy the actual numbers and evidence verbatim from the Phase 2 output — do
  not regenerate or summarize them.** The whole point is fidelity to the gate.
- If an axis was scored **N/A**, keep its heading and the N/A justification line
  rather than dropping it (and keep the re-weighted total line /ship produced).
- **No AI-authorship trailer** (no "Generated with Claude Code" line) — this
  repo's convention, and the project may strip it anyway.
- Since only a PASSing gate reaches this step, the Gate line reads `PASS`.

## 8. Fail path (gate FAILED — do not ship)

Do **NOT** commit, push, or open a PR. Leave the work on the task branch exactly
as-is so a human can inspect it, and STOP. Report the failing axis and what it
needs. Because no merge happened, the target branch's `HEAD` did not advance, so
the loop runner registers no progress and halts instead of stacking more work.

## 9. Report

Print: the confidence gate result; if shipped, the **PR number/URL** and the
squash-merge **commit `hash — subject`** now on the target branch; if failed, the
failing axis. End with how many roadmap/backlog tasks remain.
