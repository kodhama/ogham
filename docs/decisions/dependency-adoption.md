---
type: decision
title: "Dependency adoption"
description: Why each dependency ogham carries was adopted, its scope, and what was turned down for it.
decided: 2026-10-10
ticket: KOD-5
---

# Dependency adoption

**Ogham ships no dependency.** The bootstrap runs through `npx` from a version
tag and uses only Node built-ins, git and the target repo's own ESLint (plan
KTD4). Everything below is development-only: it typechecks, lints and tests
ogham's own code, and never reaches an adopting repo.

Add a dependency only with a dated decision here (`AGENTS.md`).

**2026-10-10 decision: typescript** (development only, `^6.0.3`). Ogham's code
is plain ESM JavaScript, and `npm run typecheck` checks it with
`tsc --noEmit` under `checkJs` (plan KTD14). It ships nothing. Turned down:
TypeScript 7, the current `latest`, because typescript-eslint 8.71.1 accepts
only `typescript >=4.8.4 <6.1.0`. Move to 7 once typescript-eslint supports
it.

**2026-10-10 decision: eslint** (development only, `^10.12.0`). `npm run lint`
runs it over the repo. The TypeScript preset that ogham ships is built on
ESLint's own rules (plan KTD7), so ogham's tests need it too.

**2026-10-10 decision: typescript-eslint** (development only, `^8.71.1`). Its
recommended set is the lint configuration until ogham's own preset replaces it,
and the preset's tests will need its parser for TypeScript files (plan KTD10).
Turned down: `@eslint/js` for `eslint:recommended`. ESLint 10 no longer
installs it, so it would be one more dependency for a configuration that is
replaced when the preset lands.

**2026-10-10 decision: @types/node** (development only, `^20.19.43`). The plan
names three development dependencies and this is a fourth: `checkJs` cannot
resolve `node:test`, `node:fs` and the rest without it. It is held at major
20 on purpose. The plan assumes Node 20 or later wherever the bootstrap runs,
so typing against 20 makes the typecheck reject an API that a Node 20 machine
lacks. Raise it only together with that floor.
