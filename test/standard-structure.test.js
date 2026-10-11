// Structure checks for the coding standard's prose: the always-loaded core,
// its sources page, the TypeScript page, and the Math Quest rule mapping. Each check is a pure
// function over text, tried first on a small bad example so the check itself
// is known to fire, then on the real file.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ENTRY_START,
  HARNESS_WORDING,
  MATH_QUEST_IDENTIFIERS,
  OG_ID,
  TRACKER_REFERENCES,
  matches,
  parseRules,
  readRepoFile,
  repoPaths,
  section,
  unknownIds,
} from "./helpers/standard-text.js";

/** @typedef {import("./helpers/standard-text.js").Rule} Rule */

const CHECKERS = ["lint", "reviewer", "structure test"];
const WORD_BUDGET = 900;
const MATH_QUEST_RULES = [11, 12, 13, 14, 15, 16];

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
 * Top-level list items that are not rule entries, whatever their marker. In
 * the core a top-level list item is a rule, so one written without its ID is
 * reported. A rule written as a paragraph is the reviewer's to catch.
 * @param {string} text
 */
const strayBullets = (text) =>
  text
    .split("\n")
    .filter(
      (line) => /^(?:[-*+]|\d+[.)]) /.test(line) && !ENTRY_START.test(line),
    );

/** @param {string} text */
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/**
 * What is wrong with a text's length; empty when it fits the budget.
 * @param {string} text
 * @param {number} budget
 */
const budgetProblems = (text, budget) =>
  wordCount(text) <= budget
    ? []
    : [`${wordCount(text)} words, over the budget of ${budget}`];

/**
 * Link targets that are not absolute `https://` URLs, from inline links,
 * reference definitions and HTML `href` attributes.
 * @param {string} text
 */
const relativeLinks = (text) =>
  [
    /\]\(\s*([^)\s]+)/g,
    /^ {0,3}\[[^\]]+\]:\s*(\S+)/gm,
    /href\s*=\s*["']?([^"'\s>]+)/g,
  ]
    .flatMap((pattern) => [...text.matchAll(pattern)])
    .map((match) => match[1] ?? "")
    .filter((target) => !target.startsWith("https://"));

/** @param {readonly string[]} cells */
const isSeparator = (cells) => cells.every((cell) => /^:?-+:?$/.test(cell));

/**
 * The body rows of every Markdown table in a text, as trimmed cells: neither
 * a header row nor the separator under it.
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
    .filter(
      (cells, index, rows) =>
        !isSeparator(cells) && !isSeparator(rows[index + 1] ?? [""]),
    );

/** @param {string} cell */
const isEmptyCell = (cell) => /^(?:[—–-]|n\/a|none)?$/i.test(cell);

/**
 * What is wrong with a Math Quest mapping table: each of rules 11–16 needs a
 * row, and each row needs an ogham rule the core defines or a local-layer
 * entry. Row cells: rule number, clause, ogham rule, Math Quest's local layer.
 * @param {string} text
 * @param {readonly string[]} ids
 */
const mappingProblems = (text, ids) => {
  const rows = tableRows(text);
  const numbers = MATH_QUEST_RULES.map(String);
  return [
    ...rows
      .filter((cells) => !numbers.includes(cells[0] ?? ""))
      .map((cells) => `row "${cells[0]}": not one of rules 11–16`),
    ...numbers
      .filter((number) => !rows.some((cells) => cells[0] === number))
      .map((number) => `rule ${number}: no row`),
    ...rows
      .filter(
        (cells) =>
          ((cells[2] ?? "").match(OG_ID) ?? []).length === 0 &&
          isEmptyCell(cells[3] ?? ""),
      )
      .map((cells) => `rule ${cells[0]}: "${cells[1]}" maps to nothing`),
    ...unknownIds(text, ids).map((id) => `${id}: not a core rule`),
  ];
};

/**
 * What is wrong with a language page's lint table. Each row opens with an
 * `ogham/*` rule in backticks and names at least one `og-` ID; a core rule is
 * named there exactly when the core says lint checks it.
 * @param {string} text
 * @param {readonly Rule[]} rules
 */
