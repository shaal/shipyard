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
2. Confirm the remote and GitHub CLI are usable: `git remote get-url origin` must
   succeed, and `gh auth status` must show you authenticated. If either fails,
   STOP and report exactly what's missing — do **not** fall back to a local-only
   commit, because the loop expects the target branch to advance via a merge.

## 1. Refuse to start on a dirty tree

Run `git status --short`. If there are **uncommitted tracked changes**, STOP and
report them — do **not** stash or commit them blindly. (Untracked build output /
ignored files are fine.)

## 2. Sync the target branch

Make sure TARGET is current before branching off it, so the PR diff is clean:
`git fetch origin`, then if TARGET has an upstream, `git pull --ff-only`. If the
fast-forward fails (TARGET and its remote have diverged), STOP and report — don't
force or merge to paper over it.

## 3. Find the next task

- **Beads project** (`bd ready` succeeds): run `bd ready --json` and take the
  highest-priority unblocked item. If empty → STOP, say "backlog empty".
- **Otherwise** (roadmap/checklist project): find the project's task checklist —
  a tracked markdown file with `- [ ]` task checkboxes (e.g. `EDGENET.md`,
  `ROADMAP.md`, `TASKS.md`, or one the project's `CLAUDE.md`/`AGENTS.md` points
  to). Take the **first unchecked `- [ ]`** task in document order. Honor any
  `depends:`/ordering notes — never skip ahead to a task with unmet
  dependencies. If every task is checked → STOP, say "roadmap complete".

State which task you picked in one line before starting.

## 4. Cut a task branch off the target

Create and switch to a fresh branch for this task, based on the now-current
TARGET: `git switch -c ship/<slug>` where `<slug>` is the beads id (e.g.
`ship/qh-42`) or a short kebab-case slug of the task title. If that branch name
already exists, append a short disambiguator. All of the work and the commit for
this task happen on this branch — never directly on TARGET.

## 5. Run /ship on that task — UNATTENDED

Invoke the `/ship` skill for the chosen task, with **two overrides**:
/ship's Phase 4 normally **holds for a human "go ahead"** and **does not push**.
There is no human here and we ship via PR, so change *only* those two things —
nothing else:

- Phases 1–3 are unchanged: complete the work, score the four-axis confidence
  gate **honestly** (do not inflate to force a ship), and update docs.
- **Phase 4 (commit) becomes commit-on-the-task-branch:**
  - Gate **PASS** (total ≥95 **and** no axis <15) → commit immediately to the
    task branch. One task; stage **specific files** (never `-A`/`.`); concise
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
