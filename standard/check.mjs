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
// - an ogham block, in `AGENTS.md` or another file agents read, that is gone,
//   whose text no longer matches the lock, or whose markers are broken;
// - in `ogham.local.md`, an `og-` ID the core does not define, or a `local-`
//   ID defined twice;
// - where the lint preset is installed, a comment that turns lint off without
//   a reason, in any file the preset covers. ESLint's own rule for this can be
//   silenced from inside the file; this scan cannot.
//
// It also warns, without failing, when the ogham block in `AGENTS.md` ends
// past the bytes some agents read of that file.
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

// The file every agent reads, which holds the core inline in ogham's block;
// the repo's own layer; and the core, as vendored.
export const AGENTS_FILE = "AGENTS.md";
export const LOCAL_FILE = "ogham.local.md";
export const CORE_PATH = ".ogham/coding/core.md";

// The lines that open and close ogham's block in a file another tool or the
// repo also writes.
export const BEGIN = "<!-- ogham:begin -->";
export const END = "<!-- ogham:end -->";

// How much of `AGENTS.md` some agents read: a block that ends past this byte
// is cut short for them.
export const READ_LIMIT = 32 * 1024;

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
 * hash for each file under `.ogham/`, a hash for each ogham block by the file
 * that holds it, and what was added outside `.ogham/`: lines, and the files
 * the adoption created.
 * @typedef {{
 *   readonly version: string,
 *   readonly commit: string,
 *   readonly choices: Choices,
 *   readonly files: Readonly<Record<string, string>>,
 *   readonly blocks: Readonly<Record<string, string>>,
 *   readonly added: { readonly lines: readonly AddedLine[], readonly files: readonly string[] },
 * }} Lock
 */

/**
 * An owned file, or the ogham block in a file, that no longer matches the
 * lock. A block's `path` is the file that holds it.
 * @typedef {{ readonly path: string, readonly state: "edited" | "missing", readonly block?: true }} Drift
 */

/**
 * Where a file's ogham block is: the index of the line that opens it and of
 * the line that closes it.
 * @typedef {{ readonly start: number, readonly end: number }} Span
 */

/**
 * What a file's markers say: its ogham block, if it has one; each broken
 * ogham marker, as a line naming the file and line number; a code fence or a
 * block of another tool still open at the end of the file, which a block
 * appended there would land inside; and the first ogham marker a code fence
 * hides.
 * @typedef {{ readonly span: Span | undefined, readonly errors: readonly string[], readonly unclosed: string | undefined, readonly hidden: string | undefined }} Scan
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
  const { version, commit, choices, files, blocks, added } = value;

  return typeof version === "string" &&
    typeof commit === "string" &&
    isRecord(choices) &&
    isStrings(choices.languages) &&
    typeof choices.preset === "boolean" &&
    isRecord(files) &&
    isStrings(Object.values(files)) &&
    isRecord(blocks) &&
    isStrings(Object.values(blocks)) &&
    isRecord(added) &&
    isAddedLines(added.lines) &&
    isStrings(added.files)
    ? {
        version,
        commit,
        choices: { languages: choices.languages, preset: choices.preset },
        files: /** @type {Record<string, string>} */ (files),
        blocks: /** @type {Record<string, string>} */ (blocks),
        added: { lines: added.lines, files: added.files },
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
 * A text's lines, each with its line break.
 * @param {string} text
 */
export const linesOf = (text) => text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];

/**
 * A line without its line break.
 * @param {string} line
 */
export const bare = (line) => line.replace(/\r?\n$/u, "");

/**
 * The line break a text uses: the Windows one if it has any.
 * @param {string} text
 */
export const lineBreak = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

