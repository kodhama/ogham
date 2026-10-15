---
type: decision
title: "Hook-in blocks and the local layer"
description: The choices made while building the blocks ogham places in AGENTS.md, CLAUDE.md and CODING_STANDARDS.md, and the seeded ogham.local.md, that the plan left open.
decided: 2026-10-15
ticket: KOD-5
---

# Hook-in blocks and the local layer

**These are the worker's choices from building the hook-in (plan U7), each
open to the maintainer's overrule when he reads it.** The plan's KTD2 (D20)
fixed the frame: the agents block carries the core inline once, the Claude
block holds imports and pointers only, the reviewer block goes only into an
existing `CODING_STANDARDS.md`, and broken markers stop the run.

**2026-10-15 decision: templates hold each block's body; the code adds the
markers.** `templates/` sits beside `standard/` and is never vendored. Each
block template is the text between the markers, with two placeholders:
`{{core}}` (the vendored core's text, put in as is) and `{{languages}}` (one
pointer line per language page the repo got). The code wraps the body as
`<!-- ogham:begin -->`, a blank line, the body, a blank line,
`<!-- ogham:end -->`, so no template can leave a marker out.
`templates/CLAUDE.md` and `templates/ogham.local.md` are written as they are.

**2026-10-15 decision: the agents block puts the core first.** The block
opens with the core inside `prettier-ignore-start`/`end`, then a short
section pointing to the language pages, the rubric and `ogham.local.md`, and
ends with `@ogham.local.md` on a line of its own, so an agent that follows
imports loads the local layer and no punctuation joins the path. The core
leads because it is what an agent that stops reading early most needs.

**2026-10-15 decision: the lock pins blocks by file, and lists the files the
adoption created.** The lock gains `blocks`, one sha256 per file that holds a
block, taken over the block's lines from its begin marker to its end marker,
joined with line feeds, so line endings and what follows the block do not
count. `added.files` lists the files install created outside `.ogham/`
(`AGENTS.md`, `CLAUDE.md`), which `remove` may delete. `ogham.local.md` is
not listed: `remove` keeps it. A lock without these two fields is not read;
no version has been released, so there is nothing to migrate.

**2026-10-15 decision: a block goes at the end, after one blank line, in the
file's own style, and `remove` takes exactly that back out.** A block is
appended after a blank line (none in an empty file), with the file's line
break, Windows or not; a file that ended without a line break still does.
`update` replaces a block where it stands, wherever the repo has moved it.
`remove` takes out the block and the blank line before it, which gives back
the file's bytes as they were. In a file with Windows line breaks, the inline
core has them too, so it matches the vendored core except for line endings;
the hashes, normalised to line feeds, match exactly.

**2026-10-15 decision: what counts as a marker.** A marker is a whole line,
spaces around it allowed. Any line shaped `<!-- name:begin ... -->` or
`<!-- name:end -->` is another tool's marker (Trellis writes
`<!-- trellis:begin (managed by trellis …) -->`). A marker inside a fenced
code block is text, so a repo that documents the markers is not stopped.
These stop `install`, `update` and `remove`, and are `check` failures, each
named with its file and line: a second ogham begin, a begin with no end, an
end with no begin, and an ogham begin inside another tool's block. Where a
block would be appended and another tool's block is still open at the end of
the file, the run stops too, since the block would land inside it.

**2026-10-15 decision: a created `CLAUDE.md` records its import as an added
line.** `install` records the `@AGENTS.md` line of a `CLAUDE.md` it created
as a line it inserted, and the file as one it created. `remove` takes the
line out, as KTD4 says of every inserted line, and deletes the file when
nothing but blank lines is left. Trade-off: where the repo has since written
its own text into both `CLAUDE.md` and `AGENTS.md`, `remove` still takes the
import out, so that `CLAUDE.md` stops loading `AGENTS.md`; the printed diff
shows it. The alternative, keeping the line while `AGENTS.md` survives, was
turned down as a second rule for one line. An existing `CLAUDE.md` is seen
to import `AGENTS.md` when it holds `@AGENTS.md` or `@./AGENTS.md` standing
on its own, not inside code.

**2026-10-15 decision: a created file is deleted only when blank.** After the
block and the recorded lines come out, a file in `added.files` that holds
nothing but whitespace is deleted. Any other text keeps it, minus ogham's
parts.

**2026-10-15 decision: a block is read-only, as an owned file is.** An
edited or deleted block stops `update`, which shows the edit against the last
commit whose copy of the file held the pinned block. `--force` puts the block
back, and reports what it discarded. Where the file itself is gone, `--force`
recreates `AGENTS.md`, and stops pinning a block in a gone `CLAUDE.md` or
`CODING_STANDARDS.md`, since ogham never creates the second and creates the
first only as the import line.

**2026-10-15 decision: `update` places blocks where a file has come to call
for one, and creates nothing.** It rewrites the blocks there are, adds the
reviewer block to a `CODING_STANDARDS.md` that appeared since, and the
Claude block to a `CLAUDE.md` that appeared since without the import. It
never creates `CLAUDE.md` or `ogham.local.md`; only `install` does.

**2026-10-15 decision: the size warning names the byte where the end marker
ends.** The offset counts UTF-8 bytes up to the end of the end-marker line,
without its line break, and warns when it passes 32,768. `install`, `update`
(also when it has nothing to write) and `check` print it; it never changes an
exit code. The vendored check prints it to standard error. The warning names
no agent, so the shipped text stays portable.

**2026-10-15 decision: how the local layer is checked.** Every `og-` ID
anywhere in `ogham.local.md` must be one the vendored core defines, each
unknown one named once, at the first line that cites it; without a vendored
core the IDs are not judged, since the missing core is already reported. A
`local-` rule is defined by a top-level bullet that opens with its ID in bold,
with or without backticks, as the core writes its own; one inside a fenced
code block is an example, and each later definition of the same ID fails.
The template shows the formats with placeholders (`og-<id>`, `local-<slug>`),
which match neither pattern.

**2026-10-15 decision: Prettier joins as a development dependency** (see
`dependency-adoption.md`), so the test that Prettier leaves every block's
hash unchanged runs Prettier itself rather than trusting the ignore markers.

**Known limits.** A `CLAUDE.md` that is a symbolic link to `AGENTS.md` makes
`install` fail and roll back, under the rule that ogham writes no file through
a link (`bootstrap-shape.md`). Where ogham would write a `CLAUDE.md` or
`AGENTS.md` that git ignores, it refuses, as for any path it writes. Both
leave the repo as it was.
