# AGENTS.md — Agent Operating Instructions

**This file is the tool-neutral instruction set for ogham.** Claude Code reads
it through the `@AGENTS.md` import atop `CLAUDE.md`; every other agent reads
it directly.

Ogham carries coding standards into other repos: a pinned standard (a short
core plus per-language pages), a lint preset where the language has one, and
a review rubric, installed by one bootstrap step. It is a sibling of Trellis,
which carries conduct, and grove, which supervises; ogham does neither.

## Workflow

**Compound Engineering (CE) is the default route for planned work**: reach
for the CE skill whose description fits before hand-building what it already
does (`ce-brainstorm`, `ce-plan`, `ce-work`, `ce-debug`, `ce-doc-review`).
Plans live in `docs/plans/`. If a skill is absent, do not hand-roll a
stand-in: say in your hand-back that it was unavailable and that step did not
run.

**Trellis** rules arrive at session start via the trellis plugin
(hook-driven); `.trellis/rules.toml` selects which are active, and its rows
govern. The rules live in the plugin, not here.

**The plugins are declared for both hosts** (`.claude/settings.json`,
`.codex/config.toml`) but must be installed on the machine before a session
sees them. **A Codex contributor registers the marketplaces once**, at user
level in `~/.codex/config.toml`:

```toml
[marketplaces.compound-engineering-plugin]
source_type = "git"
source = "https://github.com/EveryInc/compound-engineering-plugin.git"

[marketplaces.kodhama]
source_type = "git"
source = "https://github.com/kodhama/stewards.git"

[marketplaces.grove]
source_type = "git"
source = "https://github.com/kodhama/grove.git"
```

**Write for a reader with ADD.** Applies to anything the maintainer reads:
chat, reports, PRs, issues and comments.

- First line = the point, and what the maintainer needs to do (if anything).
- Short paragraphs, one idea each. Bullets for several items. Bold the key phrase.
- One question at a time, recommendation first.

## What ships is portable

Everything ogham vendors into another repo travels to other harnesses and
machines. **Keep shipped text free of this repo's paths, tracker names and
harness-specific invocations.** A shipped rule must read the same in a local
session and a cloud session.

## Review loop

**Review runs before the PR, always, sized by scope**: every change gets an
in-session review on the branch before a PR opens. The native single-pass
reviewer (`/code-review` in Claude Code) is the floor; bigger scope escalates
to `ce-code-review` (report-only), and plans to `ce-doc-review`. **The author
never rules its own work correct**: an independent reviewer (a fresh session,
or another model such as Codex) checks it and returns findings, which the
author triages against the source.

## Where work lives

**Linear tracks the work (`KOD-*`, Kodhama team, `Forge` label for this
product's forge); GitHub hosts the code**, its pull requests and CI.

**A comment an agent writes ends by saying so**: last line, own paragraph, as
literal plain text: `— Posted by <your tool name> (agent session) on behalf
of @<maintainer-handle>.` Comments only: a PR body is covered by its branch and
`Fixes KOD-<n>` line, commits by `Co-authored-by`.

## Decisions

Decision records live in `docs/decisions/<slug>.md` with frontmatter
(`type: decision`, `title`, `description`, `decided`, `ticket`). Records are
append-only: a change is a dated entry inside the record, never an edit to
an earlier one. Product rulings made before this repo existed live in the
maintainer's records and are cited from the plan.

## Branch, commit, and PR rules

- **Branch `feature/kod-<n>-<slug>`**, the shape Linear generates.
- **Put `Fixes KOD-<n>` in the PR body** (or `Part of KOD-<n>` when the PR is
  one of several for the issue).
- Conventional Commits; linear history (rebase-merge or squash with a
  hand-edited message).
- **Every change reaches `main` through a PR.**
- **The maintainer approves every merge**; an agent never merges.
- Code changes are test-first: failing test, then implementation, then green.
- Keep diffs reviewable from a phone: small, focused, well-described.

## What you must NOT do

- Do not invent requirements or broaden focused work: requirements are
  measured against the plan and the issue you were given.
- Do not add a dependency without recording the decision under
  `docs/decisions/`.
- Do not commit a secret, a token, a real home path or personal data. Fixtures
  use obvious placeholders such as `/Users/maintainer`.
