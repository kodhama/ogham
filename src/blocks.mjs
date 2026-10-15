// The hook-in: the marked blocks ogham places in the files agents read, so
// that the writing agent and the reviewing agent both find the standard, and
// the local layer it seeds once. Every function here is pure; `plan.mjs`
// calls them with what was read from the repo.
//
// - `AGENTS.md` gets the agents block, which carries the core's text inline,
//   once. It is created when absent.
// - `CLAUDE.md` is created as one `@AGENTS.md` line when absent. When it
//   exists without that import, it gets the Claude block: imports of the core
//   and the local layer, and pointers, never a second copy of the core.
// - `CODING_STANDARDS.md` gets the reviewer block, only where it exists.
// - `ogham.local.md` is created from its template when absent, and never
//   written again.

import {
  AGENTS_FILE,
  BEGIN,
  END,
  LOCAL_FILE,
  bare,
  lineBreak,
  linesOf,
  scanBlocks,
  sizeWarning,
} from "../standard/check.mjs";
import { OWNED_ROOT, withoutLine } from "./vendor.mjs";

/** @typedef {import("../standard/check.mjs").AddedLine} AddedLine */

export const CLAUDE_FILE = "CLAUDE.md";
export const REVIEWER_FILE = "CODING_STANDARDS.md";

// The files outside `.ogham/` the hook-in reads, and may write.
export const HOOK_FILES = [AGENTS_FILE, CLAUDE_FILE, REVIEWER_FILE, LOCAL_FILE];

// The files a block can go in.
const BLOCK_FILES = [AGENTS_FILE, CLAUDE_FILE, REVIEWER_FILE];

// The line a created `CLAUDE.md` holds, and how an existing one is seen to
// import `AGENTS.md` already: an `@` path standing on its own, not in code.
const AGENTS_IMPORT = "@AGENTS.md";
const IMPORTS_AGENTS = /(?:^|\s)@(?:\.\/)?AGENTS\.md(?=\s|$)/mu;

/**
 * The three blocks, each from its opening marker to its closing marker,
 * with line feeds and no line break after the last line.
 * @typedef {{ readonly agents: string, readonly claude: string, readonly reviewer: string }} Blocks
 */

/**
 * Where the blocks go: a refusal naming each broken marker, or the files to
 * write, the block placed in each file, the files the adoption created, the
 * lines the lock should record for the files this run creates, and any
 * warning.
 * @typedef {{ readonly kind: "refuse", readonly problems: readonly string[] }
 *   | {
 *     readonly kind: "place",
 *     readonly write: ReadonlyMap<string, string>,
 *     readonly blocks: ReadonlyMap<string, string>,
 *     readonly created: readonly string[],
 *     readonly lines: readonly AddedLine[],
 *     readonly warnings: readonly string[],
 *   }} Placement
 */

/**
 * Taking ogham out of the files outside `.ogham/`: a refusal naming each
 * broken marker, or the files to write and the files to remove.
 * @typedef {{ readonly kind: "refuse", readonly problems: readonly string[] }
 *   | { readonly kind: "remove", readonly write: ReadonlyMap<string, string>, readonly remove: readonly string[] }} Removal
 */

/**
 * A shipped template's text.
 * @param {ReadonlyMap<string, string>} templates every template's text, by its name
 * @param {string} name
 */
const template = (templates, name) => {
  const text = templates.get(name);
  if (text === undefined) {
    throw new Error(`the template ${name} is missing from this copy of ogham`);
  }
  return text;
};

/**
 * A block's body between the markers, with a blank line on either side.
 * @param {string} body
 */
const marked = (body) => `${BEGIN}\n\n${body.trimEnd()}\n\n${END}`;

/**
 * The three blocks for a repo with these languages, the agents block
 * carrying `core` inline. Each value goes in as written: none is searched
 * for placeholders of its own.
 * @param {ReadonlyMap<string, string>} templates
 * @param {string} core the core's text, as vendored
 * @param {readonly string[]} languages
 * @returns {Blocks}
 */
