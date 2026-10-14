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
is the one file that reads and writes the repo's files and runs git on them;
`src/cli.mjs` only asks git for the repo's root.

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

**2026-10-14 decision: the tag is looked up before anything is written.**
`install`, and an `update` to another version, ask the remote for the
version's tag with `git ls-remote` and record the commit it points at (the
peeled commit for an annotated tag). No tag means a refusal with nothing
written, since the lock would otherwise pin no source. The remote is one
constant, ogham's GitHub URL; the tests point it at a local repo through
git's `insteadOf`, so no test needs the network. An `update` to the same
version keeps the commit the lock already records.

**2026-10-14 decision: a write is checked before the lock is written.**
After writing and removing, the command reads every owned file back and
requires each to match the lock it is about to write; `remove` requires each
removed path to be gone. Only then is the lock written, so a lock on disk
always describes files that were checked. Any failure, including a failed
check or a failed lock write, writes back each touched path that changed. If
putting a path back fails too, the command names that path rather than
claiming a clean rollback. Removing a file also removes each folder it leaves
empty, so a rolled-back first `install` leaves no empty `.ogham/`.

**2026-10-14 decision: ogham writes no file through a symbolic link.** A
symbolic link inside `.ogham/` fails the command while it reads, before
anything is written. A path to write or remove that is, or passes through, a
symbolic link fails it while it writes, and it then rolls back. A committed
link under `.ogham/` could otherwise make `update` overwrite a file outside
the repo, make `remove` delete one past the clean-paths check, or leave a
linked folder behind while `remove` reports success.

**2026-10-14 decision: git never prompts, and gives up in time.** Every git
call `src/apply.mjs` makes runs with `GIT_TERMINAL_PROMPT=0` and a
five-minute limit, so a remote that asks for credentials, or a network that
stalls, fails the command instead of holding it. The two other git calls,
the root lookup in `src/cli.mjs` and the check's file listing, read only the
local repo and never reach a remote. When the tag lookup fails, the command prints git's
error, not "no tag".

**2026-10-14 decision: what a command prints, and its exit code.** A
refusal goes to standard error and exits 1, with nothing written. A command
line ogham cannot read exits 2 with the usage. "Already adopted" and
"already at version" exit 0. After writing, a command prints git's diff of
each touched path that existed before, then names each file it created,
since git's diff does not show a new untracked file. `update` reads each
discarded edit before it writes, because the edit is gone afterwards.

**2026-10-14 decision: the command works on the repo that holds the
current folder.** It finds the root with `git rev-parse --show-toplevel`, so
it runs from any subfolder, and refuses outside a git repo. `check` runs the
shipped check's own reader on that root, the same code `.ogham/check.mjs`
runs, at the running version.

**2026-10-14 decision, provisional: Node 22 is the floor.** The plan said
Node 20, which is past its end of support, and `npm test`'s glob needs Node 21
or later. `engines` says `>=22`, and a second CI job, `floor`, runs the tests
on Node 22. It is a job of its own, not a matrix, because a matrix would
rename `test`, the check `main`'s ruleset requires. `@types/node` stays at 20
until the maintainer rules the floor; `docs/decisions/dependency-adoption.md`
raises the two together.

**Left for the lint wiring unit (plan U9).** The preflight that stops on an
existing reasonless disable before anything is written; a lock marked
pending, which the check must fail; whether the repo's ESLint should lint the
vendored `.mjs` files under `.ogham/`; and the generated-file limit above.
