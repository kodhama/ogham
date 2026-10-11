// Structure checks for the coding standard's prose: the always-loaded core,
// the TypeScript page, and the Math Quest rule mapping. Each check is a pure
// function over text, tried first on a small bad example so the check itself
// is known to fire, then on the real file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * One rule entry as `core.md` writes it.
 * @typedef {{ id: string, rule: string, why: string, checkers: readonly string[] }} Rule
 */

const CHECKERS = ["lint", "reviewer", "structure test"];
const WORD_BUDGET = 900;
const MATH_QUEST_RULES = [11, 12, 13, 14, 15, 16];
const MATH_QUEST_IDENTIFIERS = [
  /math[ -]?quest/i,
  /\bMQ-\d+/,
  /shuffleInPlace/,
  /StorageLike/,
  /BootIO/,
  /eventsink/,
];
const TRACKER_REFERENCES = [/\bKOD-\d+/, /\bTRL-\d+/, /\bKTD\d+/];

const ENTRY_START = /^- \*\*`(og-[a-z0-9-]+)`\*\*\s*(.*)$/;
const OG_ID = /(?<![\w-])og-[a-z0-9]+(?:-[a-z0-9]+)*/g;

/**
 * Effect: reads a file of this repo from disk.
 * @param {string} path a path relative to the repo root
 */
const readRepoFile = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * The text after `- <label>:` in an entry's indented lines, or "" when absent.
 * @param {readonly string[]} lines
 * @param {string} label
 */
const field = (lines, label) =>
  lines
    .map((line) => line.trim())
    .find((line) => line.startsWith(`- ${label}:`))
    ?.slice(`- ${label}:`.length)
    .trim() ?? "";

/**
 * Every rule entry in a core document: a top-level bullet opening with a bold
 * `og-` ID, followed by indented `Why:` and `Checked by:` lines.
 * @param {string} text
 * @returns {Rule[]}
 */
const parseRules = (text) =>
  text
    .split(/^(?=- \*\*`og-)/m)
    .filter((block) => ENTRY_START.test(block.split("\n", 1)[0] ?? ""))
    .map((block) => {
      const [head = "", ...rest] = block.split("\n");
      const end = rest.findIndex((line) => /^\S/.test(line));
      const body = end === -1 ? rest : rest.slice(0, end);
      const start = ENTRY_START.exec(head);
      return {
        id: start?.[1] ?? "",
        rule: (start?.[2] ?? "").trim(),
        why: field(body, "Why"),
        checkers: field(body, "Checked by")
          .replace(/\.$/, "")
          .split(",")
          .map((checker) => checker.trim())
          .filter(Boolean),
      };
    });

/**
 * What is wrong with a set of rule entries; empty when nothing is.
 * @param {readonly Rule[]} rules
 */
const ruleProblems = (rules) => [
  ...rules.flatMap((rule) => [
    ...(rule.rule ? [] : [`${rule.id}: no rule text`]),
    ...(rule.why ? [] : [`${rule.id}: no rationale line`]),
    ...(rule.checkers.length > 0 ? [] : [`${rule.id}: no checker`]),
    ...rule.checkers
      .filter((checker) => !CHECKERS.includes(checker))
      .map((checker) => `${rule.id}: unknown checker "${checker}"`),
  ]),
  ...rules
    .map((rule) => rule.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index)
    .map((id) => `${id}: defined twice`),
];

/**
 * Top-level bullets that are not rule entries. In the core, a top-level bullet
 * is a rule, so a rule written without its ID cannot slip past the parser.
 * @param {string} text
 */
const strayBullets = (text) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("- ") && !ENTRY_START.test(line));

/**
 * `og-` IDs a text mentions that the core does not define.
 * @param {string} text
 * @param {readonly string[]} ids
 */
const unknownIds = (text, ids) => [
  ...new Set((text.match(OG_ID) ?? []).filter((id) => !ids.includes(id))),
];

/** @param {string} text */
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/**
 * Tokens shaped like a path into a repo's own source tree.
 * @param {string} text
 */
const repoPaths = (text) =>
  text.match(/(?<![\w./-])(?:src|api|lib|app|tests?|packages)\/[\w./-]*/g) ??
  [];

/**
 * The patterns a text matches, as their source strings.
 * @param {string} text
 * @param {readonly RegExp[]} patterns
 */
const matches = (text, patterns) =>
  patterns.filter((pattern) => pattern.test(text)).map(String);

/**
 * Link targets that are not absolute `https://` URLs, from inline links and
 * from reference definitions.
 * @param {string} text
 */
const relativeLinks = (text) =>
  [
    ...[...text.matchAll(/\]\(\s*([^)\s]+)/g)].map((match) => match[1] ?? ""),
    ...[...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)].map(
      (match) => match[1] ?? "",
    ),
  ].filter((target) => !target.startsWith("https://"));