export const renderBlocks = (templates, core, languages) => {
  const pages = languages
    .map(
      (language) =>
        `- **Language page:** \`${OWNED_ROOT}/coding/${language}.md\`. Read it before writing code in its language.\n`,
    )
    .join("");
  /** @param {string} name */
  const fill = (name) =>
    template(templates, name)
      .replaceAll("{{languages}}", () => pages)
      .replaceAll("{{core}}", () => core);
  return {
    agents: marked(fill("block-agents.md")),
    claude: marked(fill("block-claude.md")),
    reviewer: marked(fill("block-reviewer.md")),
  };
};

/**
 * A text with `block` in it: in place of the ogham block it holds, or at its
 * end after a blank line. The block takes the text's kind of line break, and
 * a text that ended without one still does. The text's markers must not be
 * broken.
 * @param {string} text
 * @param {string} block from its opening marker to its closing marker
 */
export const withBlock = (text, block) => {
  const end = lineBreak(text);
  const placed = block.split("\n").join(end);
  const { span } = scanBlocks("", text);
  if (span !== undefined) {
    const lines = linesOf(text);
    const last = lines[span.end] ?? "";
    return [
      ...lines.slice(0, span.start),
      `${placed}${last.slice(bare(last).length)}`,
      ...lines.slice(span.end + 1),
    ].join("");
  }
  if (text === "") return `${placed}${end}`;
  return text.endsWith("\n")
    ? `${text}${end}${placed}${end}`
    : `${text}${end}${end}${placed}`;
};

/**
 * A text without its ogham block: the inverse of `withBlock`. The blank
 * line that set the block apart goes with it: the one before it, or, for a
 * block at the top, the one after.
 * @param {string} text
 */
export const withoutBlock = (text) => {
  const { span } = scanBlocks("", text);
  if (span === undefined) return text;
  const lines = linesOf(text);
  /** @param {number} index */
  const blank = (index) => bare(lines[index] ?? "x") === "";
  const from = blank(span.start - 1) ? span.start - 1 : span.start;
  const to = span.start === 0 && blank(span.end + 1) ? span.end + 1 : span.end;
  // Taking out a last line that had no line break leaves the line before it
  // as the last, and it gives up its own.
  const endsBare = to === lines.length - 1 && !(lines[to] ?? "").endsWith("\n");
  const before = lines.slice(0, from);
  const kept = endsBare
    ? [...before.slice(0, -1), ...before.slice(-1).map(bare)]
    : before;
  return [...kept, ...lines.slice(to + 1)].join("");
};

/**
 * Which block each file gets. `AGENTS.md` always gets one. `CLAUDE.md` gets
 * one where it exists and does not import `AGENTS.md`, or holds a block the
 * lock pins. `CODING_STANDARDS.md` gets one where it exists.
 * @param {Blocks} blocks
 * @param {ReadonlyMap<string, string>} contents
 * @param {readonly string[]} pinned the files whose block the lock pins
 * @returns {readonly (readonly [string, string])[]}
 */
const targets = (blocks, contents, pinned) => {
  const claude = contents.get(CLAUDE_FILE);
  const claudeGetsBlock =
    claude !== undefined &&
    (pinned.includes(CLAUDE_FILE) || !IMPORTS_AGENTS.test(claude));
  /** @type {readonly (readonly [string, string])[]} */
  const all = [
    [AGENTS_FILE, blocks.agents],
    [CLAUDE_FILE, blocks.claude],
    [REVIEWER_FILE, blocks.reviewer],
  ];
  return all.filter(
    ([file]) =>
      file === AGENTS_FILE ||
      (file === CLAUDE_FILE ? claudeGetsBlock : contents.has(file)),
  );
};

/**
 * Where the blocks go, and what that writes. On `install` it also creates
 * `CLAUDE.md` with its import, and `ogham.local.md`, where either is absent.
 * `update` creates neither: it rewrites the blocks there are, and places one
 * in a file that has come to call for it since. A file with broken ogham
 * markers, or whose end sits inside another tool's open block where a block
 * would be added, stops the run.
 * @param {{
 *   readonly templates: ReadonlyMap<string, string>,
 *   readonly core: string,
 *   readonly languages: readonly string[],
 *   readonly contents: ReadonlyMap<string, string>,
 *   readonly pinned: readonly string[],
 *   readonly created: readonly string[],
 *   readonly install: boolean,
 * }} repo the templates and the core to place; the repo's languages; the text of each file that exists; the files whose block the lock pins, and the files it records as created, both empty on `install`; and whether this is `install`
 * @returns {Placement}
 */
