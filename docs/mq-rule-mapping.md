# Math Quest rules 11–16 and where each part lands

**Math Quest loses nothing by adopting ogham** (R5): every clause of its rules 11–16 is either a core rule or stays in Math Quest's local layer. `test/standard-structure.test.js` fails if a rule has no row.

**Source:** math-quest `docs/code-organisation.md`, section "Pure by default", read on 2026-10-11. Rules 1–10 of that file are about how code is organised and described: folders, imports, README maps, docblocks, names and the PR file map. They belong to the code-organisation standard ogham defers (R18), so they stay in Math Quest whole.

## Rule by rule

| Rule | Clause | Ogham rule | Math Quest's local layer |
| --- | --- | --- | --- |
| 11 | Return new values; never change a parameter. A helper that pushes into its caller's array breaks it | `og-return-new-values` | — |
| 11 | The one exception is a marked mutator, whose callers copy first | `og-return-new-values` states both; `og-mark-effects` says how it is marked | `shuffleInPlace` as the named example |
| 12 | Building a value you just created is fine | `og-local-building` | — |
| 12 | Lint sees a `reduce` accumulator as a parameter | `og-local-building`, on the TypeScript page | — |
| 13 | The clock, randomness, environment, storage, time zone and the page come into logic as values | `og-no-hidden-inputs`, which says "and other ambient state" | The time zone and the page, named |
| 13 | Shell code gets them as injected interfaces | — | `Clock`, `StorageLike` and `BootIO` in `src/ui/boot.ts`. The TypeScript page says an injected interface is still an effect |
| 14 | No mutable state at module level | `og-no-module-state` | — |
| 14 | The shell keeps exactly one mutable cell per owner | — | "One cell per owner, as `src/index.ts` does", as a tightening of `og-no-module-state` |
| 15 | A function that mutates or causes an effect does only that; pure code makes every decision first | `og-thin-effects` | — |
| 16 | A mutation or effect is marked by name, type, docblock line and place | `og-mark-effects` | — |
| 16 | Effects live in the shell or in a file whose job is IO | `og-mark-effects`, where place binds effects and not mutators, as in rule 16 | The shell's paths: `src/ui/`, `src/eventsink/`, `api/` |
| 16 | Core code takes the values an effect would fetch and returns what should happen | `og-thin-effects`, `og-no-hidden-inputs` | The spine's "a pure component emits an event by returning it" |

The section's own heading and its two definitions, "pure" and "an effect", land in `og-pure-by-default` and the core's "Words" paragraph.

## Checkers

Math Quest's "Checked by" column carries over, with one change. **The lint half is a promise until the preset ships** (U5): the preset ports Math Quest's rule list, and U5's tests hold it to that. Until then, read "the same" below as the split between lint and reviewer, not as a tested list of spellings.

| Rule | Math Quest checks with | Ogham checks with |
| --- | --- | --- |
| 11 | lint (property writes), reviewer (method calls) | The same: `og-return-new-values` is lint and reviewer |
| 12 | reviewer | The same |
| 13 | lint (the listed spellings), reviewer (the rest) | The same |
| 14 | lint (top-level `let` or `var`), reviewer (a `const` written later) | The same |
| 15 | reviewer | The same |
| 16 | reviewer; lint where a rule can see it | Reviewer for `og-mark-effects`. The lint part is the disable comment that names the effect, which ogham checks under `og-reasoned-exceptions` |

## What stays in Math Quest besides the rows above

- **Where lint reaches.** The module-state and clock-syntax checks do not reach `src/core/knowledge/`, `src/types.ts` or `src/util.ts` today. Under ogham each carve-out is a block in Math Quest's own lint config plus a named exemption, with its reason, in `ogham.local.md`. A bare config change is not enough.
- **The frozen counts.** `eslint-suppressions.json` and the rule that it only shrinks. Ogham's bootstrap records existing violations the same way, keyed to `ogham/*` rules.
- **Its rule numbers.** Math Quest's documents keep citing 11–16; findings and lint messages from ogham cite `og-` IDs.

## What ogham adds that Math Quest does not have today

Adopting ogham **tightens** Math Quest. None of this removes a rule.

Three new rules:

- **`og-functions-as-values`:** a passed function mutates nothing it captures.
- **`og-data-apart-from-behaviour`:** data structures hold no business logic. Math Quest's rule 2 says the same of files in `types/` only.
- **`og-entity-builders`:** an entity is made only through a function that checks its rules, and its rules live in one module.

Three tighter forms of what it has:

- **An exception names the rule ID.** Math Quest's disable comments give a reason that names the effect, as in `-- Mutates: the swap is this function's whole job` (`src/rng.ts`). Under `og-reasoned-exceptions` they also name the `og-` ID.
- **Every disable comment needs its text**, including ones for Math Quest's own lint rules. `src/content/serving/serve.ts` has one with none today.
- **`og-no-module-state` also names other globals**, where rule 14 names module level only.

One thing is unchanged where it may look wider: the core covers source code and leaves tests out, as Math Quest's ruling covers `src/`.

Existing code that breaks these is recorded when Math Quest adopts ogham, in that adoption's own ticket.

## Rulings behind the mapping

The maintainer settled three questions on 2026-10-11. The first two keep Math Quest's rule as it is; the third is new.

- **No named exceptions to thin effects.** Rule 15 has none, and neither has `og-thin-effects`. A real case uses a code-level exception.
- **Performance mutation is a marked effect.** Rule 11's marked-mutator exception stays: allowed when marked, never silent, no benchmark required. Where lint reports the line, the disable comment names the rule ID and the effect (`og-reasoned-exceptions`).
- **Where an entity's rules live.** New in ogham: builder functions in one module (`og-entity-builders`).
