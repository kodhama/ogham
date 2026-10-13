// The TypeScript lint preset: each rule fires on the spellings the TypeScript
// page says it sees and stays quiet on the ones the page leaves to the
// reviewer, the preset never touches a repo's own use of the same rules, and
// ogham's own config is wired to it. The rules run in memory through ESLint's
// `Linter`; the wiring checks ask the real config.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint, Linter } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";

import preset, {
  BUILTIN_RULES,
  aliased,
} from "../standard/coding/eslint/index.mjs";
import {
  OG_ID,
  parseRules,
  readRepoFile,
  section,
} from "./helpers/standard-text.js";

const linter = new Linter({ configType: "flat" });

/**
 * The lint messages a config gives for a piece of code.
 * @param {string} code
 * @param {import("eslint").Linter.Config[]} [config]
 * @param {string} [file]
 */
const lint = (code, config = preset, file = "src/example.js") =>
  linter.verify(code, config, file);

/**
 * The rule that raised each message, in order.
 * @param {string} code
 * @param {import("eslint").Linter.Config[]} [config]
 * @param {string} [file]
 */
const ruleIds = (code, config, file) =>
  lint(code, config, file).map((message) => message.ruleId);

/** @type {import("eslint").Linter.Config[]} */
const asModule = [{ languageOptions: { sourceType: "module" } }, ...preset];

test("a write to a parameter is reported as ogham/no-param-reassign", () => {
  for (const write of [
    "state.count = 1;",
    "state.items[0] = 1;",
    "delete state.count;",
    "state = {};",
  ]) {
    assert.deepEqual(
      ruleIds(`export function f(state) { ${write} }`),
      ["ogham/no-param-reassign"],
      write,
    );
  }
});

test("a reduce accumulator is a parameter to lint, whatever it is called", () => {
  assert.deepEqual(
    ruleIds(
      "export const total = (xs) => xs.reduce((sums, x) => { sums.sum += x; return sums; }, { sum: 0 });",
    ),
    ["ogham/no-param-reassign"],
  );
  assert.deepEqual(ruleIds("export function f(acc) { acc.total = 1; }"), [
    "ogham/no-param-reassign",
  ]);
  assert.deepEqual(
    ruleIds(
      "export const byKey = (xs) => xs.reduce((acc, x) => ({ ...acc, [x.k]: x }), {});",
    ),
    [],
  );
});

test("a hidden input spelled as a property is reported, citing og-no-hidden-inputs", () => {
  for (const read of [
    "Date.now()",
    "performance.now()",
    "Math.random()",
    "crypto.getRandomValues(new Uint8Array(1))",
    "process.env",
    'process.env["KEY"]',
    "window.localStorage",
    "window.sessionStorage",
    "globalThis.localStorage",
    "globalThis.sessionStorage",
    "self.localStorage",
    "self.sessionStorage",
  ]) {
    const messages = lint(`export const x = ${read};`);
    assert.deepEqual(
      messages.map((message) => message.ruleId),
      ["ogham/no-restricted-properties"],
      read,
    );
    assert.match(messages[0]?.message ?? "", /og-no-hidden-inputs/, read);
  }
});

test("storage destructured from a global is reported; a field on a passed value is not", () => {
  assert.deepEqual(
    ruleIds("const { localStorage: s } = window; export const g = () => s;"),
    ["ogham/no-restricted-properties"],
  );
  assert.deepEqual(
    ruleIds("export const g = (deps) => deps.localStorage.getItem('grade');"),
    [],
  );
});

test("storage used as a bare global is reported, citing og-no-hidden-inputs", () => {
  for (const use of ["localStorage.getItem('grade')", "sessionStorage"]) {
    const messages = lint(`export const x = ${use};`);
    assert.deepEqual(
      messages.map((message) => message.ruleId),
      ["ogham/no-restricted-globals"],
      use,
    );
    assert.match(messages[0]?.message ?? "", /og-no-hidden-inputs/, use);
  }
});

test("a write through storage is reported like a read: lint cannot tell them apart", () => {
  assert.deepEqual(
    ruleIds(
      "export const saveGrade = (grade) => { localStorage.setItem('grade', grade); };",
    ),
    ["ogham/no-restricted-globals"],
  );
});

test("a clock or environment read spelled as syntax is reported, citing og-no-hidden-inputs", () => {
  for (const read of [
    "new Date()",
    "Date()",
    "import.meta.env.MODE",
    'import.meta["env"].MODE',
  ]) {
    const messages = lint(`export const x = ${read};`, asModule);
    assert.deepEqual(
      messages.map((message) => message.ruleId),
      ["ogham/no-restricted-syntax"],
      read,
    );
    assert.match(messages[0]?.message ?? "", /og-no-hidden-inputs/, read);
  }
});

test("new Date(x) is not reported; Date(x) is, since it ignores its argument and reads the clock", () => {
  assert.deepEqual(
    ruleIds("export const day = (at) => new Date(at).toISOString();"),
    [],
  );
  assert.deepEqual(ruleIds("export const stamp = (at) => Date(at);"), [
    "ogham/no-restricted-syntax",
  ]);
});