export const placement = ({
  templates,
  core,
  languages,
  contents,
  pinned,
  created,
  install,
}) => {
  const placed = targets(
    renderBlocks(templates, core, languages),
    contents,
    pinned,
  ).map(([file, block]) => {
    const text = contents.get(file) ?? "";
    const { span, errors, unclosed } = scanBlocks(file, text);
    const problems =
      errors.length > 0 || span !== undefined || unclosed === undefined
        ? errors
        : [`${unclosed}, so a block added at its end would sit inside it.`];
    return { file, block, text: withBlock(text, block), problems };
  });
  const problems = placed.flatMap((one) => one.problems);
  if (problems.length > 0) return { kind: "refuse", problems };

  const seedClaude = install && !contents.has(CLAUDE_FILE);
  const seedLocal = install && !contents.has(LOCAL_FILE);
  /** @type {readonly (readonly [string, string])[]} */
  const seeds = [
    ...(seedClaude ? [CLAUDE_FILE] : []),
    ...(seedLocal ? [LOCAL_FILE] : []),
  ].map((file) => [file, template(templates, file)]);
  const agents = placed.find(({ file }) => file === AGENTS_FILE)?.text;
  const warning = sizeWarning(agents);
  return {
    kind: "place",
    write: new Map([
      ...placed.flatMap(({ file, text }) =>
        contents.get(file) === text
          ? []
          : [/** @type {const} */ ([file, text])],
      ),
      ...seeds,
    ]),
    blocks: new Map(placed.map(({ file, block }) => [file, block])),
    created: [
      ...new Set([
        ...created,
        ...placed.flatMap(({ file }) => (contents.has(file) ? [] : [file])),
        ...(seedClaude ? [CLAUDE_FILE] : []),
      ]),
    ].sort(),
    lines: seedClaude ? [{ file: CLAUDE_FILE, line: AGENTS_IMPORT }] : [],
    warnings: warning === undefined ? [] : [warning],
  };
};

/**
 * What taking ogham out of the files outside `.ogham/` comes to: each file's
 * text without its ogham block and without the lines the lock records for
 * it. A file the adoption created that then holds nothing but blank lines is
 * removed instead. `ogham.local.md` is never touched.
 * @param {{
 *   readonly contents: ReadonlyMap<string, string>,
 *   readonly pinned: readonly string[],
 *   readonly created: readonly string[],
 *   readonly lines: readonly AddedLine[],
 * }} repo the text of each file that exists; the files whose block the lock pins; the files it records as created; and the lines it records
 * @returns {Removal}
 */
export const removal = ({ contents, pinned, created, lines }) => {
  const withBlocks = [...new Set([...BLOCK_FILES, ...pinned])];
  const files = [
    ...new Set([...withBlocks, ...lines.map(({ file }) => file)]),
  ].filter((file) => file !== LOCAL_FILE);
  const results = files.flatMap((file) => {
    const text = contents.get(file);
    if (text === undefined) return [];
    const { errors } = withBlocks.includes(file)
      ? scanBlocks(file, text)
      : { errors: [] };
    const rest = lines
      .filter((line) => line.file === file)
      .reduce(
        (kept, { line }) => withoutLine(kept, line),
        errors.length > 0 ? text : withoutBlock(text),
      );
    const emptied = created.includes(file) && rest.trim() === "";
    return [{ file, text, rest, errors, emptied }];
  });
  const problems = results.flatMap(({ errors }) => errors);
  if (problems.length > 0) return { kind: "refuse", problems };

  return {
    kind: "remove",
    write: new Map(
      results.flatMap(({ file, text, rest, emptied }) =>
        emptied || rest === text ? [] : [/** @type {const} */ ([file, rest])],
      ),
    ),
    remove: results.flatMap(({ file, emptied }) => (emptied ? [file] : [])),
  };
};
