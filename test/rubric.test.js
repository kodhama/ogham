// Structure checks for the review rubric: one check per core rule, the
// exception and local-layer sections, and the finding format. Each check is a
// pure function over text, tried first on a small bad example so the check
// itself is known to fire, then on the real file.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  field,
  parseEntries,
  parseRules,
  portabilityProblems,
  readRepoFile,
  section,
  strayBullets,
  unknownIds,
} from "./helpers/standard-text.js";

/** @typedef {import("./helpers/standard-text.js").Rule} Rule */

/**
 * One check as `rubric.md` writes it: the rule it grades, what to look for in
 * a diff, and what lint already covers.
 * @typedef {{ readonly id: string, readonly lookFor: string, readonly lint: string }} Check
 */

/**
 * Something a section has to tell the reviewer: its name, and the patterns
 * one line of the section must all match.
 * @typedef {{ readonly name: string, readonly patterns: readonly RegExp[] }} Obligation
 */

const FINDING_FIELDS = ["Rule", "Location", "Evidence", "Exemption"];

// The obligation lists are presence tripwires: they catch a line that was
// deleted, not one that was reworded to say something else. Whether a line
// says what the core says is for the reviewer of a change to judge.

/** @type {readonly Obligation[]} */
const OPENING_OBLIGATIONS = [
  {
    name: "the core is the standard",
    patterns: [/`\.ogham\/coding\/core\.md`/, /standard/],
  },
  { name: "the repo's reviewer runs the review", patterns: [/runs no review/] },
];

/** @type {readonly Obligation[]} */
const HOW_TO_USE_OBLIGATIONS = [
  { name: "what is graded", patterns: [/diff/, /adds or edits/] },
  { name: "reading around the diff", patterns: [/surrounding code/] },
  {
    name: "the local layer is read first",
    patterns: [/`ogham\.local\.md`/, /first/i],
  },
  { name: "every check is run", patterns: [/every check/i] },
  { name: "findings use the format", patterns: [/finding format/, /rule ID/] },
  {
    name: "the line is graded before the function",
    patterns: [
      /`og-no-hidden-inputs`/,
      /`og-return-new-values`/,
      /`og-mark-effects`/,
      /`og-thin-effects`/,
    ],
  },
  { name: "what lint is trusted for", patterns: [/lint/i, /cannot see/] },
];