// A tool's marker line: `<!-- name:begin -->` or `<!-- name:end -->`. A
// begin may carry a note after the word, as Trellis's does.
const MARKER = /^<!--\s*([\w.:-]+?):(begin|end)\b[^>]*-->$/u;
const OGHAM = "ogham";
// A fence at any indentation, as reading too little as fenced overwrites a
// documented marker. A backtick fence's info string holds no backtick.
const FENCE = /^\s*(`{3,}(?!.*`)|~{3,})/u;

/**
 * For each line of a fenced code block, its fence lines included, the index
 * of the line that opens it; and the fence still open at the end, if any.
 * What a fence shows is text, never a marker or a rule.
 * @param {readonly string[]} lines the lines without their breaks
 * @returns {{ readonly inside: readonly (number | undefined)[], readonly open: number | undefined }}
 */
export const fenced = (lines) => {
  /** @type {(number | undefined)[]} */
  const inside = [];
  let open = "";
  let from = 0;
  for (const [index, line] of lines.entries()) {
    const fence = FENCE.exec(line)?.[1];
    if (open === "") {
      if (fence !== undefined) [open, from] = [fence, index];
      inside.push(fence === undefined ? undefined : index);
    } else {
      inside.push(from);
      const closes =
        fence !== undefined &&
        fence[0] === open[0] &&
        fence.length >= open.length &&
        line.trim() === fence;
      if (closes) open = "";
    }
  }
  return { inside, open: open === "" ? undefined : from };
};

/**
 * Where a file's ogham block is, and what is wrong with its markers. Marker
 * lines inside a fenced code block are text, and are skipped.
 * @param {string} file the file's path, to name in each error
 * @param {string} text
 * @returns {Scan}
 */
export const scanBlocks = (file, text) => {
  const lines = linesOf(text).map(bare);
  const { inside: inFence, open: fence } = fenced(lines);
  /** @type {string[]} */
  const errors = [];
  /** @type {{ name: string, line: number }[]} */
  const others = [];
  /** @type {number | undefined} */
  let begin;
  /** @type {Span | undefined} */
  let span;
  /** @type {string | undefined} */
  let hidden;
  lines.forEach((line, index) => {
    const marker = MARKER.exec(line.trim());
    if (!marker) return;
    const [, name = "", edge] = marker;
    const opener = inFence[index];
    if (opener !== undefined) {
      if (name === OGHAM)
        hidden ??= `${file}:${opener + 1} opens a code fence that hides the ogham marker at line ${index + 1}`;
      return;
    }
    const at = `${file}:${index + 1}`;
    if (name !== OGHAM) {
      if (edge === "begin") others.push({ name, line: index + 1 });
      else {
        const opened = others.map((other) => other.name).lastIndexOf(name);
        if (opened !== -1) others.splice(opened);
      }
      return;
    }
    if (edge === "end") {
      if (begin === undefined) {
        errors.push(`${at} closes an ogham block that was never opened.`);
      } else {
        span = { start: begin, end: index };
        begin = undefined;
      }
      return;
    }
    const first = begin ?? span?.start;
    if (first !== undefined) {
      errors.push(
        `${at} opens a second ogham block; the first opens at line ${first + 1}.`,
      );
      return;
    }
    const outer = others.at(-1);
    if (outer !== undefined) {
      errors.push(
        `${at} opens an ogham block inside the ${outer.name} block that opens at line ${outer.line}.`,
      );
    }
    begin = index;
  });
  if (begin !== undefined) {
    errors.push(`${file}:${begin + 1} opens an ogham block that never closes.`);
  }
  const open = others.at(-1);
  return {
    span,
    errors,
    unclosed:
      fence !== undefined
        ? `${file}:${fence + 1} opens a code fence that never closes`
        : open === undefined
          ? undefined
          : `${file}:${open.line} opens a ${open.name} block that never closes`,
    hidden,
  };
};

/**
 * The text of a block, from the line that opens it to the line that closes
 * it, with line feeds between its lines and none after the last.
 * @param {string} text the text of the file that holds it
 * @param {Span} span
 */