test("a top-level let or var is reported, exported or not, citing og-no-module-state", () => {
  for (const state of [
    "let count = 0; export const read = () => count;",
    "export let count = 0;",
    "var count = 0; export const read = () => count;",
    "export var count = 0;",
  ]) {
    const messages = lint(state, asModule);
    assert.deepEqual(
      messages.map((message) => message.ruleId),
      ["ogham/no-restricted-syntax"],
      state,
    );
    assert.match(messages[0]?.message ?? "", /og-no-module-state/, state);
  }
});

test("a let inside a function is not reported, and neither is building a value the function created", () => {
  assert.deepEqual(
    ruleIds(
      "export function f(items) { const out = []; for (const i of items) out.push(i); let n = 0; n += 1; return [...out, n]; }",
    ),
    [],
  );
  assert.deepEqual(
    ruleIds(
      "export const f = (state) => ({ ...state, count: state.count + 1 });",
    ),
    [],
  );
});

test("the spellings the TypeScript page leaves to the reviewer raise no lint error", () => {
  for (const unseen of [
    "export const add = (items, x) => { items.push(x); };",
    "export const set = (cart, x) => { const c = cart; c.total = x; };",
    "export const clear = (order) => { const { lines } = order; lines.length = 0; };",
    "export const zero = (order) => { for (const line of order.lines) line.quantity = 0; };",
    "const clock = Date; export const now = () => clock.now();",
    "export const now = () => globalThis.Date.now();",
    "const cache = new Map(); export const put = (id, price) => cache.set(id, price);",
  ]) {
    assert.deepEqual(ruleIds(unseen, asModule), [], unseen);
  }
});

test("a repo's own use of the same rule reports beside the preset's, and neither replaces the other", () => {
  /** @type {import("eslint").Linter.Config[]} */
  const withRepoRule = [
    ...preset,
    {
      rules: {
        "no-restricted-syntax": [
          "error",
          { selector: "DebuggerStatement", message: "the repo's own rule" },
        ],
        "no-restricted-properties": [
          "error",
          { object: "Object", property: "hasOwn", message: "the repo's own" },
        ],
      },
    },
  ];

  assert.deepEqual(
    ruleIds(
      "let count = 0; debugger; export const at = Date.now(); export const own = Object.hasOwn({}, 'a');",
      withRepoRule,
    ),
    [
      "ogham/no-restricted-syntax",
      "no-restricted-syntax",
      "ogham/no-restricted-properties",
      "no-restricted-properties",
    ],
  );
});

test("a disable comment with no reason is reported, citing og-reasoned-exceptions", () => {
  const messages = lint(
    "export function f(buffer) {\n  // eslint-disable-next-line ogham/no-param-reassign\n  buffer[0] = 1;\n}",
  );

  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.line]),
    [["ogham/disable-needs-reason", 2]],
  );
  assert.match(messages[0]?.message ?? "", /og-reasoned-exceptions/);
});

test("every reasonless comment in a file is reported, not only the first", () => {
  assert.deepEqual(
    lint(
      "export function f(a, b) {\n  // eslint-disable-next-line ogham/no-param-reassign\n  a.n = 1;\n  // eslint-disable-next-line ogham/no-param-reassign\n  b.n = 1;\n}",
    ).map((message) => [message.ruleId, message.line]),
    [
      ["ogham/disable-needs-reason", 2],
      ["ogham/disable-needs-reason", 4],
    ],
  );
});

test("a disable comment with its reason is accepted", () => {
  assert.deepEqual(
    ruleIds(
      "export function f(buffer) {\n  // eslint-disable-next-line ogham/no-param-reassign -- og-return-new-values: writes the sample into the caller's buffer; a copy per sample is too slow\n  buffer[0] = 1;\n}",
    ),
    [],
  );
});

test("the edge's own read, written as the TypeScript page shows it, is accepted", () => {
  assert.deepEqual(
    ruleIds(
      "// eslint-disable-next-line ogham/no-restricted-properties -- og-no-hidden-inputs: reads the clock; this is the edge, and the value is passed in\nconst now = Date.now();\nexport const start = () => now;",
      asModule,
    ),
    [],
  );
});

test("a reasonless disable for a repo's own rule is reported too", () => {
  /** @type {import("eslint").Linter.Config[]} */
  const withRepoRule = [...preset, { rules: { "no-console": "error" } }];

  assert.deepEqual(
    ruleIds(
      "// eslint-disable-next-line no-console\nconsole.log('x');",
      withRepoRule,
    ),
    ["ogham/disable-needs-reason"],
  );
});

test("every comment that turns lint off needs a reason: a range, a line, and a rule set to off for the file", () => {
  for (const comment of [
    "/* eslint-disable ogham/no-param-reassign */",
    "/* eslint ogham/no-param-reassign: 'off' */",
  ]) {
    assert.deepEqual(
      ruleIds(`${comment}\nexport function f(state) { state.count = 1; }`),
      ["ogham/disable-needs-reason"],
      comment,
    );
  }
  assert.deepEqual(
    ruleIds(
      "export function f(state) { state.count = 1; } // eslint-disable-line ogham/no-param-reassign",
    ),
    ["ogham/disable-needs-reason"],
  );
});

