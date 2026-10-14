#!/usr/bin/env node
// The check an adopted repo runs on itself: `node .ogham/check.mjs`.
//
// It needs Node and git and nothing else, so it works where the repo's
// dependencies are not installed. It reads `.ogham/lock.json` and reports:
//
// - a lock that is missing, unreadable, or at another version than this file;
// - a file under `.ogham/` whose text no longer matches the hash the lock
//   pinned, or that is gone. These files are read-only in a repo: a change
//   belongs in `ogham.local.md`;
// - where the lint preset is installed, a comment that turns lint off without
//   a reason, in any file the preset covers. ESLint's own rule for this can be
//   silenced from inside the file; this scan cannot.
//
// The functions above the last section are pure. The last section reads the
// repo, and prints when the file is run as a script.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The version of the standard this file was shipped with. A lock at another
// version means the two were not written by the same run.
export const VERSION = "0.0.0";

export const LOCK_PATH = ".ogham/lock.json";

/**
 * A line the adoption added to a file outside `.ogham/`.
 * @typedef {{ readonly file: string, readonly line: string }} AddedLine
 */

/**
 * What was chosen for the repo when it adopted: which language pages it
 * got, and whether it got the lint preset.
 * @typedef {{ readonly languages: readonly string[], readonly preset: boolean }} Choices
 */

/**
 * The lock: the version and source commit of the standard, the choices, a
 * hash for each file under `.ogham/`, and what was added outside it.
 * @typedef {{
 *   readonly version: string,
 *   readonly commit: string,
 *   readonly choices: Choices,
 *   readonly files: Readonly<Record<string, string>>,
 *   readonly added: { readonly lines: readonly AddedLine[] },
 * }} Lock
 */

/**
 * An owned file that no longer matches the lock.
 * @typedef {{ readonly path: string, readonly state: "edited" | "missing" }} Drift
 */

/**
 * A reasonless comment that turns lint off, as the scan reports it.
 * @typedef {{ readonly line: number, readonly column: number, readonly label: string }} Finding
 */

/**
 * The hash that pins a file's text: sha256, in hex, over the text with
 * Windows line breaks turned into line feeds, so a checkout's line-ending
 * setting does not read as an edit.
 * @param {string} text
 */
export const contentHash = (text) =>
  createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
const isStrings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * @param {unknown} value
 * @returns {value is AddedLine[]}
 */
const isAddedLines = (value) =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.file === "string" &&
      typeof item.line === "string",
  );

/**
 * JSON text as a value, or `undefined` when it is not JSON.
 * @param {string} text
 * @returns {unknown}
 */
const parsed = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The lock a text holds, or `undefined` when the text is not a lock this
 * version reads.
 * @param {string} text
 * @returns {Lock | undefined}
 */
export const parseLock = (text) => {
  const value = parsed(text);
  if (!isRecord(value)) return undefined;
  const { version, commit, choices, files, added } = value;

  return typeof version === "string" &&
    typeof commit === "string" &&
    isRecord(choices) &&
    isStrings(choices.languages) &&
    typeof choices.preset === "boolean" &&
    isRecord(files) &&
    isStrings(Object.values(files)) &&
    isRecord(added) &&
    isAddedLines(added.lines)
    ? {
        version,
        commit,
        choices: { languages: choices.languages, preset: choices.preset },
        files: /** @type {Record<string, string>} */ (files),
        added: { lines: added.lines },
      }
    : undefined;
};

/**
 * The owned files that no longer match the lock, in the lock's order.
 * @param {Lock} lock
 * @param {ReadonlyMap<string, string>} contents each owned file's text, by path; a missing file has no entry
 * @returns {readonly Drift[]}
 */
export const drift = (lock, contents) =>
  Object.entries(lock.files).flatMap(
    /** @returns {Drift[]} */ ([path, hash]) => {
      const text = contents.get(path);
      if (text === undefined) return [{ path, state: "missing" }];
      return contentHash(text) === hash ? [] : [{ path, state: "edited" }];
    },
  );

/**
 * One drifted file as a line for the person reading the check's output.
 * @param {Drift} drifted
 */
const driftProblem = ({ path, state }) =>
  state === "missing"
    ? `${path} is missing. Run ogham's update with --force to put it back.`
    : `${path} differs from its pinned text. A formatter may have caused it: keep it away from .ogham/. For a change you meant, put it in ogham.local.md, then run ogham's update with --force.`;