const lintTableProblems = (text, rules) => {
  const rows = tableRows(text).filter((cells) =>
    (cells[0] ?? "").includes("ogham/"),
  );
  const named = rows.flatMap((cells) => cells.join(" ").match(OG_ID) ?? []);
  const linted = rules
    .filter((rule) => rule.checkers.includes("lint"))
    .map((rule) => rule.id);
  return [
    ...rows
      .filter((cells) => !/^`ogham\/[a-z-]+`$/.test(cells[0] ?? ""))
      .map((cells) => `row "${cells[0]}": not a lint rule in backticks`),
    ...rows
      .filter((cells) => (cells.join(" ").match(OG_ID) ?? []).length === 0)
      .map((cells) => `${cells[0]}: names no core rule`),
    ...linted
      .filter((id) => !named.includes(id))
      .map((id) => `${id}: checked by lint, but no lint rule names it`),
    ...[...new Set(named)]
      .filter((id) => rules.some((rule) => rule.id === id))
      .filter((id) => !linted.includes(id))
      .map((id) => `${id}: named by a lint rule, but not checked by lint`),
  ];
};

/**
 * The names a sources page defines: the bold text that opens each bullet,
 * without its closing full stop.
 * @param {string} text
 */
const sourceNames = (text) =>
  [...text.matchAll(/^- \*\*(.+?)\.?\*\*/gm)].map((match) => match[1] ?? "");

/**
 * The author-and-year citations in a text, as "Name 2012": it reads
 * "Name 2012", "Name et al. 2012", "One and Two 2012" and "Name (2012)".
 * A citation with no year, such as a guideline's title, is not found here;
 * `citationProblems` only checks that each such source is named in the text.
 * @param {string} text
 */
const citations = (text) =>
  [
    ...text.matchAll(
      /([A-Z][A-Za-z]+(?: et al\.| and [A-Z][A-Za-z]+)?) \(?((?:19|20)\d{2})\)?/g,
    ),
  ].map((match) => `${match[1]} ${match[2]}`);

/**
 * What is wrong between a text's citations and its sources page: a citation
 * the page lacks, or a source the text never names.
 * @param {string} text
 * @param {string} sources
 */
const citationProblems = (text, sources) => {
  const names = sourceNames(sources);
  const cited = citations(text);
  return [
    ...cited
      .filter((citation) => !names.includes(citation))
      .map((citation) => `${citation}: cited, but not a source`),
    ...names
      .filter((name) => !cited.includes(name) && !text.includes(name))
      .map((name) => `${name}: a source nothing cites`),
  ];
};

const entry = (id = "og-example") =>
  `- **\`${id}\`** Do the thing.\n  - Why: it helps.\n  - Checked by: reviewer.\n`;

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
  assert.deepEqual(
    strayBullets(`${entry()}- No ID.\n* No ID.\n1. No ID.\n  - Why: nested.\n`),
    ["- No ID.", "* No ID.", "1. No ID."],
  );
  assert.deepEqual(unknownIds("see og-a and og-missing-rule", ["og-a"]), [
    "og-missing-rule",
  ]);
  assert.equal(wordCount("one  two\nthree - `four`"), 5);
  assert.deepEqual(budgetProblems("one two three", 3), []);
  assert.deepEqual(budgetProblems("one two three four", 3), [
    "4 words, over the budget of 3",
  ]);
  assert.deepEqual(
    repoPaths("in src/ui/ or api/handlers.ts, ./src/boot.ts, client/src/a.ts"),
    ["src/ui/", "api/handlers.ts", "src/boot.ts", "client/src/a.ts"],
  );
  assert.deepEqual(repoPaths("see docs/plan.md and scripts/build.sh"), [
    "docs/plan.md",
    "scripts/build.sh",
  ]);
  assert.deepEqual(
    repoPaths("standard/coding/core.md, bin/ogham.mjs, .github/workflows/x.yml"),
    ["standard/coding/core.md", "bin/ogham.mjs", ".github/workflows/x.yml"],
  );
  assert.deepEqual(matches("see R14, D27 and U5", TRACKER_REFERENCES), [
    String(TRACKER_REFERENCES[2]),
  ]);
  assert.deepEqual(matches("ES2022 and DOI 10.1007", TRACKER_REFERENCES), []);
  assert.deepEqual(
    repoPaths("read `.ogham/coding/typescript.md` or <https://example.com/docs/x>"),
    [],
  );
  assert.deepEqual(matches("as shuffleInPlace does", MATH_QUEST_IDENTIFIERS), [
    "/shuffleInPlace/",
  ]);
  assert.deepEqual(matches("run `/code-review` in Claude Code", HARNESS_WORDING), [
    "/claude/i",
  ]);
  assert.deepEqual(matches("a reviewing agent or a person", HARNESS_WORDING), []);
  assert.deepEqual(
    relativeLinks(
      '[a](typescript.md) [b](https://example.com/x) [c](#words)\n   [d]: ./rubric.md\n<a href="core.md">e</a>\n',
    ),
    ["typescript.md", "#words", "./rubric.md", "core.md"],
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
  assert.deepEqual(mappingProblems(head + all + row(15, "—", "n/a"), ["og-a"]), [
    'rule 15: "A clause" maps to nothing',
  ]);
  assert.deepEqual(mappingProblems(head + all + row(11, "`og-b`"), ["og-a"]), [
    "og-b: not a core rule",
  ]);
  assert.deepEqual(
    mappingProblems(`${head}${all}| 11a | A clause | — | — |\n`, ["og-a"]),
    ['row "11a": not one of rules 11–16', 'rule 11a: "A clause" maps to nothing'],
  );
});

