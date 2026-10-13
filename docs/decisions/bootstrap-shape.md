---
type: decision
title: "Bootstrap shape"
description: The choices made while building install, update, check and remove that the plan left open.
decided: 2026-10-13
ticket: KOD-5
---

# Bootstrap shape

**These are the worker's choices from building the bootstrap's first half
(plan U6), each open to the maintainer's overrule when he reads it.** The
plan's KTD1, KTD4, KTD5 and KTD13 fixed the frame: everything owned under
`.ogham/`, a zero-dependency Node script with four commands, hashes in a
lock checked offline, and the preset only where the root has TypeScript and a
`package.json`.

**2026-10-13 decision: `.ogham/` is a copy of `standard/`, file for file.**
Each owned file sits at the same place under `.ogham/` as it has under
`standard/`, and is written unchanged. So the check ships as
`standard/check.mjs`, not `src/check.mjs` as the plan listed, and the comment
scanner moved from `src/` to `standard/coding/eslint/scan-disables.mjs`,
beside the rule whose `lintOff` it imports. Every import between vendored
files is then relative inside one tree and resolves in both places. Turned
down: rewriting import paths while vendoring, and joining the modules into
one file, since either makes the vendored text differ from any file a reader
can find at the tag. `src/` holds what is never vendored, and imports the
hash and the lock reader from the check, so the command and the vendored
script run the same code.

**2026-10-13 decision: the file scope is one module, and the check matches
it without ESLint.** `standard/coding/eslint/scope.mjs` holds the preset's
`files` and `ignores` and a small matcher for the glob pieces those lists
use. The preset imports the lists; the check imports the matcher, because the
preset itself imports ESLint and the check runs with Node alone. A test asks
ESLint and the matcher about the same 32 paths. A path through a
`node_modules` folder is out, as it is for ESLint.

**2026-10-13 decision: the scan covers git's files, and only where the
preset is installed.** The check lists tracked and new files with
`git ls-files`, leaving out what the repo ignores, keeps those in scope, and
scans each. It loads the scanner only when the lock says the preset is
installed, since the scanner is vendored with it. Known limit, for the lint
wiring unit to settle: a tracked file that the repo's own ESLint config
ignores, such as generated code that opens with a blanket disable, is still
scanned and reported.

**2026-10-13 decision: the version is a constant in the check.** A lock at
another version than the check that reads it fails. The constant equals
`package.json`'s version, which a test holds. `check` run through `npx` at
one version on a repo adopted at another fails the same way, and says to run
`update`.

**2026-10-13 decision: the language page follows the repo's languages, and
the TypeScript page covers JavaScript.** A repo with a `tsconfig.json` or any
tracked TypeScript or JavaScript file gets `typescript.md`; a repo with
neither gets the core, its sources and the rubric. The preset needs
TypeScript and a root `package.json` (plan KTD13). `update` reads both
choices from the lock and never looks again.

**2026-10-13 decision: each command is facts, then a pure plan, then one
all-or-nothing step.** `src/plan.mjs` turns what was read from the repo into
a refusal, "nothing to do", or the files to write and remove. `src/apply.mjs`
is the one file that touches the disk and git.

**2026-10-13 decision: rollback restores from a snapshot, not from git.**
Before the first write the command reads every path it will touch; on a
failure it writes each back, and deletes what it created. The plan said to
restore from git. That cannot restore an owned file whose local edit was
never committed, which `update --force` overwrites and which the plan lets
past the clean-paths check on purpose. The clean-paths refusal still stands
as the plan has it.

**2026-10-13 decision: a local edit is shown against the commit that last
held the pinned text.** The lock holds a hash, not the text. To show an
edit, `update` walks the file's history for the commit whose copy matches
the lock's hash and prints `git diff` from there, which covers committed and
uncommitted edits alike. Where no commit matches, it names the file and says
the pinned text is not in the repo's history.

**2026-10-13 decision: the lock's `added` holds lines only, for now.**
This unit creates no file outside `.ogham/`, so `added.lines` is the whole
record: today the one `.prettierignore` line. A line is recorded only when
ogham inserted it, and `remove` takes out exactly that. The units that create
files or add dependencies extend `added`.

**2026-10-13 decision: the tests build their repos in a temporary folder.**
The plan lists `test/fixtures/repos/`; no fixture tree is committed. A
committed fixture's files would be typechecked and linted as ogham's own, and
its test files would match `npm test`'s glob.

**Left for the lint wiring unit (plan U9).** The preflight that stops on an
existing reasonless disable before anything is written; a lock marked
pending, which the check must fail; whether the repo's ESLint should lint the
vendored `.mjs` files under `.ogham/`; and the generated-file limit above.
