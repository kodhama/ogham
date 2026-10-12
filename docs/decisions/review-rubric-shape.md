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
is what is wrong: a missing part, an untrue part, a loosening with no entry,
or a marked mutator's missing comment where lint reports the line. Turned
down: citing `og-reasoned-exceptions` for every unmarked breach, which would
hide which rule the code broke.

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

**2026-10-11 decision: the reviewer grades the line first, then the
function.** Two core rules are about what one line does: `og-no-hidden-inputs`
(a read) and `og-return-new-values` (a write). A line that breaks one of them,
with no exception or exemption claimed for it, is one finding under that rule,
and the function is not graded for that line. A line whose claimed exception
is incomplete is one finding under `og-reasoned-exceptions`, and the function
is not graded for it either. A line that is allowed (it
follows its rule, its function says by name or doc line that it mutates, or a
complete exception or an exemption covers it) sends the reviewer to the
function: its markers (`og-mark-effects`) and whether it also decides
(`og-thin-effects`), each its own finding. So an exception or exemption covers
the one rule it names, and the function still owes the rest: a covered write
in an unmarked function is cited as `og-mark-effects`, and a covered clock
read in a function that decides is cited as `og-thin-effects`. A mutable type
alone does not show that a function means to mutate: a write to a parameter
only compiles where the type allows it. Turned down: a sentence per pair of
rules saying which one wins. Three review rounds each found a pair, or a pair
under an exemption, that the sentences answered two ways.

**2026-10-11 decision: a plain exception comment goes wherever lint does not
report the line.** The core splits on the line: "where lint reports the line,
that comment is the lint disable". So a breach of a linted rule in a spelling
lint cannot see takes the plain comment too. The rubric and the TypeScript
page now say so. The earlier record on the core's shape says "where only the
reviewer checks the rule", which is the narrower case of the same thing.

**2026-10-11 decision: the rubric does not grade "read-only by default" on
its own.** The core's marker rule is about a function that mutates or causes
an effect, and says in passing that data and parameters are read-only by
default. A mutable type on code that changes nothing is not a finding here.
Turned down for now: making it one, which would flag every unmarked parameter
in an adopting repo on the strength of a parenthesis. The maintainer can rule
otherwise.

**2026-10-11 decision: two lines of the rubric are derived, not quoted.**
"Reading a constant fixed in the source is fine" under `og-pure-by-default`
follows from `og-no-module-state`, which bars only mutable module state. A
constant filled from the environment, the clock or storage is a hidden input
by another name, and `og-no-hidden-inputs` still grades the read. The check for
`og-local-building` flags a write made after the value could be seen from
outside, which is the limit the core's "while nothing outside can see it yet"
sets.

**2026-10-11 decision: the edge's own read is not an exception, and the
reviewer grades the read, not its comment.** Lint cannot tell the edge from
logic, so it reports the one read that follows `og-no-hidden-inputs`, and the
line carries a disable comment saying that this is the edge. The core asks for
a three-part comment "where a rule cannot hold", which does not describe this
case, so the rubric makes no finding of the comment's form. It grades the read
by the `og-no-hidden-inputs` check alone: a read that follows the rule is not
a finding whatever lint says, and one that does not is a finding under that
rule, since saying that this is the edge is no exception. The function holding
the read is then graded like any other, for its markers and for deciding. A
complete exception comment is a different case and still covers its breach.
The TypeScript page shows a comment in the usual shape as the form to copy.
Turned down: holding the edge comment to the three parts, which would be a
finding with no core rule behind it; a new core rule for it, which needs the
maintainer and more than the two words of budget the core has left; and
conditions of the bullet's own (where the read sits, and that its function
decides nothing), which an earlier draft stated beside the check. They gave an
edge function that also decides a second rule ID, and an IO function stamping
its own log line a finding the core does not back.

**2026-10-11 decision: the rubric does not give every code shape one rule
ID.** The core's rules overlap, so one line can break two of them. A callback
that writes to its enclosing function's parameter breaks
`og-functions-as-values` and `og-return-new-values`. A clock read in logic
under a comment in the exception's shape, whose reason wrongly says this is
the edge, breaks `og-no-hidden-inputs` and `og-reasoned-exceptions`. A write
through a store the function was handed reads as an effect, graded on the
function, or as a call that changes a handed value in place
(`og-return-new-values`). The
line-first rule above settles the commonest overlaps, and the rubric leaves
the rest: a finding cited under either true ID is a correct finding. What the
page must not do is give the same code a finding by one sentence and none by
another, or contradict the core. One shape is left where that turns on a
judgment the core leaves open: a write through a handed store, in a function
marked as a mutator outside the edge, is clean if the write is a mutation and
owes the place marker if it is an effect, and the core defines both. Turned
down: a sentence for each overlap.
Four review rounds each built a shape that the newest such sentence answered
two ways, and nothing suggests a fifth would not. The overlap is a property of
the core's eleven rules; narrowing it means changing the core, which is the
maintainer's call. The acceptance run (plan U10) accepts either true ID.

**2026-10-11 decision: the rubric sets no severity.** How findings are ranked,
and whether one blocks a merge, is the repo's choice: the companion supplies
criteria and the repo's loop reviews (plan R16).

**2026-10-11 decision: two style checks under `og-functions-as-values` are
marked as judgment.** "Pass a function where that removes duplication" and
"name a long function" have no line a reviewer can point to, so the rubric
says to raise them only when the gain is plain. The third clause, a passed
function that writes to what it captured, is a plain check.

**2026-10-12 decision: a complete exception covers the rule it names, and no
more.** A complete exception to `og-return-new-values` leaves the function its
markers to carry, and a complete exception to `og-mark-effects` covers a
missing marker. The rubric's line used to say only that an exception "does not
replace the markers", which gave a missing marker under its own complete
exception a finding by that line and none by "a complete one covers the
breach". A function in logic whose clock read is excepted cannot have the
place marker, so the case is reachable. The TypeScript page's line gets the
same scope.

**2026-10-12 decision: deciding, for `og-thin-effects`, is applying a business
rule, with or without a branch.** The check names a branch, a calculation and
a validation. Plan R1 bars "business logic in effectful code", and the core
has pure code make "every decision" first. An earlier wording, "works out what
to write", also caught a marked mutator's own mechanics, such as the
comparison in a sort. The wording after that, "branches on business rules",
passed an effect function that computes a discount and saves it; two reviews
of that head said so, one of them by another model. A clause that exempted "a
mutator's own mechanics, such as the comparison in a sort" was tried and
removed: it also exempted a sort whose comparison applies a business rule,
which the check's first sentence flags. Whether a calculation is a business
rule is the reviewer's judgment.
