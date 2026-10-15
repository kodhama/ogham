// What ogham vendors into a repo: which of the shipped files a repo gets,
// which of them an update has to write or remove, and the one line added to
// a formatter's ignore file.

import { bare, contentHash, lineBreak, linesOf } from "../standard/check.mjs";

/** @typedef {import("../standard/check.mjs").Choices} Choices */

// The folder in an adopted repo that holds everything ogham owns.
export const OWNED_ROOT = ".ogham";

// The pages every repo gets. Any other page under `coding/` is a language's.
const EVERY_REPO = ["coding/core.md", "coding/sources.md", "coding/rubric.md"];
const PRESET_FOLDER = "coding/eslint/";
const LANGUAGE_PAGE = /^coding\/([^/]+)\.md$/u;

/**
 * Whether a repo with these choices gets a shipped file.
 * @param {string} path the file's path under the shipped `standard/` folder
 * @param {Choices} choices
 */
const wanted = (path, choices) => {
  if (path.startsWith(PRESET_FOLDER)) return choices.preset;
  const language = EVERY_REPO.includes(path)
    ? undefined
    : LANGUAGE_PAGE.exec(path)?.[1];
  return language === undefined || choices.languages.includes(language);
};

/**
 * The files ogham owns in a repo with these choices, by their path in the
 * repo: each is a copy of a shipped file, at the same place under `.ogham/`
 * as it has under `standard/`.
 * @param {ReadonlyMap<string, string>} source every shipped file's text, by its path under `standard/`
 * @param {Choices} choices
 * @returns {ReadonlyMap<string, string>}
 */
export const owned = (source, choices) =>
  new Map(
    [...source]
      .filter(([path]) => wanted(path, choices))
      .map(([path, text]) => [`${OWNED_ROOT}/${path}`, text]),
  );

/**
 * What it takes to bring a repo's owned files to `target`: the files to
 * write, which are those that are missing or whose text differs by more than
 * its line endings, and the files to remove, which the repo's lock owned and
 * `target` no longer holds.
 * @param {ReadonlyMap<string, string>} target the owned files as they should be
 * @param {ReadonlyMap<string, string>} current the text of each file that exists now
 * @param {readonly string[]} previous the paths the repo's lock owns
 * @returns {{ readonly write: ReadonlyMap<string, string>, readonly remove: readonly string[] }}
 */
export const changes = (target, current, previous) => ({
  write: new Map(
    [...target].filter(([path, text]) => {
      const now = current.get(path);
      return now === undefined || contentHash(now) !== contentHash(text);
    }),
  ),
  remove: previous.filter((path) => !target.has(path) && current.has(path)),
});

/**
 * A text with `line` as its last line, unless it already has that line. The
 * text keeps its kind of line break, and a text that ended without one still
 * does.
 * @param {string} text
 * @param {string} line
 */
export const withLine = (text, line) => {
  if (linesOf(text).some((existing) => bare(existing) === line)) return text;
  const end = lineBreak(text);
  return text === "" || text.endsWith("\n")
    ? `${text}${line}${end}`
    : `${text}${end}${line}`;
};

/**
 * A text without its last line that reads `line`: the inverse of `withLine`.
 * @param {string} text
 * @param {string} line
 */
export const withoutLine = (text, line) => {
  const lines = linesOf(text);
  const at = lines.map(bare).lastIndexOf(line);
  if (at === -1) return text;
  // Taking out a last line that had no line break leaves the line before it
  // as the last, and it gives up its own.
  const endsBare = at === lines.length - 1 && !(lines[at] ?? "").endsWith("\n");
  const before = lines.slice(0, at);
  const kept = endsBare
    ? [...before.slice(0, -1), ...before.slice(-1).map(bare)]
    : before;
  return [...kept, ...lines.slice(at + 1)].join("");
};