/**
 * The part of a document under one `## ` heading, up to the next one.
 * @param {string} text
 * @param {string} heading
 */
const section = (text, heading) =>
  text.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? "";

/**
 * The body rows of every Markdown table in a text, as trimmed cells.
 * @param {string} text
 */
const tableRows = (text) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\||\|\s*$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)));

/**
 * What is wrong with a Math Quest mapping table: each of rules 11–16 needs a
 * row, and each row needs an ogham rule the core defines or a local-layer
 * entry. Row cells: rule number, clause, ogham rule, Math Quest's local layer.
 * @param {string} text
 * @param {readonly string[]} ids
 */
const mappingProblems = (text, ids) => {
  const rows = tableRows(text).filter((cells) => /^\d+$/.test(cells[0] ?? ""));
  return [
    ...MATH_QUEST_RULES.filter(
      (number) => !rows.some((cells) => cells[0] === String(number)),
    ).map((number) => `rule ${number}: no row`),
    ...rows
      .filter((cells) => {
        const oghamRules = (cells[2] ?? "").match(OG_ID) ?? [];
        const local = (cells[3] ?? "").replace(/^[—–-]$/, "");
        return oghamRules.length === 0 && local === "";
      })
      .map((cells) => `rule ${cells[0]}: "${cells[1]}" maps to nothing`),
    ...unknownIds(text, ids).map((id) => `${id}: not a core rule`),
  ];
};

/**
 * What is wrong with a language page's lint table: each `ogham/*` rule names
 * a core rule, and each core rule that lint checks is named by one.
 * @param {string} text
 * @param {readonly Rule[]} rules
 */
const lintTableProblems = (text, rules) => {
  const rows = tableRows(text).filter((cells) =>
    /^`ogham\/[a-z-]+`$/.test(cells[0] ?? ""),
  );
  const named = rows.flatMap((cells) => cells.join(" ").match(OG_ID) ?? []);
  return [
    ...rows
      .filter((cells) => (cells.join(" ").match(OG_ID) ?? []).length === 0)
      .map((cells) => `${cells[0]}: names no core rule`),
    ...rules
      .filter((rule) => rule.checkers.includes("lint"))
      .filter((rule) => !named.includes(rule.id))
      .map((rule) => `${rule.id}: checked by lint, but no lint rule names it`),
  ];
};

const entry = (id = "og-example", extra = "") =>
  `- **\`${id}\`** Do the thing.\n  - Why: it helps.\n  - Checked by: reviewer.\n${extra}`;

test("the rule checks fire on a bad entry", () => {
  assert.deepEqual(ruleProblems(parseRules(entry())), []);
  assert.deepEqual(
    ruleProblems(parseRules("- **`og-a`** Do it.\n  - Checked by: lint.\n")),
    ["og-a: no rationale line"],
  );
  assert.deepEqual(
    ruleProblems(parseRules("- **`og-a`** Do it.\n  - Why: it helps.\n")),
    ["og-a: no checker"],
  );
  assert.deepEqual(
    ruleProblems(
      parseRules("- **`og-a`** Do it.\n  - Why: x.\n  - Checked by: vibes.\n"),
    ),
    ['og-a: unknown checker "vibes"'],
  );
  assert.deepEqual(
    ruleProblems(parseRules("- **`og-a`**\n  - Why: x.\n  - Checked by: lint.\n")),
    ["og-a: no rule text"],
  );
  assert.deepEqual(ruleProblems(parseRules(entry("og-a") + entry("og-a"))), [
    "og-a: defined twice",
  ]);
});

test("an entry's fields stop at the next unindented line", () => {
  const text = `${entry("og-a").replace("  - Why: it helps.\n", "")}\nA paragraph.\n  - Why: not this entry's.\n`;
  assert.deepEqual(ruleProblems(parseRules(text)), ["og-a: no rationale line"]);
});

