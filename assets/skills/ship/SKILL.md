---
name: ship
description: >-
  Complete the next task end-to-end with a confidence gate before shipping.
  Runs four phases in strict order: (1) complete the next task from a doc or
  beads backlog, (2) self-report confidence 0-100% and iterate until ≥95%,
  optionally escalating to an external Grok second opinion (user relays the
  prompt + response) when confidence stalls, (3) update any documentation
  learned this session, (4) commit. Use when the user says "ship the next
  task", "/ship", "finish the next one", or asks to run their standard
  completion workflow.
---

# Ship Task

End-to-end workflow for completing a task with a quality gate before commit. The user invokes this deliberately — follow the phases in order, do not skip, do not reorder.

## Core principle

**The confidence gate is the whole point.** Do not let "this is a small change" collapse Phase 2 into a single self-congratulatory sentence. An honest 78% that leads to fixing three gaps is the value this skill delivers.

---

## Phase 1 — Complete the next task

Identify the task source. Ask the user if ambiguous:

- **Task document** — a markdown/spec file the user has referenced or has open
- **Beads backlog** — if the project uses beads (`br` / `beads_rust`), run `br ready` to see ready tasks, then `br show <id>` for details

If neither is obvious, ask: *"Which task should I work on — something from a doc, or the next ready item in beads?"*

Once the task is identified:
- Restate the task in one sentence so the user can confirm you've understood it
- Complete the work using your normal engineering discipline (read before editing, test where practical, follow existing patterns)
- Do **not** move to Phase 2 until you believe the task is functionally done

---

## Phase 2 — Confidence check (loop until ≥95%)

Confidence is **not a gut number**. It's the arithmetic sum of four 0–25 axes, each scored against concrete evidence. The structure is the whole point: it forces gaps to be named instead of hand-waved.

### The four axes

Each axis is scored 0–25. Total 0–100. Gate: **≥95 AND no axis below 15.**

1. **Requirements Fit** (0–25) — Does the change *exactly* solve the task as specified? Scope, success criteria, acceptance conditions all met. No tangents, no omissions, no "elegant solution to the wrong problem."

2. **Functional Robustness** (0–25) — Happy path AND relevant edge cases / failure modes / boundaries / concurrency / state transitions behave as expected. Crashes, retries, reconnects, race conditions, partial-failure handling all considered.

3. **Verification Evidence** (0–25) — Claims are *proven* by executed tests, probes, logs, headless-browser runs, or real-environment checks — not asserted by code inspection. "I read the code and it looks right" is not evidence.

4. **System Safety & Integration** (0–25) — Verified against *real* dependencies (no mocks-only). Blast radius assessed. Reversible. No regressions in other services/pages. Observability hooks where needed.

### Per-axis scoring anchors

Quote these to yourself before assigning a number:

- **20–25**: Exhaustive evidence. Real integration / staging runs, fuzz or property tests where applicable, full coverage of the edges named in the task, blast radius explicitly measured or proven negligible.
- **12–19**: Solid but with gaps. Unit tests + one manual probe; some edges reasoned but not exercised; one dep still mocked.
- **5–11**: Mostly inspection plus happy-path tests. Some real verification, clearly incomplete.
- **0–4**: Hand-wavy. No real evidence.

### Required output format

Output exactly this shape, every time:

> **Phase 2 — Confidence Gate**
>
> **1. Requirements Fit: X/25**
> - Evidence:
>   - [concrete action — e.g. "task spec said 'render UFC + MLB filter pills'; both rendered, screenshot at /tmp/...png"]
>   - [concrete action]
> - To honestly score 25 I would need to: [one concrete piece of work, or "already at 25"]
> - Self-critique: [one sentence on what could still be wrong]
>
> **2. Functional Robustness: X/25**
> - Evidence: [...]
> - To honestly score 25 I would need to: [...]
> - Self-critique: [...]
>
> **3. Verification Evidence: X/25**
> - Evidence: [...]
> - To honestly score 25 I would need to: [...]
> - Self-critique: [...]
>
> **4. System Safety & Integration: X/25**
> - Evidence: [...]
> - To honestly score 25 I would need to: [...]
> - Self-critique: [...]
>
> **Total: X/100. Gate (≥95 AND no axis <15): [PASS / FAIL]**
>
> If PASS: "I am ready to commit."
> If FAIL: "Addressing [specific axis] before re-scoring."

### Discipline rules

- **Total is the strict arithmetic sum.** No rounding up. 23+24+24+24 = 95, passes. 23+24+24+23 = 94, fails — go fix something.
- **Per-axis floor: any axis <15 fails the gate even if total ≥95.** Stops the "compensate one weak axis with three strong ones" pattern. A 25/25/25/20 = 95 passes; a 25/25/25/14 = 89 fails for both reasons.
- **Any axis <20 in a passing score requires a one-paragraph justification** of why that gap is acceptable for this specific task.
- **Evidence must be concrete actions taken, not claims.** "Tested the function" is not evidence. "`mix test test/foo_test.exs:42` → 12 assertions green" is evidence.
- **Iterate, don't inflate.** If gate fails, do the work named in the lowest-scoring axis's "to honestly score 25" line, then re-score from scratch. Don't bump numbers without new evidence.

### Non-applicable axes

Some tasks legitimately have no surface for one or more axes (e.g. a pure rename refactor has no new "Requirements Fit" surface beyond "the rename is consistent"; a docs-only change has no "System Safety & Integration").

**Do not score N/A axes 25/25 by default — that rubber-stamps them.** Instead:

