// What each command decides to do, from what the repo holds: refuse, do
// nothing, or a set of files to write and remove. Every function here is
// pure; `apply.mjs` reads the facts and carries the plan out.

import { LOCK_PATH, drift, parseLock } from "../standard/check.mjs";
import { choices as choicesFor } from "./detect.mjs";
import { buildLock } from "./lock.mjs";
import {
  OWNED_ROOT,
  changes,
  owned,
  withLine,
  withoutLine,
} from "./vendor.mjs";

/** @typedef {import("../standard/check.mjs").AddedLine} AddedLine */
/** @typedef {import("../standard/check.mjs").Drift} Drift */

/**
 * The standard as the running version ships it: its version, and every file
 * under `standard/` by its path there.
 * @typedef {{ readonly version: string, readonly files: ReadonlyMap<string, string> }} Source
 */

/**
 * What a command reads from the repo before it decides anything.
 * @typedef {{
 *   readonly lockText: string | undefined,
 *   readonly contents: ReadonlyMap<string, string>,
 *   readonly dirty: readonly string[],
 *   readonly rootFiles: readonly string[],
 *   readonly tracked: readonly string[],
 * }} Facts the lock's text; the text of every file under `.ogham/` and of each file outside it a command may touch; which of those paths git reports as changed, untracked or ignored (a folder's path ends in a slash); which of the root files detection asks about (`package.json`, `tsconfig.json`) exist; and every tracked path
 */

/**
 * The adoption a command leaves behind, from which the lock is built. A
 * `commit` of `undefined` means the version's tag still has to be looked up.
 * @typedef {{
 *   readonly version: string,
 *   readonly commit: string | undefined,
 *   readonly choices: import("../standard/check.mjs").Choices,
 *   readonly owned: ReadonlyMap<string, string>,
 *   readonly lines: readonly AddedLine[],
 * }} Adoption
 */

/**
 * A command's decision. `refuse` writes nothing, and names the owned files
 * whose local edits should be shown. `done` means there was nothing to do.
 * `apply` writes and removes files, then writes the lock for `adoption`, or
 * leaves the repo with no lock when there is none; `discarded` names the local
 * edits it overwrites.
 * @typedef {{ readonly kind: "refuse", readonly message: string, readonly edits: readonly Drift[] }
 *   | { readonly kind: "done", readonly message: string }
 *   | { readonly kind: "apply", readonly write: ReadonlyMap<string, string>, readonly remove: readonly string[], readonly adoption: Adoption | undefined, readonly discarded: readonly Drift[] }} Plan
 */

const PRETTIER_IGNORE = ".prettierignore";
const IGNORE_LINE = `${OWNED_ROOT}/`;

// Every path outside `.ogham/` that a command may write. A command reads
// these, and their state in git, before it decides.
export const OUTSIDE = [PRETTIER_IGNORE];

const NOT_ADOPTED = `This repo has not adopted ogham: it has no ${LOCK_PATH}.`;
const UNREADABLE = `${LOCK_PATH} is not a lock this version of ogham reads. Restore it from git, or run the version that wrote it.`;

/**
 * The paths among `touched` that git reports as changed.
 * @param {readonly string[]} touched
 * @param {readonly string[]} dirty
 */
const uncommitted = (touched, dirty) =>
  touched.filter((path) =>
    dirty.some(
      (changed) =>
        changed === path || (changed.endsWith("/") && path.startsWith(changed)),
    ),
  );

/**
 * The refusal for paths with uncommitted changes.
 * @param {readonly string[]} paths
 * @param {string} command
 * @returns {Plan}
 */
const refuseUncommitted = (paths, command) => ({
  kind: "refuse",
  message: [
    "These paths have uncommitted changes:",
    ...paths.map((path) => `  ${path}`),
    `Commit or stash them, then run ${command} again. Nothing was written.`,
  ].join("\n"),
  edits: [],
});

/**
 * The formatter's ignore file with ogham's folder in it, where the repo has
 * such a file and it lacks the line, and the lines the lock should record.
 * @param {ReadonlyMap<string, string>} contents
 * @param {readonly AddedLine[]} recorded the lines the repo's lock already records
 * @returns {{ readonly write: ReadonlyMap<string, string>, readonly lines: readonly AddedLine[] }}
 */
const ignoreEdit = (contents, recorded) => {
  const text = contents.get(PRETTIER_IGNORE);
  const edited = text === undefined ? text : withLine(text, IGNORE_LINE);
  if (edited === undefined || edited === text) {
    return { write: new Map(), lines: recorded };
  }
  const known = recorded.some(
    ({ file, line }) => file === PRETTIER_IGNORE && line === IGNORE_LINE,
  );
  return {
    write: new Map([[PRETTIER_IGNORE, edited]]),
    lines: known
      ? recorded
      : [...recorded, { file: PRETTIER_IGNORE, line: IGNORE_LINE }],
  };
};