test("a blanket disable silences the rule that asks for its reason, which is why the scanner exists", () => {
  assert.deepEqual(
    ruleIds("/* eslint-disable */\nexport function f(state) { state.n = 1; }"),
    [],
  );
});

test("an unused disable directive is an error", () => {
  const messages = lint(
    "// eslint-disable-next-line ogham/no-param-reassign -- og-return-new-values: nothing here writes; left over\nexport const one = 1;",
  );

  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.severity]),
    [[null, 2]],
  );
  assert.match(messages[0]?.message ?? "", /Unused eslint-disable directive/);
});

test("JS and TS source files are checked; test files and declaration files are not", async () => {
  const engine = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,mts,cts,tsx}"],
        languageOptions: { parser: tseslint.parser },
      },
      ...preset,
    ],
  });
  const typed =
    "export function f(state: { count: number }): void { state.count = 1; }\n";
  // No `export`: a `.cjs` file is not a module.
  const plain = "function f(state) { state.count = 1; }\nf({});\n";

  /**
   * @param {string} code
   * @param {string} filePath
   */
  const reported = async (code, filePath) =>
    (await engine.lintText(code, { filePath })).flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    );

  for (const filePath of [
    "src/cart.js",
    "lib/cart.mjs",
    "cart.cjs",
    "app/cart.jsx",
  ]) {
    assert.deepEqual(
      await reported(plain, filePath),
      ["ogham/no-param-reassign"],
      filePath,
    );
  }
  for (const filePath of [
    "src/cart.ts",
    "src/cart.mts",
    "src/cart.cts",
    "src/cart.tsx",
  ]) {
    assert.deepEqual(
      await reported(typed, filePath),
      ["ogham/no-param-reassign"],
      filePath,
    );
  }
  // A name or a folder that only holds the letters of "test" or "spec" is
  // still source.
  for (const filePath of [
    "src/contest.js",
    "src/inspect.js",
    "src/test-utils.js",
    "src/latest/cart.js",
    "src/contests/cart.js",
    "src/testing/cart.js",
  ]) {
    assert.deepEqual(
      await reported(plain, filePath),
      ["ogham/no-param-reassign"],
      filePath,
    );
  }
  for (const filePath of [
    "test/cart.js",
    "tests/unit/cart.js",
    "src/__tests__/cart.js",
    "src/cart.test.js",
    "src/cart.spec.js",
  ]) {
    assert.deepEqual(await reported(plain, filePath), [], filePath);
  }
  for (const filePath of [
    "src/cart.test.ts",
    "src/cart.spec.ts",
    "test/cart.ts",
    "src/globals.d.ts",
    "src/globals.d.mts",
    "src/globals.d.cts",
  ]) {
    assert.deepEqual(await reported(typed, filePath), [], filePath);
  }
});

test("ESLint still provides the four rules the preset registers", () => {
  for (const name of BUILTIN_RULES) {
    assert.ok(
      builtinRules.has(name),
      `eslint/use-at-your-own-risk no longer provides ${name}`,
    );
  }
});

test("the preset names the rule that ESLint stopped providing", () => {
  const without = new Map(
    [...builtinRules].filter(([name]) => name !== "no-restricted-syntax"),
  );

  assert.throws(
    () => aliased(without, BUILTIN_RULES),
    /no-restricted-syntax/,
  );
});

test("the preset's rules are the ones the TypeScript page's lint table lists", () => {
  const table = section(
    readRepoFile("standard/coding/typescript.md"),
    "Lint rules and the core rules they check",
  );
  const listed = [...table.matchAll(/^\| `(ogham\/[a-z-]+)` \|/gm)].map(
    (match) => match[1],
  );

  assert.deepEqual(
    Object.keys(preset[0]?.rules ?? {}).sort(),
    [...listed].sort(),
  );
});

test("every og- ID a lint message cites is a core rule", () => {
  const ids = parseRules(readRepoFile("standard/coding/core.md")).map(
    (rule) => rule.id,
  );
  const cited = JSON.stringify(preset).match(OG_ID) ?? [];

  assert.ok(cited.length > 0);
  assert.deepEqual(
    cited.filter((id) => !ids.includes(id)),
    [],
  );
});

test("ogham's own lint config applies the preset to its source and not to its tests", async () => {
  // The repo's root, so the test finds the config from any directory.
  const engine = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });

  /** @param {string} file */
  const rulesFor = async (file) =>
    /** @type {{ rules?: Record<string, unknown[]> }} */ (
      await engine.calculateConfigForFile(file)
    ).rules ?? {};

  for (const file of [
    "standard/coding/eslint/index.mjs",
    "src/scan-disables.mjs",
  ]) {
    const rules = await rulesFor(file);
    for (const rule of Object.keys(preset[0]?.rules ?? {})) {
      assert.equal(rules[rule]?.[0], 2, `${rule} on ${file}`);
    }
  }
  const onTests = await rulesFor("test/eslint-preset.test.js");
  assert.equal(onTests["ogham/no-param-reassign"], undefined);
});
