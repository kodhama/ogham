## Coding standard: core

These rules hold for this repo's source code, in every language; test code is outside their scope. **Read your language's page** under `.ogham/coding/`, where there is one. The repo's own additions and exemptions are in `ogham.local.md`.

**Words.** A **pure** function's result depends only on its arguments, and calling it changes nothing else. An **effect** is anything a call does besides returning a value: writing storage, sending a request, logging, reading the clock or a random number. A **mutation** changes a value the function did not create. An **entity** is data with rules of its own: not every value of its shape is valid.

Where a language has no lint preset, the reviewer checks what lint would.

### Pure by default

- **`og-pure-by-default`** Write logic as pure functions. An effect or a mutation is the exception: marked, and kept apart from logic.
  - Why: a pure function is tested by building inputs and reading the output, and read without the rest of the program (Carmack 2012; Seemann 2015).
  - Checked by: reviewer.
- **`og-no-hidden-inputs`** The clock, randomness, the environment, storage and other ambient state reach logic as values (a `now`, a seed, a stored value), never read inside it. Code at the edge reads them and passes them in.
  - Why: with the input passed in, a test chooses it (Oracle, `java.time.Clock`, on the clock).
  - Checked by: lint, reviewer.

### Immutable by default

- **`og-return-new-values`** Never change a value you were handed, or anything reachable from it. Return a new value and let the caller combine. The one exception is a mutator marked as `og-mark-effects` says; its callers copy first when they need the original.
  - Why: code can rely on a value it holds staying the same. Recommended practice, not a measured result (Eyolfson and Lam 2019).
  - Checked by: lint, reviewer.
- **`og-local-building`** Building a value you just created is fine: fill your own array or map while nothing outside can see it yet.
  - Why: a change nobody else can observe leaves the function pure from outside.
  - Checked by: reviewer.
- **`og-no-module-state`** No mutable state at module level, or in any other global. State lives in a value the caller holds and passes in.
  - Why: global state is a hidden input and output of every function that can reach it (Selby et al. 2007 tie cross-module globals to more frequent changes).
  - Checked by: lint, reviewer.

### Effects marked and thin

- **`og-mark-effects`** A function that mutates or causes an effect says so by its **name** (`save…`, `apply…`, `…InPlace`); by its **types**, where the language can say it (data and parameters are read-only by default, so a mutable type means "this gets changed"); by a **doc line** (`Effect: …` or `Mutates: …`); and, for an effect, by its **place** (the program's edge, or a file whose job is IO).
  - Why: a reader sees at the call site that something changes (Meyer 2006; Fowler 2005; Swift API Design Guidelines).
  - Checked by: reviewer.
- **`og-thin-effects`** A function that mutates or causes an effect does only that. Pure code makes every decision first and returns what should happen; it never performs the effect itself. This holds for simple transactions too, and has no standing exceptions.
  - Why: the decisions then test without a database or network, and the effectful part has few branches left (Bernhardt 2012; Cockburn 2005). Known limits: lost cohesion (Holub 2020) and data too large to load first (Seemann 2025).
  - Checked by: reviewer.

### Functions as values

- **`og-functions-as-values`** Pass behaviour as a function where that removes duplication. Name a function instead of inlining a long one. A passed function mutates nothing it captures, except as `og-local-building` allows.
  - Why: one piece of code then serves many behaviours (Hughes 1990). In concurrent code, the lambdas capable of causing races are the impure, capturing ones (Nielebock et al. 2019).
  - Checked by: reviewer.

### Data apart from behaviour

- **`og-data-apart-from-behaviour`** Data structures hold data and no business logic, in object-oriented languages too. Behaviour lives in functions, or in classes that hold no data and dispatch on their arguments.
  - Why: plain data is easy to build in a test, compare, store and reuse (Hickey 2011; Goetz 2022, who keeps objects for complex entities). Fowler (2003) calls this an anemic domain model; `og-entity-builders` answers him.
  - Checked by: reviewer.
- **`og-entity-builders`** An entity is plain immutable data, made only through a function that checks its rules and returns the data or an error. All of an entity's rules live in one module of pure functions beside its type.
  - Why: each rule is written once, not restated by every caller (the failure Cemus et al. 2016 report), and tests without setup.
  - Checked by: reviewer.

### Exceptions

- **`og-reasoned-exceptions`** No exception is silent. Where a rule cannot hold, a comment at that spot names the rule ID and the effect; where lint reports the line, that comment is the lint disable. Mutating in place for performance is allowed as a marked mutator; no benchmark is required. A loosening for a folder or the whole repo is a named exemption, with its reason, in `ogham.local.md`.
  - Why: the reviewer sees every loosening and what it does.
  - Checked by: lint, reviewer.

The reasons above are design arguments more than measured results. Sources: `.ogham/coding/sources.md`.
