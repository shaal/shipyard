# /ship

A [Claude Code](https://claude.com/claude-code) skill that completes and ships a task end-to-end, with a **confidence gate** before commit. Part of [shipyard](https://github.com/shaal/shipyard).

## What it does

When invoked (`/ship`, or "ship the next task"), it runs four phases in strict order:

1. **Complete the next task** — from a task document or a [beads](https://github.com/steveyegge/beads) (`br` / `beads_rust`) backlog.
2. **Confidence check (4-axis rubric)** — score the change on four 0–25 axes: **Requirements Fit**, **Functional Robustness**, **Verification Evidence**, **System Safety & Integration**. Each axis demands concrete, *executed* evidence — not "I read the code." Total must be **≥95 with no axis below 15**, no rounding. Iterate until it passes. Optionally escalate to an external Grok second opinion when confidence stalls on genuine uncertainty.
3. **Update documentation** — only what actually changed or was learned.
4. **Commit** — via the project's `/commit` skill if present, else a plain `git` commit. Does not push unless asked.

The confidence gate is the point: an honest 78% that leads to fixing three gaps is the value.

## Install

Easiest — via the shipyard bundle (also installs `/ship-next` and the `shipyard` loop CLI):

```bash
npm install -g @shaal/shipyard
shipyard init
```

Or install just this skill manually:

- **User-level** (all projects): copy this `ship/` folder to `~/.claude/skills/ship/`.
- **Project-level** (shared with collaborators): copy it to `<your-repo>/.claude/skills/ship/` and commit it.

The folder name (`ship`) must match the `name:` field in `SKILL.md` frontmatter — that's what Claude Code uses to load and invoke the skill.

## Unattended use

`/ship` pauses in Phase 4 for a human "go ahead" before committing. To run it autonomously in a loop, use **`/ship-next`** (which skips that pause) under the **`shipyard`** CLI. See the [shipyard README](https://github.com/shaal/shipyard).

## License

[MIT](../../../LICENSE) © Ofer Shaal