/**
 * Everything the check finds wrong, one line each; none when the adoption
 * is intact.
 * @param {{
 *   readonly lockText: string | undefined,
 *   readonly version: string,
 *   readonly contents: ReadonlyMap<string, string>,
 *   readonly sources: ReadonlyMap<string, string>,
 *   readonly scan: (text: string) => readonly Finding[],
 * }} facts the lock's text, this check's version, each owned file's text, and the text of each file the lint preset covers with the scan to run on it
 * @returns {readonly string[]}
 */
export const problems = ({ lockText, version, contents, sources, scan }) => {
  if (lockText === undefined) {
    return [
      `${LOCK_PATH} is missing: this repo has not adopted ogham, or its lock was deleted.`,
    ];
  }
  const lock = parseLock(lockText);
  if (!lock) {
    return [`${LOCK_PATH} is not a lock this version of the check reads.`];
  }

  return [
    ...(lock.version === version
      ? []
      : [
          `${LOCK_PATH} records version ${lock.version}, and this check is version ${version}. Run ogham's update so both come from one version.`,
        ]),
    ...drift(lock, contents).map(driftProblem),
    ...[...sources].flatMap(([path, text]) =>
      scan(text).map(
        ({ line, column, label }) =>
          `${path}:${line}:${column} This ${label} comment gives no reason. Say why after \` -- \` (og-reasoned-exceptions).`,
      ),
    ),
  ];
};

// From here on: reading the repo, and printing.

/**
 * Effect: reads a file of the repo at `root`.
 * @param {string} root
 * @param {string} path the file's path from the repo root
 * @returns {string | undefined} its text, or `undefined` when there is no such file
 */
const readText = (root, path) => {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

/**
 * Effect: reads the text of each of the repo's files at `paths` that exists.
 * @param {string} root
 * @param {readonly string[]} paths
 * @returns {ReadonlyMap<string, string>}
 */
const readTexts = (root, paths) =>
  new Map(
    paths.flatMap((path) => {
      const text = readText(root, path);
      return text === undefined ? [] : [[path, text]];
    }),
  );

/**
 * Effect: asks git for the repo's files, tracked or new, leaving out what
 * the repo ignores.
 * @param {string} root
 * @returns {readonly string[]}
 */
const listFiles = (root) => [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    )
      .split("\0")
      .filter((path) => path !== ""),
  ),
];

/**
 * Effect: loads the file scope and the scan, which are vendored with the
 * preset, or says why they could not be loaded, as when one was deleted.
 * @returns {Promise<{ readonly inScope: (path: string) => boolean, readonly scanDisables: (text: string) => readonly Finding[] } | string>}
 */
const loadScanner = async () => {
  try {
    const { inScope } = await import("./coding/eslint/scope.mjs");
    const { scanDisables } = await import("./coding/eslint/scan-disables.mjs");
    return { inScope, scanDisables };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * Effect: reads the repo at `root` and checks its adoption. The scan and
 * the file scope are loaded only where the lock says the preset is
 * installed, since their files are vendored with it.
 * @param {string} root the repo's root folder
 * @returns {Promise<readonly string[]>} what is wrong, one line each
 */
export const readProblems = async (root) => {
  const lockText = readText(root, LOCK_PATH);
  const lock = lockText === undefined ? undefined : parseLock(lockText);
  const contents = readTexts(root, Object.keys(lock?.files ?? {}));
  if (!lock?.choices.preset) {
    return problems({
      lockText,
      version: VERSION,
      contents,
      sources: new Map(),
      scan: () => [],
    });
  }

  const scanner = await loadScanner();
  if (typeof scanner === "string") {
    return [
      ...problems({
        lockText,
        version: VERSION,
        contents,
        sources: new Map(),
        scan: () => [],
      }),
      `The scan for comments that turn lint off without a reason could not run (${scanner}). Run ogham's update with --force to restore .ogham/.`,
    ];
  }
  return problems({
    lockText,
    version: VERSION,
    contents,
    sources: readTexts(root, listFiles(root).filter(scanner.inScope)),
    scan: scanner.scanDisables,
  });
};

// Run as a script, this file checks the repo it is vendored into: the folder
// above `.ogham/`.
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const found = await readProblems(
    fileURLToPath(new URL("..", import.meta.url)),
  );
  for (const problem of found) console.error(problem);
  process.exitCode = found.length === 0 ? 0 : 1;
}
