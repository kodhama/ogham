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
check or a failed lock write, writes the snapshot back. If putting a path
back fails too, the command names that path rather than claiming a clean
rollback. Removing a file also removes each folder it leaves empty, so a
rolled-back first `install` leaves no empty `.ogham/`.

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

**2026-10-14 decision: ogham writes no file through a symbolic link.** A
symbolic link inside `.ogham/` fails `install`, `update` and `remove` while
they read, before anything is written. A path to write or remove that is, or
passes through, a symbolic link fails the command while it writes, and it
then rolls back. `check` writes nothing: it reads through a link and judges
the text it finds there. A committed link under `.ogham/` could otherwise
make `update` overwrite a file outside the repo, make `remove` delete one
past the clean-paths check, or leave a linked folder behind while `remove`
reports success.

**2026-10-14 decision: git asks for nothing on the terminal, and gives up
in time.** Every git call `src/apply.mjs` makes runs with
`GIT_TERMINAL_PROMPT=0` and a five-minute limit. git then asks for no
credentials on the terminal; an askpass program or ssh the user configured
may still ask, and the limit bounds how long that can hold the command. The
two other git calls, the root lookup in `src/cli.mjs` and the check's file
listing, read only the local repo and never reach a remote. When the tag
lookup fails, the command prints git's error, or says git gave no answer in
time, rather than "no tag".

**2026-10-14 ruling: Node 22 is the floor.** The maintainer ruled the
provisional floor above on this PR: Node 22. `@types/node` moves to 22 with
it (`docs/decisions/dependency-adoption.md`).

**2026-10-14 corrections, after the review of this unit.**

- The 2026-10-13 entry's "`src/apply.mjs` is the one file that touches the
  disk and git" holds for `install`, `update` and `remove`. `check` reads
  the repo's files and runs `git ls-files` in `standard/check.mjs`, and
  `src/cli.mjs` asks git for the repo's root.
- The rollback (2026-10-14, "a write is checked before the lock is
  written") writes back each touched path whose text changed, not every
  touched path, and names each one it could not put back. A path that was
  absent before still has its empty folders pruned, best effort, including
  after a write that failed once it had made its folder. A folder that will
  not go is left without being named: git does not see an empty folder, and
  a later `install` writes into it. Pruning also takes an empty folder that
  was there before the command ran.
- A command that throws, rather than refusing, prints `ogham stopped:` and
  the error on one line, and exits 1.

**Left for the lint wiring unit (plan U9).** The preflight that stops on an
existing reasonless disable before anything is written; a lock marked
pending, which the check must fail; whether the repo's ESLint should lint the
vendored `.mjs` files under `.ogham/`; and the generated-file limit above.

**2026-10-14 decision: `install` and `update` refuse a file git would
ignore.** Before writing, the command asks `git check-ignore` about each file
it would create. When git ignores one, through `.gitignore`,
`.git/info/exclude` or the global excludes file, the command lists those
paths, says to stop ignoring them, and writes nothing. Otherwise the
standard would be written but left out of every commit, so no other machine
or session would get it. A file that already exists is not asked about: git
never ignores a tracked file, and an untracked or ignored one is already
refused as an uncommitted change. If git cannot answer, as when `.ogham/` is
a symbolic link, the command prints git's error and writes nothing. Found by
the Codex GitHub reviewer on this PR.

**2026-10-14 correction to the entry above.** "An untracked or ignored one
is already refused as an uncommitted change" is false for `update --force`,
which overwrites an edited owned file whatever git says of it. So the
command also asks about each existing file git reports as changed, untracked
or ignored. Only a tracked file git reports unchanged is left out, since git
never ignores one. A forced update over an owned file the repo has since
told git to ignore now refuses and writes nothing.

**2026-10-14, the ignore check restated.** This replaces the two entries
above on what the check asks about. The uncommitted-changes guard runs
first: a file it refuses never reaches the check. Of the files a command
then writes, git is asked about each new file, and about each file git
reports as changed, untracked or ignored. Such a file gets past the guard
only when `update --force` overwrites an edited owned file. A tracked file
git reports unchanged is not asked about, since git never ignores one. When
git ignores any file asked about, the command lists it and writes nothing.

**2026-10-14 correction to the entry above.** A file git reports as changed
gets past the guard only as an owned file that `update --force` writes back,
whether it was edited or deleted, not only an edited one.

**2026-10-14 decision: a diff git cannot show is named, not hidden.** When
the `git diff` printed after writing fails, as with a broken external diff
driver, the command prints `Could not show git's diff:` with git's error on
one line and says to run `git diff`. It keeps what it wrote and exits 0:
the writes passed the check before the lock was written, and the diff only
shows them. Found by the Codex GitHub reviewer on this PR.

**2026-10-14 correction to the entry above.** The diff printed after
writing is `git diff --no-ext-diff`, so an external diff program the repo
sets does not replace or break it, and the line for a diff git cannot show
says to run `git diff --no-ext-diff`. "The writes passed the check before
the lock was written" is true of the owned files only: the check reads them,
not the line added to `.prettierignore`. The command still keeps what it
wrote, since every write and the lock are complete by then.

**2026-10-14 addition.** The local edit `update` shows before it stops, or
before `--force` overwrites it, is also `git diff --no-ext-diff`, for the
same reason. Found by the Codex GitHub reviewer on this PR.