test("the lint table check fires on an unmapped rule", () => {
  /** @type {readonly Rule[]} */
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
  assert.deepEqual(
    lintTableProblems(`${head}| \`ogham/no-x\` | \`og-a\`, \`og-b\` |\n`, rules),
    ["og-b: named by a lint rule, but not checked by lint"],
  );
  assert.deepEqual(
    lintTableProblems(`${head}| ogham/no-x | \`og-a\` |\n`, rules),
    ['row "ogham/no-x": not a lint rule in backticks'],
  );
});

test("the citation check fires on a missing or unused source", () => {
  const sources =
    "- **Hughes 1990.** A paper.\n- **Selby et al. 2007.** A study.\n- **Swift API Design Guidelines.** A guide.\n";
  const text =
    "It helps (Hughes 1990; Selby et al. 2007; Swift API Design Guidelines).";
  assert.deepEqual(citationProblems(text, sources), []);
  assert.deepEqual(citationProblems(`${text} Fowler (2003) agrees.`, sources), [
    "Fowler 2003: cited, but not a source",
  ]);
  assert.deepEqual(citationProblems("It helps (Hughes 1990).", sources), [
    "Selby et al. 2007: a source nothing cites",
    "Swift API Design Guidelines: a source nothing cites",
  ]);
  assert.deepEqual(citations("Eyolfson and Lam 2019 say so"), [
    "Eyolfson and Lam 2019",
  ]);
});

const core = readRepoFile("standard/coding/core.md");
const sourcesPage = readRepoFile("standard/coding/sources.md");
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
  assert.deepEqual(budgetProblems(core, WORD_BUDGET), []);
});

test("the core reads the same inlined into any repo", () => {
  assert.deepEqual(repoPaths(core), []);
  assert.deepEqual(matches(core, MATH_QUEST_IDENTIFIERS), []);
  assert.deepEqual(matches(core, TRACKER_REFERENCES), []);
  assert.deepEqual(matches(core, HARNESS_WORDING), []);
  assert.deepEqual(relativeLinks(core), []);
});

test("every source the core cites is on the sources page, and no other", () => {
  assert.ok(core.includes("`.ogham/coding/sources.md`"));
  assert.deepEqual(citationProblems(core, sourcesPage), []);
  assert.deepEqual(matches(sourcesPage, MATH_QUEST_IDENTIFIERS), []);
  assert.deepEqual(matches(sourcesPage, TRACKER_REFERENCES), []);
  assert.deepEqual(matches(sourcesPage, HARNESS_WORDING), []);
  assert.deepEqual(repoPaths(sourcesPage), []);
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
  assert.deepEqual(matches(typescriptPage, HARNESS_WORDING), []);
});

test("every Math Quest rule 11–16 maps to a core rule or to its local layer", () => {
  const table = section(mapping, "Rule by rule");
  assert.ok(table, "the mapping has no \"Rule by rule\" section");
  assert.deepEqual(mappingProblems(table, ids), []);
  assert.deepEqual(unknownIds(mapping, ids), []);
});
