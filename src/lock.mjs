// The lock ogham writes into an adopted repo, `.ogham/lock.json`: building
// it and turning it into text. Reading one back, and checking files against
// it, is in the check that ships with the standard.

import { contentHash } from "../standard/check.mjs";

/** @typedef {import("../standard/check.mjs").Lock} Lock */

/**
 * The entries of a map as an object, in key order, each value hashed.
 * @param {ReadonlyMap<string, string>} texts
 */
const hashes = (texts) =>
  Object.fromEntries(
    [...texts]
      .map(([path, text]) => /** @type {const} */ ([path, contentHash(text)]))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

/**
 * The lock for an adoption: the standard's version and source commit, the
 * choices made for the repo, a hash for each owned file and for each placed
 * block, both in path order, and what was added outside `.ogham/`.
 * @param {{
 *   readonly version: string,
 *   readonly commit: string,
 *   readonly choices: import("../standard/check.mjs").Choices,
 *   readonly owned: ReadonlyMap<string, string>,
 *   readonly blocks: ReadonlyMap<string, string>,
 *   readonly lines: readonly import("../standard/check.mjs").AddedLine[],
 *   readonly created: readonly string[],
 * }} adoption
 * @returns {Lock}
 */
export const buildLock = ({
  version,
  commit,
  choices,
  owned,
  blocks,
  lines,
  created,
}) => ({
  version,
  commit,
  choices,
  files: hashes(owned),
  blocks: hashes(blocks),
  added: { lines, files: created },
});

/**
 * A lock as the text of `lock.json`.
 * @param {Lock} lock
 */
export const lockText = (lock) => `${JSON.stringify(lock, null, 2)}\n`;