/**
 * What `install` does: vendor the files the repo's languages call for. On a
 * repo that already has a lock it does nothing.
 * @param {Source} source
 * @param {Facts} facts
 * @returns {Plan}
 */
export const planInstall = (source, facts) => {
  if (facts.lockText !== undefined) {
    return {
      kind: "done",
      message: `Already adopted: this repo has a ${LOCK_PATH}. Run update to move it to another version.`,
    };
  }
  const chosen = choicesFor(facts);
  const target = owned(source.files, chosen);
  const ignore = ignoreEdit(facts.contents, []);
  const write = new Map([...target, ...ignore.write]);
  const blocked = uncommitted([...write.keys(), LOCK_PATH], facts.dirty);

  return blocked.length > 0
    ? refuseUncommitted(blocked, "install")
    : {
        kind: "apply",
        write,
        remove: [],
        adoption: {
          version: source.version,
          commit: undefined,
          choices: chosen,
          owned: target,
          lines: ignore.lines,
        },
        discarded: [],
      };
};

/**
 * What `update` does: bring the owned files to the running version, with
 * the choices the lock recorded. An owned file edited or deleted in the repo
 * stops it, unless `force` says to overwrite.
 * @param {Source} source
 * @param {Facts} facts
 * @param {boolean} force
 * @returns {Plan}
 */
export const planUpdate = (source, facts, force) => {
  if (facts.lockText === undefined) {
    return {
      kind: "refuse",
      message: `${NOT_ADOPTED} Run install.`,
      edits: [],
    };
  }
  const lock = parseLock(facts.lockText);
  if (!lock) return { kind: "refuse", message: UNREADABLE, edits: [] };

  const drifted = drift(lock, facts.contents);
  if (drifted.length > 0 && !force) {
    return {
      kind: "refuse",
      message: [
        "These files under .ogham/ were changed in this repo, where they are read-only:",
        ...drifted.map(({ path, state }) => `  ${path} (${state})`),
        "Move a change you want to keep to ogham.local.md. Then run update with --force, which overwrites them. Nothing was written.",
      ].join("\n"),
      edits: drifted,
    };
  }

  const target = owned(source.files, lock.choices);
  const { write: files, remove } = changes(
    target,
    facts.contents,
    Object.keys(lock.files),
  );
  const ignore = ignoreEdit(facts.contents, lock.added.lines);
  const write = new Map([...files, ...ignore.write]);
  /** @type {Adoption} */
  const adoption = {
    version: source.version,
    // The same version: the commit the lock recorded still stands.
    commit: source.version === lock.version ? lock.commit : undefined,
    choices: lock.choices,
    owned: target,
    lines: ignore.lines,
  };
  const sameLock =
    adoption.commit !== undefined &&
    JSON.stringify(buildLock({ ...adoption, commit: adoption.commit })) ===
      JSON.stringify(lock);
  if (write.size === 0 && remove.length === 0 && sameLock) {
    return {
      kind: "done",
      message: `Already at version ${lock.version}: no file differs, and nothing was written.`,
    };
  }

  const overwritten = drifted.map(({ path }) => path);
  const blocked = uncommitted(
    [...write.keys(), ...remove, LOCK_PATH],
    facts.dirty,
  ).filter((path) => !overwritten.includes(path));

  return blocked.length > 0
    ? refuseUncommitted(blocked, "update")
    : { kind: "apply", write, remove, adoption, discarded: drifted };
};

/**
 * A file's text with each of the recorded lines taken out.
 * @param {string} text
 * @param {readonly AddedLine[]} lines the lines recorded for this file
 */
const withoutLines = (text, lines) =>
  lines.reduce((rest, { line }) => withoutLine(rest, line), text);

/**
 * What `remove` does: delete the files the lock lists and the lock itself,
 * and take the lines the lock recorded back out. It touches no other path.
 * @param {Facts} facts
 * @returns {Plan}
 */
export const planRemove = (facts) => {
  if (facts.lockText === undefined) {
    return {
      kind: "refuse",
      message: `${NOT_ADOPTED} There is nothing to remove.`,
      edits: [],
    };
  }
  const lock = parseLock(facts.lockText);
  if (!lock) return { kind: "refuse", message: UNREADABLE, edits: [] };

  const remove = [
    ...Object.keys(lock.files).filter((path) => facts.contents.has(path)),
    LOCK_PATH,
  ];
  const write = new Map(
    [...new Set(lock.added.lines.map(({ file }) => file))].flatMap((file) => {
      const text = facts.contents.get(file);
      const rest =
        text === undefined
          ? text
          : withoutLines(
              text,
              lock.added.lines.filter((line) => line.file === file),
            );
      return rest === undefined || rest === text ? [] : [[file, rest]];
    }),
  );
  const blocked = uncommitted([...remove, ...write.keys()], facts.dirty);

  return blocked.length > 0
    ? refuseUncommitted(blocked, "remove")
    : { kind: "apply", write, remove, adoption: undefined, discarded: [] };
};