> "Axis [N] is N/A for this task because [one-sentence justification]. Re-weighting remaining axes to ~33.3% each (or 50% each if two are N/A). Gate: ≥95 of the re-weighted total, AND no remaining axis below 15."

The re-weighted total is still on a 100-point scale (each remaining axis × the new per-axis maximum). Two N/A axes max out at 50/50; one N/A axis max at 33/33/33+1 → cap at 100. Math stays simple; the *justification* is the work.

### Optional escalation — Grok second opinion

If confidence stalls (e.g., you've iterated once or twice and can't honestly cross 95%) and the remaining gaps are the *kind* that benefit from an outside perspective, you may ask the user to relay a query to Grok.

**When to escalate to Grok (all should apply):**
- Confidence is stuck below 95% *not* because of missing tests or obvious gaps you can fix yourself, but because of genuine uncertainty about correctness, design, or edge cases
- The question is one another model could meaningfully weigh in on — e.g., "is this algorithm correct?", "is this API design sensible?", "am I missing a failure mode?", "is this migration safe under concurrent writes?"
- You have a **specific** question, not a vague "review this"

**When NOT to escalate:**
- You just need to write more tests or read more code — do that yourself
- The task is small or low-stakes — the paste-in/paste-out cost isn't worth it
- You've already consulted Grok once this session and incorporated the feedback — don't loop

**How to escalate:**

Tell the user: *"I'd like a second opinion from Grok on [specific concern]. Here's the prompt to paste — let me know what Grok says."*

Then output the prompt inside a fenced code block, formatted so the user can copy it verbatim:

````
```
I'm reviewing code written by another AI assistant and want an independent second opinion on a specific concern.

**Goal of the change:** <one-sentence description of what the task is trying to accomplish>

**What was built:** <concise summary — key functions, data flow, or decisions>

**Specific concern I want you to evaluate:** <the exact question — e.g., "Is the locking strategy in `acquire_lease()` safe under concurrent callers on the same key?">

**Relevant code:**
```<language>
<only the snippets directly relevant to the concern — trim aggressively>
```

**What I've already considered:** <the reasoning you've already done, so Grok doesn't re-tread it>

Please give me: (1) your verdict on the specific concern, (2) any failure modes or edge cases I haven't listed, (3) anything you'd change and why. Be direct — I want disagreement, not validation.
```
````

**After the user pastes Grok's response:**

1. Read it critically. Grok is fallible — don't capitulate to authority. For each point Grok raises:
   - If it identifies a real gap or failure mode → address it in the code, then note the fix
   - If it's misguided or based on a misreading → state your counter-argument explicitly (e.g., "Grok suggested X, but that doesn't apply here because Y — keeping the current approach")
2. Briefly tell the user what you incorporated vs. what you pushed back on, and why
3. Re-state confidence with the new information

If a second Grok round is genuinely needed, it's allowed — but if you're about to escalate a third time, stop and ask the user whether the requirement itself needs clarification instead.

---

**Do not proceed to Phase 3 until confidence is ≥95% and the user has seen the final number.**

If you can't credibly get to 95% (e.g., the requirement is genuinely ambiguous, or the test environment is unavailable), stop and tell the user exactly why — don't inflate the number to clear the gate.

---

## Phase 3 — Update documentation

Review what was learned or changed this session and update anything that's now stale or incomplete. Candidates:

- **README.md** — if user-facing behavior, setup, or commands changed
- **CLAUDE.md / AGENTS.md** — if conventions, gotchas, or workflows were clarified. Edit the *narrowest* file that covers the change (per-service / per-package over the repo root); only touch the root file if the lesson is genuinely cross-cutting policy. Nested CLAUDE.md/AGENTS.md auto-load when work touches their subtree, so root edits about service-specific details just rot.
- **Inline comments** — only where logic is non-obvious (do not add comments to self-evident code)
- **Beads task notes** — if using beads, `br update <id>` to reflect outcome/decisions
- **Spec or design doc** — if the task referenced one and the implementation diverged

**Rule:** only update docs where something genuinely changed or a non-obvious lesson was learned. Do not create new docs unless clearly warranted. No speculative documentation.

Briefly tell the user what you updated (or "nothing needed updating, because...").

---

## Phase 4 — Commit

Invoke the `/commit` skill (or the project's equivalent commit workflow). Let that skill handle staging, message format, and hook handling — do not reimplement it here.

If the project doesn't have a `/commit` skill configured, fall back to:
- `git status` and `git diff` to review
- Stage specific files (not `-A` / `.`)
- Write a concise message focused on the *why*
- Create the commit
- Verify with `git status`

Do **not** push unless the user explicitly asks.

---

## Anti-patterns to avoid

- Reporting "99% confident" on the first attempt for a non-trivial change — that's a tell that you didn't actually introspect
- Skipping Phase 2 because "the change is small" — small changes are where confidence checks catch the silly mistakes
- Scoring four 24s by default — the rubric is meant to *find* the weak axis, not produce a flat ribbon. If your first pass is 24/24/24/24, you skipped the introspection. Re-score with the per-axis evidence requirements taken seriously.
- Marking an axis N/A to dodge it. N/A means "this task literally has no surface for this axis" (e.g. docs-only change for "Functional Robustness"), not "I didn't bother to verify."
- Confusing claims with evidence. "I checked the edge case" is a claim. "Ran `bd show qh-XX` to confirm acceptance criteria; ran the LiveView test asserting the empty-list path; manually clicked the button in dev-browser and screenshotted the empty state at /tmp/foo.png" is evidence.
- Updating docs in Phase 3 that weren't affected by this session — keep the diff tight
- Running Phase 4 before the user has acknowledged the confidence gate result