export const blockText = (text, span) =>
  linesOf(text)
    .slice(span.start, span.end + 1)
    .map(bare)
    .join("\n");

/**
 * The blocks the lock pins that no longer match it, in the lock's order. A
 * file whose markers are broken is left to the marker check.
 * @param {Lock} lock
 * @param {ReadonlyMap<string, string>} contents each file's text, by path; a missing file has no entry
 * @returns {readonly Drift[]}
 */
export const blockDrift = (lock, contents) =>
  Object.entries(lock.blocks).flatMap(
    /** @returns {Drift[]} */ ([path, hash]) => {
      const text = contents.get(path);
      if (text === undefined) return [{ path, state: "missing", block: true }];
      const { span, errors } = scanBlocks(path, text);
      if (errors.length > 0) return [];
      if (span === undefined) return [{ path, state: "missing", block: true }];
      return contentHash(blockText(text, span)) === hash
        ? []
        : [{ path, state: "edited", block: true }];
    },
  );

/**
 * The broken ogham markers in each file the lock pins a block in.
 * @param {Lock} lock
 * @param {ReadonlyMap<string, string>} contents
 * @returns {readonly string[]}
 */
const markerProblems = (lock, contents) =>
  Object.keys(lock.blocks).flatMap((path) => {
    const text = contents.get(path);
    return text === undefined ? [] : scanBlocks(path, text).errors;
  });

/**
 * The warning for an `AGENTS.md` whose ogham block ends past the bytes some
 * agents read, or `undefined` when it ends inside them or there is no block.
 * @param {string | undefined} text the text of `AGENTS.md`
 * @returns {string | undefined}
 */
export const sizeWarning = (text) => {
  if (text === undefined) return undefined;
  const { span, errors } = scanBlocks(AGENTS_FILE, text);
  if (span === undefined || errors.length > 0) return undefined;
  const lines = linesOf(text);
  const upToEnd = `${lines.slice(0, span.end).join("")}${bare(lines[span.end] ?? "").trimEnd()}`;
  const offset = Buffer.byteLength(upToEnd, "utf8");
  return offset > READ_LIMIT
    ? `${AGENTS_FILE}: the ogham block ends at byte ${offset}, past byte ${READ_LIMIT}. An agent that reads only the first ${READ_LIMIT} bytes of ${AGENTS_FILE} misses the end of the coding standard. Move the block nearer the top, or shorten what comes before it.`
    : undefined;
};

const CORE_ENTRY = /^- \*\*`(og-[a-z0-9]+(?:-[a-z0-9]+)*)`\*\*/u;
const LOCAL_ENTRY = /^- \*\*`?(local-[a-z0-9]+(?:-[a-z0-9]+)*)`?\*\*/u;
// An `og-` after a `/`, or before a `.` and an extension, is no citation.
const OG_REFERENCE = /(?<![\w/-])og-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w-]|\.\w)/gu;

/**
 * What is wrong in the repo's local layer: each `og-` ID it cites that the
 * core does not define, at the first line that cites it, and each `local-`
 * ID it defines again. A rule is defined by a top-level bullet that opens
 * with its ID in bold, as the core writes its own; one shown in a fenced
 * code block is an example.
 * @param {string | undefined} local the text of `ogham.local.md`, if there is one
 * @param {string | undefined} core the text of the vendored core; without it, `og-` IDs are not judged
 * @returns {readonly string[]}
 */
