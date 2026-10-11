// Structure checks for the review rubric: one check per core rule, the
// exception and local-layer sections, and the finding format. Each check is a
// pure function over text, tried first on a small bad example so the check
// itself is known to fire, then on the real file.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MATH_QUEST_IDENTIFIERS,
  TRACKER_REFERENCES,
  field,
  matches,
  parseEntries,
  parseRules,
  readRepoFile,
  repoPaths,
  section,
  unknownIds,
} from "./helpers/standard-text.js";

/** @typedef {import("./helpers/standard-text.js").Rule} Rule */

/**
 * One check as `rubric.md` writes it: the rule it grades, what to look for in
 * a diff, and what lint already covers.
 * @typedef {{ readonly id: string, readonly lookFor: string, readonly lint: string }} Check
 */

const FINDING_FIELDS = ["Rule", "Location", "Evidence", "Exemption"];
const EXCEPTION_SHAPE = "og-<id>: <effect>; <reason>";

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
 * The fields a finding format names: the bold label that opens each bullet.
 * @param {string} text
 */
const findingFields = (text) =>
  [...text.matchAll(/^- \*\*([^*:]+):\*\*/gm)].map((match) => match[1] ?? "");

/**
 * What is wrong with a finding format: a missing field, or a rule field that
 * does not ask for a rule ID.
 * @param {string} text
 */
const findingFormatProblems = (text) => [
  ...FINDING_FIELDS.filter((name) => !findingFields(text).includes(name)).map(
    (name) => `no "${name}" field`,
  ),
  ...(/^- \*\*Rule:\*\*.*`og-`/m.test(text)
    ? []
    : ["the Rule field does not ask for a rule ID"]),
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

test("the finding format check fires on a missing field", () => {
  const format =
    "- **Rule:** the `og-` or `local-` ID.\n- **Location:** file and line.\n- **Evidence:** the code.\n- **Exemption:** `none`.\n";
  assert.deepEqual(findingFields(format), FINDING_FIELDS);
  assert.deepEqual(findingFormatProblems(format), []);
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
  ]);
});

const rules = parseRules(readRepoFile("standard/coding/core.md"));
const ids = rules.map((rule) => rule.id);
const rubric = readRepoFile("standard/coding/rubric.md");

test("the rubric has one check per core rule and agrees with the core on lint", () => {
  const checks = parseChecks(section(rubric, "Checks, one per core rule"));
  assert.ok(checks.length > 0, "the rubric has no checks section");
  assert.deepEqual(checkProblems(checks, rules), []);
});

test("the rubric cites only core rules", () => {
  assert.deepEqual(unknownIds(rubric, ids), []);
});

test("the rubric covers both exception forms, exemptions and the local layer", () => {
  const exceptions = section(rubric, "Exceptions and exemptions");
  assert.ok(exceptions.includes(EXCEPTION_SHAPE), "no exception comment shape");
  assert.match(exceptions, /disable comment/);
  assert.match(exceptions, /plain comment/);
  assert.ok(exceptions.includes("`ogham.local.md`"), "no exemption check");
  assert.ok(
    section(rubric, "The local layer").includes("`local-`"),
    "the local layer section does not name local rules",
  );
});

test("the rubric names the finding format with a rule-ID field", () => {
  const format = section(rubric, "Finding format");
  assert.ok(format, 'the rubric has no "Finding format" section');
  assert.deepEqual(findingFormatProblems(format), []);
});

test("the rubric reads the same vendored into any repo", () => {
  assert.deepEqual(repoPaths(rubric), []);
  assert.deepEqual(matches(rubric, MATH_QUEST_IDENTIFIERS), []);
  assert.deepEqual(matches(rubric, TRACKER_REFERENCES), []);
});
