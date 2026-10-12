---
type: decision
title: "Lint preset shape"
description: The choices made while building the TypeScript lint preset, its reason rule and the comment scanner, that the plan left open.
decided: 2026-10-12
ticket: KOD-5
---

# Lint preset shape

**These are the worker's choices from building the lint preset (plan U5), each
open to the maintainer's overrule when he reads it.** The plan's KTD7 fixed
the frame: ESLint's own rules registered under `ogham/`, a reason rule, and
the same reason check run outside ESLint.

**2026-10-12 decision: the preset ports Math Quest's rule list and nothing
else.** The hidden-input properties, the two storage globals and the syntax
selectors come from math-quest `eslint/pure-by-default.js` as read that day.
Its browser floor (`Object.hasOwn`, `crypto.randomUUID`, `structuredClone`)
is a compatibility rule of Math Quest's own and stays in its config. Each
`no-restricted-*` message cites its `og-` ID; `no-param-reassign` keeps
ESLint's fixed message. Turned down: adding spellings Math Quest does not
list, such as `crypto.randomUUID()`. The list is a tripwire, and a spelling
joins it when a repo's code shows it is needed.

**2026-10-12 decision: the preset covers every JS and TS source file, by
extension, and leaves out tests and declaration files.** Its `files` are the
eight extensions anywhere in the repo. Its `ignores` are `*.test.*` and
`*.spec.*` files, folders named `test`, `tests` or `__tests__`, and `.d.ts`
files, which hold no logic and declare globals with `var` by necessity.
Turned down: Math Quest's `src/**` scope, since repos keep source in other
folders. A repo whose tests sit elsewhere adds its own block and an exemption
entry (plan KTD11). The unused-directive setting sits in the same block, so
it too stops at this scope.

**2026-10-12 decision: the preset sets no parser.** It is plain rule
configuration and loads in any repo with ESLint. Giving TypeScript files a
parser is the bootstrap's job (plan KTD10, U9), and the preset's header says
to spread it after the block that sets one.

**2026-10-12 decision: a rule setting changed in a comment needs a reason
too.** `/* eslint ogham/no-param-reassign: "off" */` turns a rule off for a
file as surely as `eslint-disable` does, so `ogham/disable-needs-reason` and
the scanner treat an `eslint <rule>: <setting>` comment as a comment that
turns lint off. Turned down: covering the `eslint-disable` family only, which
leaves a silent way round "no exception is silent"; and reading the setting
to ask for a reason only where it loosens, since the check is a presence
check and the scanner reads no settings. The cost is that a comment which
tightens a rule needs a reason as well.

**2026-10-12 decision: one function decides what a comment turns off, and
both checks use it.** `lintOff` lives in the rule's file,
`standard/coding/eslint/disable-needs-reason.mjs`, because that file is
vendored into an adopting repo and `src/` is not. It follows ESLint's own
reading: the reason starts at the first ` -- ` set apart by white space, and
a `//` comment can only disable its own line or the next. A test compares it
with what ESLint honours, form by form. **For U6:** the vendored `check.mjs`
imports the scanner, and the scanner imports this file, so both imports have
to resolve in the vendored layout.

**2026-10-12 decision: the scanner reads the text itself, with no parser.**
`check` runs with Node alone (plan KTD4, KTD5), so
`src/scan-disables.mjs` walks the text and steps over strings, template
literals and regular expressions. Its header names where it guesses: a `/`
after `)` is read as division and after `}` as a regular expression, and JSX
text is read as code. Most wrong guesses hide or invent a comment on one
line; one that swallows a backtick or opens a block comment can throw off the
rest of the file. The inline rule still reports what the scanner misses,
unless the missed comment is itself a blanket disable. So one case stays with
the reviewer: a reasonless blanket disable in a file the scanner misreads.
Turned down: borrowing the adopting repo's parser, which would make `check`
fail wherever dependencies are not installed. That choice is the one to
revisit if the limit bites.

**2026-10-12 note: what the scanner was checked against.** The first review
found it reading a `/` as a regular expression after TypeScript's postfix
`!`, after a postfix `++` or `--`, after a keyword used as a property name
(`o.in / 2`), and in the JSX forms `</tag>` and `} />`; each could hide a
comment, two of them for the rest of the file. All are fixed and tested. An
earlier sentence here said a wrong guess is confined to one line, which was
false. After the fix the scanner's comments equal the parsers', comment for
comment, on 2,149 files: 1,007 JavaScript files under `node_modules`
(TypeScript's own included), 721 declaration files, and 421 of Math Quest's
`.ts` and `.tsx` files, of which only 21 are `.tsx`. So JSX is the least
tested ground. On Math Quest's source it finds the one reasonless disable the
rule mapping names.

**2026-10-12 decision: the tests carry their code inline.** The plan lists
`test/fixtures/lint/`; no fixture files were needed. The rules run on strings
through ESLint's `Linter`, as Math Quest's lint test does, and the file-scope
test passes paths to `ESLint#lintText`. Fixture files would also be
typechecked and linted as ogham's own code.

**2026-10-12 decision: an effect function's write through a restricted name
is treated like the edge's own read.** Lint restricts `localStorage` whether
code reads or writes through it, so a marked `save…` function is reported.
The TypeScript page and the rubric now say its disable comment states what is
written and that this is the edge, and that the write is graded through the
function's markers. Before this the rubric asked that comment for an
exception's three parts though no rule was broken. The rubric gained one
bullet for this, and two of its sentences were reworded; a test holds the
bullet's place.

**Left for U6.** Which files `check` scans (the preset's file scope) and its
place in the lint script. Until then nothing in `npm run lint` reports a
reasonless blanket disable in ogham's own source. The
TypeScript page says a blanket disable silences the reason rule; U6 adds that
`check` reports it.