test("the text checks fire on bad text", () => {
  assert.deepEqual(strayBullets(`${entry()}- A rule with no ID.\n`), [
    "- A rule with no ID.",
  ]);
  assert.deepEqual(unknownIds("see og-a and og-missing-rule", ["og-a"]), [
    "og-missing-rule",
  ]);
  assert.equal(wordCount("one  two\nthree - `four`"), 5);
  assert.deepEqual(repoPaths("effects live in src/ui/ or api/handlers.ts"), [
    "src/ui/",
    "api/handlers.ts",
  ]);
  assert.deepEqual(repoPaths("read `.ogham/coding/typescript.md`"), []);
  assert.deepEqual(matches("as shuffleInPlace does", MATH_QUEST_IDENTIFIERS), [
    "/shuffleInPlace/",
  ]);
  assert.deepEqual(
    relativeLinks(
      "[a](typescript.md) [b](https://example.com/x) [c](#words)\n[d]: ./rubric.md\n",
    ),
    ["typescript.md", "#words", "./rubric.md"],
  );
});

test("the mapping check fires on a missing or empty row", () => {
  const row = (/** @type {number} */ number, ogham = "`og-a`", local = "—") =>
    `| ${number} | A clause | ${ogham} | ${local} |\n`;
  const head = "| Rule | Clause | Ogham rule | Local layer |\n| - | - | - | - |\n";
  const all = MATH_QUEST_RULES.map((number) => row(number)).join("");
  assert.deepEqual(mappingProblems(head + all, ["og-a"]), []);
  assert.deepEqual(
    mappingProblems(head + all.replace(row(14), ""), ["og-a"]),
    ["rule 14: no row"],
  );
  assert.deepEqual(mappingProblems(head + all + row(15, "—", "—"), ["og-a"]), [
    'rule 15: "A clause" maps to nothing',
  ]);
  assert.deepEqual(
    mappingProblems(head + all + row(16, "—", "The shell paths"), ["og-a"]),
    [],
  );
  assert.deepEqual(mappingProblems(head + all + row(11, "`og-b`"), ["og-a"]), [
    "og-b: not a core rule",
  ]);
});

test("the lint table check fires on an unmapped rule", () => {
  /** @type {Rule[]} */
  const rules = [
    { id: "og-a", rule: "x", why: "y", checkers: ["lint", "reviewer"] },
    { id: "og-b", rule: "x", why: "y", checkers: ["reviewer"] },
  ];
  const head = "| Lint rule | Core rule |\n| - | - |\n";
  assert.deepEqual(
    lintTableProblems(`${head}| \`ogham/no-x\` | \`og-a\` |\n`, rules),
    [],
  );
  assert.deepEqual(
    lintTableProblems(`${head}| \`ogham/no-x\` | none yet |\n`, rules),
    [
      "`ogham/no-x`: names no core rule",
      "og-a: checked by lint, but no lint rule names it",
    ],
  );
});

const core = readRepoFile("standard/coding/core.md");
const typescriptPage = readRepoFile("standard/coding/typescript.md");
const mapping = readRepoFile("docs/mq-rule-mapping.md");
const rules = parseRules(core);
const ids = rules.map((rule) => rule.id);

test("every core rule has an og- ID, a rule, a rationale and a known checker", () => {
  assert.ok(rules.length > 0, "core.md defines no rule");
  assert.deepEqual(ruleProblems(rules), []);
  assert.deepEqual(strayBullets(core), []);
  assert.deepEqual(unknownIds(core, ids), []);
});

test("the core stays within its word budget", () => {
  const words = wordCount(core);
  assert.ok(words <= WORD_BUDGET, `core.md has ${words} words`);
});

test("the core reads the same inlined into any repo", () => {
  assert.deepEqual(repoPaths(core), []);
  assert.deepEqual(matches(core, MATH_QUEST_IDENTIFIERS), []);
  assert.deepEqual(matches(core, TRACKER_REFERENCES), []);
  assert.deepEqual(relativeLinks(core), []);
});

test("a section is the text under its own heading only", () => {
  const text = "# Title\n\n## One\n\na\n\n## Two\n\nb\n";
  assert.equal(section(text, "Two"), "Two\n\nb\n");
  assert.equal(section(text, "Three"), "");
});

test("the TypeScript page cites only core rules and maps every linted one", () => {
  assert.deepEqual(unknownIds(typescriptPage, ids), []);
  assert.deepEqual(lintTableProblems(typescriptPage, rules), []);
  assert.deepEqual(repoPaths(typescriptPage), []);
  assert.deepEqual(matches(typescriptPage, MATH_QUEST_IDENTIFIERS), []);
  assert.deepEqual(matches(typescriptPage, TRACKER_REFERENCES), []);
});

test("every Math Quest rule 11–16 maps to a core rule or to its local layer", () => {
  const table = section(mapping, "Rule by rule");
  assert.ok(table, "the mapping has no \"Rule by rule\" section");
  assert.deepEqual(mappingProblems(table, ids), []);
  assert.deepEqual(unknownIds(mapping, ids), []);
});
