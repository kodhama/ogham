# Coding standard: review rubric

Criteria for grading a diff against the coding standard. **The core (`.ogham/coding/core.md`) is the standard; this page turns each rule into a check.** It is for whoever reviews this repo's changes, agent or person. Ogham runs no review of its own. How findings are ranked, and whether one blocks a merge, is the repo's choice.

## How to use it

- **Grade what the diff changes**, in source code: the lines it adds or edits, and code that a deletion leaves in breach, such as a removed marker, exception comment or exemption entry. Test code is outside the standard, and code the diff leaves as it was is not a finding.
- **Read as much of the surrounding code as a check needs**: a function's markers, where a value goes, whether a type is an entity. The finding still names a line the diff changes.
- **Read `ogham.local.md` first.** It holds this repo's own rules, tightenings and exemptions, and they change what counts as a finding ([The local layer](#the-local-layer)).
- **Run every check below**, then the checks in [Exceptions and exemptions](#exceptions-and-exemptions).
- **Report each finding in the [finding format](#finding-format)**, citing the rule ID.
- **Grade the line first, then the function.** Two rules are about what one line does: `og-no-hidden-inputs` for a read and `og-return-new-values` for a write. Where a line breaks one of them and no exception or exemption is claimed for it, cite that rule and stop: the function is not graded for that line. Where the line is allowed, because it follows its rule, its function says that it mutates, or a complete exception or an exemption covers it, grade the function for it: its markers (`og-mark-effects`), and whether it also decides (`og-thin-effects`). An effect that is neither kind of line goes straight to the function.
- **Trust lint for what it sees.** Each check says what lint covers. Where lint passed on the diff, check only what lint cannot see. Where the language has no lint preset, lint did not run, or you cannot tell, check all of it. Lint did not pass code it was told to skip: a line under a disable comment, or a file that a suppressions file or a config change covers for that rule. Check that code yourself. The language page under `.ogham/coding/` names each lint rule and what it sees.

## Checks, one per core rule

- **`og-pure-by-default`** Logic whose result depends on more than its arguments, or that does something besides return a value, and that no rule below names more exactly. Reading a constant is fine. Accept an effect or a mutation only as the marked exception, kept apart from logic (`og-mark-effects`, `og-thin-effects`).
  - Lint: none.
- **`og-no-hidden-inputs`** Logic that reads the clock, randomness, the environment, storage or other ambient state itself, where it should take the value as an argument. Logic that takes a clock, a random generator or a store is the same finding: it receives the value, never the thing that produces it. A read at the program's edge that passes the value inward follows the rule.
  - Lint: reports the common spellings of a direct read. It cannot see a read through an alias or another indirection, and it cannot tell the edge from logic.
- **`og-return-new-values`** A write to a value the function was handed, or to anything reachable from it: an assignment, a deletion, or a call that changes it in place, such as a sort or a push. A helper that fills a collection its caller passed in is one too. Accept the write in a marked mutator; where the function's name or doc line says it mutates and another marker is missing, the finding is `og-mark-effects`, not this rule. A caller that still needs the original, and calls a mutator on it without copying it first, is a finding here.
  - Lint: reports an assignment to a parameter or to one of its properties, and a deletion from it. It does not see a method call that mutates, or a write that reaches the value by another name: an alias, a part taken out of it inside the function, a loop variable.
- **`og-local-building`** A write to a value the function created, made after something outside could see that value: after it was returned, stored, or captured by a function that outlives the call. Filling your own value before any of that is allowed, and is never a finding.
  - Lint: none.
- **`og-no-module-state`** A mutable binding at module level or in any other global: a variable that can be reassigned, or a constant holding a collection or object that is written later. State belongs in a value the caller holds and passes in.
  - Lint: reports a module-level variable that can be reassigned. It does not see a constant whose contents are written later.
- **`og-mark-effects`** A function that mutates or causes an effect and lacks one of its markers: its name; its types, where the language can say it; its doc line (`Effect: …` or `Mutates: …`); and, for an effect, its place at the program's edge or in a file whose job is IO. A mutator needs the first three, not the place.
  - Lint: none.
- **`og-thin-effects`** A function that mutates or causes an effect and also decides: it branches on business rules, works out what to write, or validates. The only branch it needs is whether the effect succeeded. A function that reads, branches on business rules and writes back is the shape to flag, in a simple transaction too. Carrying out what pure code decided and returned is not deciding. The rule has no standing exceptions; a real case carries an exception comment.
  - Lint: none.
- **`og-functions-as-values`** A passed function that writes to something it captured, unless the enclosing function just built that value (`og-local-building`). Also the same code repeated where passing the differing behaviour as a function would remove the repeat, and a long function written inline where a named one would do. These last two are judgment: raise them only when the gain is plain.
  - Lint: none.
- **`og-data-apart-from-behaviour`** A data structure that gains business logic: a method that computes, decides or validates, on a class or object that also holds data. A class that holds no data and works on its arguments is fine.
  - Lint: none.
- **`og-entity-builders`** For data with rules of its own, where not every value of its shape is valid: an entity with no builder; a value made outside the entity's module, by a literal, a changed copy or a cast, where it should come from the builder or another function of that module that keeps its rules; a builder that skips one of the rules, or that does not return the data or an error; a rule about the entity written outside its module; an entity that can be changed once built. Data with no rules of its own needs no builder.
  - Lint: none.
- **`og-reasoned-exceptions`** An exception or exemption that is missing a part, or whose parts are not true. [Exceptions and exemptions](#exceptions-and-exemptions) lists what to check.
  - Lint: reports a disable comment with no reason, and one that no longer silences anything. It does not read the reason.

## Exceptions and exemptions

**No exception is silent.** A complete one covers the breach, which is then not a finding. An incomplete one is a finding under `og-reasoned-exceptions`. A breach with none at all is a finding under the rule that is broken.

**A code-level exception** is a comment at the spot, in one shape: `og-<id>: <effect>; <reason>`.

- **Where lint reports the line**, it is the reason text of the lint disable comment; the language page shows the syntax. A disable comment for one of the standard's lint rules with no text, or with text that lacks one of the three parts, is a finding. The edge's own read, below, needs its text but not the three parts.
- **Where lint does not report the line**, because only the reviewer checks the rule or because lint cannot see this spelling of the breach, it is a plain comment in the same shape, at the spot. No lint rule asks for it, so look for it wherever a rule is broken.
- **All three parts are true.** The ID is the rule that is broken. The effect is what the code does. The reason says why the rule cannot hold here; a reason that only restates the effect is not one.
- **A marked mutator needs no comment** unless lint reports the line: its markers are the record. Where lint does report the line and the comment is missing, the finding is `og-reasoned-exceptions`. In-place mutation for performance is allowed this way. Do not ask for a benchmark.
- **An exception does not replace the markers.** The function still carries them (`og-mark-effects`).
- **The edge's own read is not an exception**, and the three parts are not asked of it. Lint reports the edge's read of the clock or of another hidden input, though that read follows the rule, so the line carries a disable comment saying that this is the edge. Check that it is: the read sits where effects belong, at the program's edge or in a file whose job is IO, in a function that makes no decisions of its own and passes the value into logic as an argument. Where that does not hold, the read is a finding under `og-no-hidden-inputs`.

**A loosening for a folder or the whole repo** is a named exemption in `ogham.local.md`.

- **The entry names the rule ID, its scope and the reason.** An entry that lacks one is a finding under `og-reasoned-exceptions`.
- **A lint config change that turns one of the standard's lint rules off or down** needs a matching entry, in the same diff or already in the file. Without one it is a finding under `og-reasoned-exceptions`.
- **An exemption covers its rule and its scope, and no more.** Code outside the scope is graded as usual, and inside it every other rule still holds: a mutator there still carries its markers.

## The local layer

`ogham.local.md` belongs to the repo, and the reviewer grades against it as well as the core. Where the repo has none, grade against the core alone.

- **A `local-` rule** is the repo's own. Check it like a core rule, and cite its `local-` ID in findings, and in exception comments in place of the `og-` ID.
- **A tightening** narrows a core rule and cites that rule's `og-` ID. Apply the stricter form, cite the `og-` ID, and say in the evidence that the tightening applies.
- **An exemption** loosens a core rule for a named scope. Inside that scope the rule raises no finding.

## Finding format

One finding per breach, with four fields:

- **Rule:** the `og-` or `local-` ID of the rule that is broken. Use `og-reasoned-exceptions` when the exception or exemption itself is what is wrong.
- **Location:** the file and line.
- **Evidence:** the code from the diff, and what it does that the rule forbids.
- **Exemption:** `none`, or the comment or `ogham.local.md` entry that claims to cover the breach, and why it does not.

```text
Rule: og-return-new-values
Location: billing/invoice.ts:42
Evidence: `invoice.lines.push(line)` writes to the `invoice` parameter, and neither the name `addLine` nor a doc line says it mutates.
Exemption: none
```
