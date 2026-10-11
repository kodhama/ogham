---
type: decision
title: "Core standard shape"
description: The maintainer's three rulings on the core standard, and the choices made while writing it that the plan left open.
decided: 2026-10-11
ticket: KOD-5
---

# Core standard shape

**Three of these are the maintainer's rulings; the rest are the worker's
choices from writing the core (plan U3), each open to his overrule when he
reads it.**

## The maintainer's rulings

**2026-10-11 ruling: thin effects has no named exceptions in v1.** A real case
uses a code-level exception that names the effect. Turned down: naming "data
too large to load first" as an exception, alone or with "cohesion cost". Each
named exception widens what reviewers accept, and nothing measured says these
two are common. The rule's reason still names both limits.

**2026-10-11 ruling: an entity's rules live in builder functions in one
module.** An entity is plain immutable data, made only through a function that
checks its rules and returns the data or an error. All of that entity's rules
live in one module of pure functions beside its type. Turned down: letting a
class guard its own invariants for complex entities, and leaving the answer to
each language page.

**2026-10-11 ruling: in-place mutation for performance is allowed as a marked
effect.** It is never silent, and no measurement is required. Turned down:
requiring a benchmark for each exception, and allowing no performance
exception at all.

## The worker's choices

**2026-10-11 decision: the core covers source code, not tests.** Math Quest's
ruling, the core's source material, covers its source tree, and the lint
preset excludes tests (plan KTD7). Turned down: "all code", which would leave
a reviewer to decide whether a top-level `let` in a test file is a finding.

**2026-10-11 decision: an entity is data with rules of its own.** Not every
value of its shape is valid. The ruling that entities are made through builder
functions uses the word without defining it. Data with no rules needs no
builder and is built with plain literals and copies. Turned down: every data
type, which would put a builder in front of every record; and "complex"
entities, a judgment the ruling already rejected.

**2026-10-11 decision: an exception comment has one shape, with or without
lint.** Where lint reports the line, the exception is the disable directive,
`-- og-<id>: <effect>` (plan KTD11). Where only the reviewer checks the rule,
it is a plain comment, `// og-<id>: <effect>`. A reviewer-only rule has no
lint rule to disable, and an unused disable is itself an error.

**2026-10-11 decision: a marked mutator needs no exception comment unless
lint reports the line.** Its markers (name, types, doc line) are the record.
The ruling on performance mutation asks for a code-level exception "where
lint fires", and lint does not report a mutating method call.

**2026-10-11 decision: the core's sources ship as a page,
`standard/coding/sources.md`.** The core cites sources by author and year and
names the page by its vendored path. Turned down: a link to this repo's
research document on `main`, which moves under a copy pinned by version and
hash, and which is a working paper with tracker references in it. The
bootstrap vendors the page with the core (plan U6).

**2026-10-11 decision: logic takes a seed, not a random generator.** Calling a
generator advances it, so a function that takes one is not pure by the core's
own definition. Math Quest's rule 13 names "a seed".

**2026-10-11 decision: the core starts at a second-level heading.** It is
inlined byte for byte into an adopter's `AGENTS.md` (plan KTD2), where a
first-level heading would start a second document.

**2026-10-11 decision: the research pass's finding on coding agents is not in
the core.** Its evidence is about self-contained code and code-generation
models, not purity or agents, and the caveats it needs do not fit the
900-word budget.
