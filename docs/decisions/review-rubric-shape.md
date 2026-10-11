---
type: decision
title: "Review rubric shape"
description: The choices made while writing the review rubric that the plan left open.
decided: 2026-10-11
ticket: KOD-5
---

# Review rubric shape

**These are the worker's choices from writing the rubric (plan U4), each open
to the maintainer's overrule when he reads it.**

**2026-10-11 decision: a check's lint line is language-neutral.** It says what
kind of thing lint reports and what it cannot see; the language page names the
lint rules. A repo with no preset gets the same rubric (plan R11). Turned
down: naming the `ogham/*` rules in each check, which would repeat the
TypeScript page's lint table and go stale with it. A test holds each lint line
to the core's "Checked by" line: `none` exactly where the core names no lint.

**2026-10-11 decision: a finding cites the rule that is broken.**
`og-reasoned-exceptions` is cited only when the exception or exemption itself
is what is wrong: a missing part, an untrue part, or a loosening with no
entry. Turned down: citing `og-reasoned-exceptions` for every unmarked breach,
which would hide which rule the code broke.

**2026-10-11 decision: a breach that a complete exception covers is not a
finding.** The reviewer accepts it (plan AE2). The finding format's fourth
field, `Exemption`, is `none`, or the comment or `ogham.local.md` entry that
claims to cover the breach and why it does not.

**2026-10-11 decision: the rubric grades the lines a diff adds or changes.**
Code the diff does not touch is not a finding. The plan gives adoption its own
answer for existing violations (plan U9), and a reviewer who grades the whole
file on every diff buries the change under old findings.

**2026-10-11 decision: the edge's own read is not an exception.** Lint cannot
tell the edge from logic, so it reports the one read that follows
`og-no-hidden-inputs`. Its disable comment keeps three parts, and the third
says that this is the edge, where an exception would say why the rule cannot
hold. The reviewer checks the claim: a read in logic that calls itself the
edge is a finding. The TypeScript page shows the comment. The core is
unchanged: its "where a rule cannot hold" does not describe this case, and it
has two words of budget left.

**2026-10-11 decision: the rubric sets no severity.** How findings are ranked,
and whether one blocks a merge, is the repo's choice: the companion supplies
criteria and the repo's loop reviews (plan R16).

**2026-10-11 decision: two style checks under `og-functions-as-values` are
marked as judgment.** "Pass a function where that removes duplication" and
"name a long function" have no line a reviewer can point to, so the rubric
says to raise them only when the gain is plain. The third clause, a passed
function that writes to what it captured, is a plain check.
