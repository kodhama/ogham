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

**2026-10-11 decision: the rubric grades what a diff changes.** That is the
lines it adds or edits, and code a deletion leaves in breach, such as a
removed marker or exception comment. Code the diff leaves as it was is not a
finding. The plan gives adoption its own answer for existing violations (plan
U9), and a reviewer who grades the whole file on every diff buries the change
under old findings. The reviewer may read as much surrounding code as a check
needs.

**2026-10-11 decision: lint did not pass code it was told to skip.** The
rubric lets the reviewer trust lint for what lint sees. A disable comment
takes a line out of that, and a suppressions file (plan KTD9) or a config
change takes a whole file out for the rule it names: suppressions count
breaches per file and rule, so a new breach can replace an old one unseen.
Where the reviewer cannot tell whether lint ran, it checks everything.

**2026-10-11 decision: a function that says it mutates and lacks a marker is
cited as `og-mark-effects`.** The name or the doc line shows the intent, and
the missing marker is the breach. A write in a function that says nothing of
the kind is cited under the rule the write breaks. A mutable type alone does
not show intent: a write to a parameter only compiles where the type allows
it. An effect in a function that also decides is cited as `og-thin-effects`.
One breach gets one finding.

**2026-10-11 decision: the rubric does not grade "read-only by default" on
its own.** The core's marker rule is about a function that mutates or causes
an effect, and says in passing that data and parameters are read-only by
default. A mutable type on code that changes nothing is not a finding here.
Turned down for now: making it one, which would flag every unmarked parameter
in an adopting repo on the strength of a parenthesis. The maintainer can rule
otherwise.

**2026-10-11 decision: two lines of the rubric are derived, not quoted.**
"Reading a constant is fine" under `og-pure-by-default` follows from
`og-no-module-state`, which bars only mutable module state. The check for
`og-local-building` flags a write made after the value could be seen from
outside, which is the limit the core's "while nothing outside can see it yet"
sets.

**2026-10-11 decision: the edge's own read is not an exception, and the
reviewer checks only that it is the edge.** Lint cannot tell the edge from
logic, so it reports the one read that follows `og-no-hidden-inputs`, and the
line carries a disable comment saying that this is the edge. The core asks for
a three-part comment "where a rule cannot hold", which does not describe this
case, so the rubric does not ask for the three parts here and makes no finding
of the comment's form. It checks the claim: the read sits at the program's edge, in a
function that makes no decisions and passes the value into logic. Where the
comment claims the edge and the function also decides, the read is a finding
under `og-no-hidden-inputs`. A complete exception comment is a different
case and still covers its breach. The TypeScript page
shows a comment in the usual shape as the form to copy. Turned down: holding
the edge comment to the three parts, which would be a finding with no core
rule behind it; and a new core rule for it, which needs the maintainer and
more than the two words of budget the core has left.

**2026-10-11 decision: the rubric sets no severity.** How findings are ranked,
and whether one blocks a merge, is the repo's choice: the companion supplies
criteria and the repo's loop reviews (plan R16).

**2026-10-11 decision: two style checks under `og-functions-as-values` are
marked as judgment.** "Pass a function where that removes duplication" and
"name a long function" have no line a reviewer can point to, so the rubric
says to raise them only when the gain is plain. The third clause, a passed
function that writes to what it captured, is a plain check.