/** @type {readonly Obligation[]} */
const EXCEPTION_OBLIGATIONS = [
  {
    name: "a complete exception covers its breach",
    patterns: [/complete/, /covers/, /finding/],
  },
  {
    name: "the exception comment's shape",
    patterns: [/og-<id>: <effect>; <reason>/],
  },
  {
    name: "the lint disable form",
    patterns: [/lint reports the line/i, /disable comment/],
  },
  {
    name: "the plain comment form",
    patterns: [/lint does not report the line/i, /plain comment/],
  },
  { name: "the parts are true", patterns: [/three parts/i, /true/] },
  {
    name: "a marked mutator needs no comment and no benchmark",
    patterns: [/marked mutator/, /no (?:exception )?comment/, /benchmark/],
  },
  {
    name: "an exception does not replace the markers",
    patterns: [/exception/, /markers/, /`og-mark-effects`/],
  },
  {
    name: "the edge's own read",
    patterns: [/edge's own read/, /not an exception/],
  },
  {
    name: "an exemption's reach",
    patterns: [/exemption covers/, /scope/],
  },
  {
    name: "exemptions live in the local layer's file",
    patterns: [/named exemption/, /`ogham\.local\.md`/],
  },
  {
    name: "an exemption entry's parts",
    patterns: [/entry names/, /rule ID/, /scope/, /reason/],
  },
  {
    name: "a lint loosening needs an entry",
    patterns: [/lint config/, /entry/, /finding/],
  },
];

/** @type {readonly Obligation[]} */
const LOCAL_LAYER_OBLIGATIONS = [
  { name: "the local layer's file", patterns: [/`ogham\.local\.md`/] },
  { name: "local rules", patterns: [/`local-` rule/, /cite/] },
  { name: "tightenings", patterns: [/tightening/, /stricter/] },
  {
    name: "exemptions",
    patterns: [/exemption/, /scope/, /(?:no|not a) finding/],
  },
];

/**
 * Every check in a rubric's checks section: an entry with an indented
 * `Lint:` line.
 * @param {string} text
 * @returns {readonly Check[]}
 */
const parseChecks = (text) =>
  parseEntries(text).map((entry) => ({
    id: entry.id,
    lookFor: entry.text,
    lint: field(entry.body, "Lint"),
  }));

/** @param {string} lint a check's lint line */
const saysNoLint = (lint) => /^none\b/i.test(lint);

/**
 * What is wrong between a rubric's checks and the core's rules: a rule with
 * no check, a check for no rule, a check that lacks a part, checks out of the
 * core's order, or a lint line that disagrees with the core on whether lint
 * checks the rule.
 * @param {readonly Check[]} checks
 * @param {readonly Rule[]} rules
 */
const checkProblems = (checks, rules) => {
  const checkIds = checks.map((check) => check.id);
  const ruleIds = rules.map((rule) => rule.id);
  const shared = [...new Set(checkIds)].filter((id) => ruleIds.includes(id));
  return [
    ...ruleIds
      .filter((id) => !checkIds.includes(id))
      .map((id) => `${id}: no check`),
    ...checkIds
      .filter((id) => !ruleIds.includes(id))
      .map((id) => `${id}: not a core rule`),
    ...checkIds
      .filter((id, index) => checkIds.indexOf(id) !== index)
      .map((id) => `${id}: checked twice`),
    ...checks.flatMap((check) => [
      ...(check.lookFor ? [] : [`${check.id}: nothing to look for`]),
      ...(check.lint ? [] : [`${check.id}: no lint line`]),
    ]),
    ...rules.flatMap((rule) => {
      const lint = checks.find((check) => check.id === rule.id)?.lint ?? "";
      const linted = rule.checkers.includes("lint");
      return !lint || linted !== saysNoLint(lint)
        ? []
        : [
            linted
              ? `${rule.id}: the core says lint checks it, the check says none`
              : `${rule.id}: the check describes lint the core does not name`,
          ];
    }),
    ...(shared.join() === ruleIds.filter((id) => shared.includes(id)).join()
      ? []
      : ["the checks are not in the core's order"]),
  ];
};

/**
 * The obligations a section does not meet: those with no single line that
 * matches all of their patterns.
 * @param {string} text
 * @param {readonly Obligation[]} obligations
 */
const missingObligations = (text, obligations) =>
  obligations
    .filter(
      (obligation) =>
        !text
          .split("\n")
          .some((line) =>
            obligation.patterns.every((pattern) => pattern.test(line)),
          ),
    )
    .map((obligation) => obligation.name);

/**
 * The fields a finding format names: the bold label that opens each bullet.
 * @param {string} text
 */
const findingFields = (text) =>
  [...text.matchAll(/^- \*\*([^*:]+):\*\*/gm)].map((match) => match[1] ?? "");

/**
 * The field labels of a finding format's worked example: the word that opens
 * each line of its fenced block.
 * @param {string} text
 */
const exampleFields = (text) =>
  [
    ...(/^```text\n([\s\S]*?)^```/m.exec(text)?.[1] ?? "").matchAll(
      /^([A-Z][a-z]+):/gm,
    ),
  ].map((match) => match[1] ?? "");

/**
 * What is wrong with a finding format: a missing or extra field, a rule field
 * that does not ask for a rule ID, or an example that uses other fields.
 * @param {string} text
 */
const findingFormatProblems = (text) => [
  ...FINDING_FIELDS.filter((name) => !findingFields(text).includes(name)).map(
    (name) => `no "${name}" field`,
  ),
  ...findingFields(text)
    .filter((name) => !FINDING_FIELDS.includes(name))
    .map((name) => `"${name}" is not a field of the format`),
  ...(/^- \*\*Rule:\*\*.*`og-`/m.test(text)
    ? []
    : ["the Rule field does not ask for a rule ID"]),
  ...(exampleFields(text).join() === FINDING_FIELDS.join()
    ? []
    : ["the example does not use the format's fields"]),
  ...(/^Rule: (?:og|local)-[a-z0-9-]+$/m.test(text)
    ? []
    : ["the example's rule is not a rule ID"]),
];

/** @type {readonly Rule[]} */
const exampleRules = [
  { id: "og-a", rule: "x", why: "y", checkers: ["lint", "reviewer"] },
  { id: "og-b", rule: "x", why: "y", checkers: ["reviewer"] },
];

const check = (id = "og-a", lint = "reports the common spellings.") =>
  `- **\`${id}\`** Code that does the thing.\n  - Lint: ${lint}\n`;

test("the check checks fire on a bad set of checks", () => {
  const good = check("og-a") + check("og-b", "none.");
  assert.deepEqual(checkProblems(parseChecks(good), exampleRules), []);
  assert.deepEqual(checkProblems(parseChecks(check("og-a")), exampleRules), [
    "og-b: no check",
  ]);
  assert.deepEqual(
    checkProblems(parseChecks(good + check("og-c", "none.")), exampleRules),
    ["og-c: not a core rule"],
  );
  assert.deepEqual(
    checkProblems(parseChecks(good + check("og-b", "none.")), exampleRules),
    ["og-b: checked twice"],
  );
  assert.deepEqual(
    checkProblems(
      parseChecks(`- **\`og-a\`**\n  - Lint: reports it.\n${check("og-b", "none.")}`),
      exampleRules,
    ),
    ["og-a: nothing to look for"],
  );
  assert.deepEqual(
    checkProblems(
      parseChecks(`- **\`og-a\`** Code that does the thing.\n${check("og-b", "none.")}`),
      exampleRules,
    ),
    ["og-a: no lint line"],
  );
  assert.deepEqual(
    checkProblems(
      parseChecks(check("og-a", "none.") + check("og-b", "none.")),
      exampleRules,
    ),
    ["og-a: the core says lint checks it, the check says none"],
  );
  assert.deepEqual(
    checkProblems(parseChecks(check("og-a") + check("og-b")), exampleRules),
    ["og-b: the check describes lint the core does not name"],
  );
  assert.deepEqual(
    checkProblems(
      parseChecks(check("og-b", "none.") + check("og-a")),
      exampleRules,
    ),
    ["the checks are not in the core's order"],
  );
});

test("the obligation check fires when no one line says it", () => {
  /** @type {readonly Obligation[]} */
  const obligations = [{ name: "the entry", patterns: [/entry/, /reason/] }];
  assert.deepEqual(
    missingObligations("- The entry gives a reason.\n", obligations),
    [],
  );
  assert.deepEqual(
    missingObligations("- The entry is named.\n- A reason helps.\n", obligations),
    ["the entry"],
  );
  assert.deepEqual(
    missingObligations("", EXCEPTION_OBLIGATIONS),
    EXCEPTION_OBLIGATIONS.map((obligation) => obligation.name),
  );
});

test("the finding format check fires on a missing field", () => {
  const example =
    "\n```text\nRule: og-a\nLocation: a.ts:1\nEvidence: `x.push(y)`: a write.\nExemption: none\n```\n";
  const format = `- **Rule:** the \`og-\` or \`local-\` ID.\n- **Location:** file and line.\n- **Evidence:** the code.\n- **Exemption:** \`none\`.\n${example}`;
  assert.deepEqual(findingFields(format), FINDING_FIELDS);
  assert.deepEqual(exampleFields(format), FINDING_FIELDS);
  assert.deepEqual(findingFormatProblems(format), []);
  assert.deepEqual(
    findingFormatProblems(`- **Severity:** how bad.\n${format}`),
    ['"Severity" is not a field of the format'],
  );
  assert.deepEqual(
    findingFormatProblems(format.replace("Exemption: none\n", "")),
    ["the example does not use the format's fields"],
  );
  assert.deepEqual(
    findingFormatProblems(format.replace("Rule: og-a", "Rule: the first rule")),
    ["the example's rule is not a rule ID"],
  );
  assert.deepEqual(
    findingFormatProblems(format.replace("- **Evidence:** the code.\n", "")),
    ['no "Evidence" field'],
  );
  assert.deepEqual(
    findingFormatProblems(format.replace("the `og-` or `local-` ID", "the rule")),
    ["the Rule field does not ask for a rule ID"],
  );
  assert.deepEqual(findingFormatProblems("- **Location:** file and line.\n"), [
    'no "Rule" field',
    'no "Evidence" field',
    'no "Exemption" field',
    "the Rule field does not ask for a rule ID",
    "the example does not use the format's fields",
    "the example's rule is not a rule ID",
  ]);
});

const rules = parseRules(readRepoFile("standard/coding/core.md"));
const ids = rules.map((rule) => rule.id);
const rubric = readRepoFile("standard/coding/rubric.md");

test("the rubric has one check per core rule and agrees with the core on lint", () => {
  const checks = parseChecks(section(rubric, "Checks, one per core rule"));
  assert.ok(checks.length > 0, "the rubric has no checks section");
  assert.deepEqual(checkProblems(checks, rules), []);
  assert.deepEqual(
    strayBullets(section(rubric, "Checks, one per core rule")),
    [],
  );
});

test("the rubric opens with what it is and how to use it", () => {
  assert.deepEqual(
    missingObligations(rubric.split("\n## ", 1)[0] ?? "", OPENING_OBLIGATIONS),
    [],
  );
  assert.deepEqual(
    missingObligations(section(rubric, "How to use it"), HOW_TO_USE_OBLIGATIONS),
    [],
  );
});

test("the rubric cites only core rules", () => {
  assert.deepEqual(unknownIds(rubric, ids), []);
});

test("the rubric covers both exception forms, exemptions and the local layer", () => {
  assert.deepEqual(
    missingObligations(
      section(rubric, "Exceptions and exemptions"),
      EXCEPTION_OBLIGATIONS,
    ),
    [],
  );
  assert.deepEqual(
    missingObligations(
      section(rubric, "The local layer"),
      LOCAL_LAYER_OBLIGATIONS,
    ),
    [],
  );
});

test("the rubric names the finding format with a rule-ID field", () => {
  const format = section(rubric, "Finding format");
  assert.ok(format, 'the rubric has no "Finding format" section');
  assert.match(format, /^One finding per breach/m);
  assert.deepEqual(findingFormatProblems(format), []);
});

test("the rubric reads the same vendored into any repo", () => {
  assert.deepEqual(portabilityProblems(rubric), []);
});
