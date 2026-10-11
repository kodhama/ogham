## Coding standard: core

These rules hold for all code in this repo, in every language. **Read the page for the language you are writing** (`.ogham/coding/typescript.md`) for detail and examples. Reviewers grade diffs against `.ogham/coding/rubric.md` and cite rule IDs. The repo's own additions and exemptions are in `ogham.local.md`.

**Words.** A **pure** function's result depends only on its arguments, and calling it changes nothing else. An **effect** is anything a call does besides returning a value: writing storage, sending a request, logging, reading the clock or a random number. A **mutation** changes a value that already exists.

Each rule names its checker. Where a language has no lint preset, the reviewer checks what lint would.

### Pure by default

- **`og-pure-by-default`** Write logic as pure functions. An effect or a mutation is the exception: marked, and kept apart from logic.
  - Why: a pure function is tested by building inputs and reading the output, and understood without the rest of the program (Carmack 2012; Seemann 2015).
  - Checked by: reviewer.
- **`og-no-hidden-inputs`** The clock, randomness, the environment, storage and other ambient state reach logic as values (a `now`, a seed, a stored value), never read inside it. Code at the edge reads them and passes them in.
  - Why: a hidden input makes the same call answer differently, so no test can pin it down (Oracle, `java.time.Clock`).
  - Checked by: lint, reviewer.

### Immutable by default

- **`og-return-new-values`** Never change a value you were handed, or anything reachable from it. Return a new value and let the caller combine.
  - Why: code can rely on a value it holds staying the same, so each piece is read and tested alone (Carmack 2012).
  - Checked by: lint, reviewer.
- **`og-local-building`** Building a value you just created is fine: fill your own array or map while nothing outside can see it yet.
  - Why: a mutation nobody else can observe leaves the function pure from outside.
  - Checked by: reviewer.
- **`og-no-module-state`** No mutable state at module level, or in any other global. State lives in a value the caller holds and passes in.
  - Why: global state is a hidden input and output of every function that can reach it (Selby et al. 2007 tie globals to wider, more frequent changes).
  - Checked by: lint, reviewer.

### Effects marked and thin

- **`og-mark-effects`** A function that mutates or causes an effect says so four ways: its **name** (`save…`, `apply…`, `…InPlace`); its **types** (data and parameters are read-only by default, so a mutable type means "this gets changed"); a **doc line** (`Effect: …` or `Mutates: …`); and its **place** (the program's edge, or a file whose job is IO).
  - Why: a reader sees at the call site that something changes (Meyer 2006; Fowler 2005; Swift API Design Guidelines).
  - Checked by: reviewer.
- **`og-thin-effects`** Effectful code does only the effect. Pure code makes every decision first and returns what should happen; it never performs the effect itself. This holds for simple transactions too.
  - Why: the decisions then test without a database or network, and the effectful part has almost nothing left to get wrong (Bernhardt 2012; Cockburn 2005).
  - Checked by: reviewer.

### Functions as values

- **`og-functions-as-values`** Pass behaviour as a function where that removes duplication. Name a function instead of inlining a long one. A passed function mutates nothing it captures, except as `og-local-building` allows.
  - Why: one piece of code then serves many behaviours (Hughes 1990). The lambdas that cause trouble are the impure, capturing ones (Nielebock et al. 2019).
  - Checked by: reviewer.

### Data apart from behaviour

- **`og-data-apart-from-behaviour`** Data structures hold data and no business logic, in object-oriented languages too. Behaviour lives in functions, or in classes that hold no data and dispatch on their arguments.
  - Why: plain data is easy to build in a test, compare, store and reuse (Hickey 2011; Goetz 2022). Fowler (2003) calls this shape an anemic domain model; this standard chooses it knowingly, and `og-entity-builders` says where the rules go.
  - Checked by: reviewer.
- **`og-entity-builders`** An entity is plain immutable data, made only through a function that checks its rules and returns the data or an error. All of an entity's rules live in one module of pure functions beside its type.
  - Why: each rule is written once, not restated by every caller (the failure Cemus et al. 2016 report), and tests without setup.
  - Checked by: reviewer.

### Exceptions

- **`og-reasoned-exceptions`** No exception is silent. Where a rule cannot hold, the exception sits at that spot, names the rule ID and the effect, and gives the reason. Mutating in place for performance is allowed this way, marked as `og-mark-effects` says; no benchmark is required. A repo-wide loosening is a named exemption in `ogham.local.md`.
  - Why: the reviewer sees every loosening and its reason, so exceptions stay few.
  - Checked by: lint, reviewer.

The reasons above are design arguments more than measured results. Sources, quotes and where they are contested: https://github.com/kodhama/ogham/blob/main/docs/research/2026-10-08-principle-rationale.md