export const localProblems = (local, core) => {
  if (local === undefined) return [];
  const defined = new Set(
    linesOf(core ?? "").flatMap((line) => {
      const id = CORE_ENTRY.exec(bare(line))?.[1];
      return id === undefined ? [] : [id];
    }),
  );
  const lines = linesOf(local).map(bare);
  const cited = lines.flatMap((line, index) =>
    (line.match(OG_REFERENCE) ?? []).map((id) => ({ id, line: index + 1 })),
  );
  const unknown =
    core === undefined
      ? []
      : cited.filter(
          ({ id }, at) =>
            !defined.has(id) &&
            cited.findIndex((other) => other.id === id) === at,
        );
  const inFence = fenced(lines).inside;
  const locals = lines.flatMap((line, index) => {
    const id =
      inFence[index] === undefined ? LOCAL_ENTRY.exec(line)?.[1] : undefined;
    return id === undefined ? [] : [{ id, line: index + 1 }];
  });
  return [
    ...unknown.map(
      ({ id, line }) =>
        `${LOCAL_FILE}:${line} cites ${id}, which the core does not define.`,
    ),
    ...locals.flatMap(({ id, line }) => {
      const first = locals.find((other) => other.id === id);
      return first === undefined || first.line === line
        ? []
        : [
            `${LOCAL_FILE}:${line} defines ${id} again; it is first defined at line ${first.line}.`,
          ];
    }),
  ];
};

/**
 * One drifted file or block as a line for the person reading the check's
 * output.
 * @param {Drift} drifted
 * @param {ReadonlyMap<string, string>} contents
 */
const driftProblem = ({ path, state, block }, contents) => {
  if (block) {
    if (state === "edited") {
      return `The ogham block in ${path} differs from its pinned text. A formatter may have caused it: keep it away from the block. For a change you meant, put it in ogham.local.md, then run ogham's update with --force.`;
    }
    return contents.has(path)
      ? `${path} has no ogham block, and the lock pins one there. Run ogham's update with --force to put it back.`
      : `${path} is missing, and the lock pins an ogham block in it. Restore it from git, or run ogham's update with --force.`;
  }
  return state === "missing"
    ? `${path} is missing. Run ogham's update with --force to put it back.`
    : `${path} differs from its pinned text. A formatter may have caused it: keep it away from .ogham/. For a change you meant, put it in ogham.local.md, then run ogham's update with --force.`;
};

/**
 * What the check warns about without failing: an ogham block in
 * `AGENTS.md` that ends past the bytes some agents read.
 * @param {string | undefined} agents the text of `AGENTS.md`
 * @returns {readonly string[]}
 */
export const warnings = (agents) => {
  const warning = sizeWarning(agents);
  return warning === undefined ? [] : [warning];
};

/**
 * Everything the check finds wrong, one line each; none when the adoption
 * is intact.
 * @param {{
 *   readonly lockText: string | undefined,
 *   readonly version: string,
 *   readonly contents: ReadonlyMap<string, string>,
 *   readonly sources: ReadonlyMap<string, string>,
 *   readonly scan: (text: string) => readonly Finding[],
 * }} facts the lock's text; this check's version; the text of each owned file, of each file the lock pins a block in, and of the local layer; and the text of each file the lint preset covers with the scan to run on it
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
    ...drift(lock, contents).map((drifted) => driftProblem(drifted, contents)),
    ...markerProblems(lock, contents),
    ...blockDrift(lock, contents).map((drifted) =>
      driftProblem(drifted, contents),
    ),
    ...localProblems(contents.get(LOCAL_FILE), contents.get(CORE_PATH)),
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
  const contents = readTexts(root, [
    ...Object.keys(lock?.files ?? {}),
    ...Object.keys(lock?.blocks ?? {}),
    LOCAL_FILE,
  ]);
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

/**
 * Effect: reads the repo at `root` for what the check warns about.
 * @param {string} root the repo's root folder
 * @returns {readonly string[]} each warning, one line each
 */
export const readWarnings = (root) => warnings(readText(root, AGENTS_FILE));

// Run as a script, this file checks the repo it is vendored into: the folder
// above `.ogham/`. A warning is printed and does not fail the check.
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const found = await readProblems(root);
  for (const warning of readWarnings(root)) console.error(warning);
  for (const problem of found) console.error(problem);
  process.exitCode = found.length === 0 ? 0 : 1;
}
