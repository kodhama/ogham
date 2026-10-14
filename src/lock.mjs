// The lock ogham writes into an adopted repo, `.ogham/lock.json`: building
// it and turning it into text. Reading one back, and checking files against
// it, is in the check that ships with the standard.

import { contentHash } from "../standard/check.mjs";

/** @typedef {import("../standard/check.mjs").Lock} Lock */

/**
 * The lock for an adoption: the standard's version and source commit, the
 * choices made for the repo, a hash for each owned file in path order, and
 * the lines added outside `.ogham/`.
 * @param {{
 *   readonly version: string,
 *   readonly commit: string,
 *   readonly choices: import("../standard/check.mjs").Choices,
 *   readonly owned: ReadonlyMap<string, string>,
 *   readonly lines: readonly import("../standard/check.mjs").AddedLine[],
 * }} adoption
 * @returns {Lock}
 */
export const buildLock = ({ version, commit, choices, owned, lines }) => ({
  version,
  commit,
  choices,
  files: Object.fromEntries(
    [...owned]
      .map(([path, text]) => /** @type {const} */ ([path, contentHash(text)]))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ),
  added: { lines },
});

/**
 * A lock as the text of `lock.json`.
 * @param {Lock} lock
 */
export const lockText = (lock) => `${JSON.stringify(lock, null, 2)}\n`;
