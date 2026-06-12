---
description: Ship the next backlog/roadmap task unattended — run /ship on it and commit locally (no push). One task per invocation; designed to be looped by shipyard.
---

You are an **unattended single-task driver**. Complete exactly **one** task
end-to-end with the `/ship` skill, then commit it — **without pausing for
acknowledgment**, because no human is watching. This command is meant to be
looped by the `shipyard` runner (one invocation = one task = one commit).

Generic by design: it works for a beads project or a markdown-roadmap project.
A project may override this with its own `.claude/commands/ship-next.md`.

## 1. Refuse to start on a dirty tree

Run `git status --short`. If there are **uncommitted tracked changes**, STOP and
report them — do **not** stash or commit them blindly. Each task must land as its
own clean commit. (Untracked build output / ignored files are fine.)

## 2. Find the next task

- **Beads project** (`bd ready` succeeds): run `bd ready --json` and take the
  highest-priority unblocked item. If empty → STOP, say "backlog empty".
- **Otherwise** (roadmap/checklist project): find the project's task checklist —
  a tracked markdown file with `- [ ]` task checkboxes (e.g. `EDGENET.md`,
  `ROADMAP.md`, `TASKS.md`, or one the project's `CLAUDE.md`/`AGENTS.md` points
  to). Take the **first unchecked `- [ ]`** task in document order. Honor any
  `depends:`/ordering notes — never skip ahead to a task with unmet
  dependencies. If every task is checked → STOP, say "roadmap complete".

State which task you picked in one line before starting.

## 3. Run /ship on that task — UNATTENDED

Invoke the `/ship` skill for the chosen task, with **one override**:
/ship's Phase 4 normally **holds for a human "go ahead"** before committing.
There is no human here, so **skip that hold** — but nothing else:

- Phases 1–3 are unchanged: complete the work, score the four-axis confidence
  gate **honestly** (do not inflate to force a commit), and update docs.
- **Phase 4:**
  - Gate **PASS** (total ≥95 **and** no axis <15) → commit immediately. One task;
    stage **specific files** (never `-A`/`.`); concise Conventional-Commits
    message focused on the *why*; **no AI-authorship trailers**.
  - Gate **FAIL** → do **NOT** commit. STOP and report the failing axis and what
    it needs. Leave the working tree exactly as-is, so the loop sees no new commit
    and halts instead of stacking work on a dirty tree.

## 3a. Adversarial verification (this is a MAX-QUALITY loop)

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
  regressions in the existing 2D dome / 3D view. Scale with risk — **1** reviewer
  for a small change, **2–3 with distinct lenses** (correctness · robustness/edges
  · spec-&-ADR-fit) for a hard or load-bearing task. Each returns concrete
  findings or a precise "tried X/Y/Z, found nothing."
- **Treat findings as blocking.** Fix every real issue they surface, then
  **re-verify** (re-run tests + a fresh refute pass). Only when reviewers can no
  longer break it AND the four-axis gate is *honestly* ≥95 (no axis <15) does it
  commit. **Do not** shortcut or inflate the gate to save time — quality is the
  whole point of this loop; iterate as long as honest progress continues.
- If it genuinely cannot reach ≥95 after real iteration, take the step-3 **FAIL**
  path (stop, don't commit, report) rather than shipping weak work.

## 4. Do NOT push

Commit **locally only** — no `git push`, no PR. The loop runner (`shipyard`)
detects the new local commit (HEAD advanced) as progress and starts the next
iteration. If a task genuinely needs pushing, that's a separate, explicit step.

## 5. Report

Print: the confidence gate result, the commit `hash — subject`, and how many
roadmap/backlog tasks remain.
