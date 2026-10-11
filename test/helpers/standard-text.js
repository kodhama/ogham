// Text helpers the standard's tests share: reading a page, parsing its
// `og-` entries, and the checks every shipped page has to pass. Each is a
// pure function over text, apart from the one that reads a file.

import { readFileSync } from "node:fs";

/**
 * One list entry that opens with a bold `og-` ID: the ID, the text after it
 * on the same line, and the entry's indented lines.
 * @typedef {{ readonly id: string, readonly text: string, readonly body: readonly string[] }} Entry
 */

/**
 * One rule entry as `core.md` writes it.
 * @typedef {{ readonly id: string, readonly rule: string, readonly why: string, readonly checkers: readonly string[] }} Rule
 */

export const MATH_QUEST_IDENTIFIERS = [
  /math[ -]?quest/i,
  /\bMQ-\d+/,
  /shuffleInPlace/,
  /StorageLike/,
  /BootIO/,
  /eventsink/,
];
// Tracker issues, and the plan's own IDs for requirements, rulings and units.
export const TRACKER_REFERENCES = [
  /\bKOD-\d+/,
  /\bTRL-\d+/,
  /\b(?:KTD|AE|R|D|U)\d+\b/,
];

export const ENTRY_START = /^- \*\*`(og-[a-z0-9-]+)`\*\*\s*(.*)$/;
export const OG_ID = /(?<![\w-])og-[a-z0-9]+(?:-[a-z0-9]+)*/g;

/**
 * Effect: reads a file of this repo from disk.
 * @param {string} path a path relative to the repo root
 */
export const readRepoFile = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * The text after `- <label>:` in an entry's indented lines, or "" when absent.
 * @param {readonly string[]} lines
 * @param {string} label
 */
export const field = (lines, label) =>
  lines
    .map((line) => line.trim())
    .find((line) => line.startsWith(`- ${label}:`))
    ?.slice(`- ${label}:`.length)
    .trim() ?? "";

/**
 * Every entry in a document: a top-level bullet opening with a bold `og-`
 * ID, with the indented lines that follow it.
 * @param {string} text
 * @returns {readonly Entry[]}
 */
export const parseEntries = (text) =>
  text
    .split(/^(?=- \*\*`og-)/m)
    .filter((block) => ENTRY_START.test(block.split("\n", 1)[0] ?? ""))
    .map((block) => {
      const [head = "", ...rest] = block.split("\n");
      const end = rest.findIndex((line) => /^\S/.test(line));
      const start = ENTRY_START.exec(head);
      return {
        id: start?.[1] ?? "",
        text: (start?.[2] ?? "").trim(),
        body: end === -1 ? rest : rest.slice(0, end),
      };
    });

/**
 * Every rule entry in a core document: an entry with indented `Why:` and
 * `Checked by:` lines.
 * @param {string} text
 * @returns {readonly Rule[]}
 */
export const parseRules = (text) =>
  parseEntries(text).map((entry) => ({
    id: entry.id,
    rule: entry.text,
    why: field(entry.body, "Why"),
    checkers: field(entry.body, "Checked by")
      .replace(/\.$/, "")
      .split(",")
      .map((checker) => checker.trim())
      .filter(Boolean),
  }));

/**
 * `og-` IDs a text mentions that the core does not define.
 * @param {string} text
 * @param {readonly string[]} ids
 */
export const unknownIds = (text, ids) => [
  ...new Set((text.match(OG_ID) ?? []).filter((id) => !ids.includes(id))),
];

/**
 * Tokens shaped like a path into a repo's own tree: a common top-level folder
 * name, or one of this repo's own, followed by a slash, wherever it sits in
 * the path. Web addresses are left out first, since their paths are not the
 * repo's. This is a tripwire over a list of names, not a path parser: a
 * general one would flag "and/or" and import paths in examples.
 * @param {string} text
 */
export const repoPaths = (text) =>
  text
    .replace(/https:\/\/[^\s>)]+/g, "")
    .match(
      /(?<![\w-])(?:src|api|lib|app|tests?|packages|docs|scripts|server|client|standard|bin|eslint|templates|\.github)\/[\w./-]*/g,
    ) ?? [];

/**
 * The patterns a text matches, as their source strings.
 * @param {string} text
 * @param {readonly RegExp[]} patterns
 */
export const matches = (text, patterns) =>
  patterns.filter((pattern) => pattern.test(text)).map(String);

/**
 * The part of a document under one `## ` heading, up to the next one.
 * @param {string} text
 * @param {string} heading
 */
export const section = (text, heading) =>
  text.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? "";
