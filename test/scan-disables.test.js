// The comment scanner behind `check`: it finds every comment that turns lint
// off without a reason, reading the text directly, so a blanket disable that
// silences ESLint's own report is still caught. It has to agree with ESLint
// on what a directive is, and with the inline rule on which ones lack a
// reason.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Linter } from "eslint";

import preset from "../standard/coding/eslint/index.mjs";
import { lintOff } from "../standard/coding/eslint/disable-needs-reason.mjs";
import { comments, scanDisables } from "../src/scan-disables.mjs";

const linter = new Linter({ configType: "flat" });

/**
 * The label of each reasonless lint-off comment the scanner finds.
 * @param {string} text
 */
const labels = (text) => scanDisables(text).map((found) => found.label);

test("a blanket disable with no reason is caught, though it silences the lint rule", () => {
  const code =
    "/* eslint-disable */\nexport function f(state) { state.n = 1; }\n";

  assert.deepEqual(linter.verify(code, preset, "src/example.js"), []);
  assert.deepEqual(scanDisables(code), [
    { line: 1, column: 1, label: "eslint-disable" },
  ]);
});

test("a disable that names ogham/disable-needs-reason itself is caught", () => {
  const code =
    "/* eslint-disable ogham/disable-needs-reason */\n// eslint-disable-next-line ogham/no-param-reassign\nexport const one = 1;\n";

  assert.deepEqual(labels(code), [
    "eslint-disable",
    "eslint-disable-next-line",
  ]);
});

test("a reasonless disable for a repo's own rule is reported by the lint rule and by the scanner", () => {
  const code = "// eslint-disable-next-line no-console\nconsole.log('x');\n";
  /** @type {import("eslint").Linter.Config[]} */
  const withRepoRule = [...preset, { rules: { "no-console": "error" } }];

  assert.deepEqual(
    linter
      .verify(code, withRepoRule, "src/example.js")
      .map((message) => [message.ruleId, message.line]),
    [["ogham/disable-needs-reason", 1]],
  );
  assert.deepEqual(scanDisables(code), [
    { line: 1, column: 1, label: "eslint-disable-next-line" },
  ]);
});

test("every form that turns lint off is found, with its position", () => {
  const code = [
    "const a = 1; // eslint-disable-line no-unused-vars",
    "  /* eslint-disable-next-line no-unused-vars */",
    "const b = 2;",
    "/* eslint no-unused-vars: 'off' */",
    "/*eslint-disable no-unused-vars*/",
  ].join("\n");

  assert.deepEqual(scanDisables(code), [
    { line: 1, column: 14, label: "eslint-disable-line" },
    { line: 2, column: 3, label: "eslint-disable-next-line" },
    { line: 4, column: 1, label: "eslint" },
    { line: 5, column: 1, label: "eslint-disable" },
  ]);
});

test("a comment with a reason is accepted, and one whose dashes are not set apart is not", () => {
  assert.deepEqual(
    labels(
      "// eslint-disable-next-line no-console -- og-thin-effects: logs the retry; the caller cannot\n",
    ),
    [],
  );
  assert.deepEqual(
    labels("/* eslint-disable no-console -- the whole file is a CLI */\n"),
    [],
  );
  assert.deepEqual(labels("// eslint-disable-next-line no-console --\n"), [
    "eslint-disable-next-line",
  ]);
  assert.deepEqual(
    labels("// eslint-disable-next-line no-console --because\n"),
    ["eslint-disable-next-line"],
  );
});

test("comments that turn nothing off are left alone", () => {
  for (const code of [
    "// eslint-disable no-console",
    "/* eslint-enable no-console */",
    "/** eslint-disable no-console */",
    "// a note about eslint-disable-next-line",
    "/* global window */",
    "#!/usr/bin/env node\n// plain",
  ]) {
    assert.deepEqual(labels(code), [], code);
  }
});

test("text that only looks like a comment is not scanned: strings, templates and regular expressions", () => {
  for (const code of [
    'const a = "// eslint-disable-next-line no-console";',
    "const a = '/* eslint-disable */';",
    "const a = `/* eslint-disable */ ${b} // eslint-disable-line`;",
    "const a = `${`/* eslint-disable */`}`;",
    "const a = /\\/\\* eslint-disable \\*\\//.test(b);",
    "const a = b.replace(/[/*]/g, '/* eslint-disable */');",
    "const a = b ? /'/ : 1; const c = '/* eslint-disable */';",
    "const a = 'it\\'s /* eslint-disable */';",
  ]) {
    assert.deepEqual(labels(code), [], code);
  }
});

test("a comment after such text is still found", () => {
  for (const code of [
    'const a = "//"; /* eslint-disable */',
    "const a = `${b}`; /* eslint-disable */",
    "const a = `${ { c: `}` } }`; /* eslint-disable */",
    "const a = b / c; /* eslint-disable */ const d = e / f;",
    "const a = /[/]/.test(b); /* eslint-disable */",
    "const a = x.map((y) => y / 2); // eslint-disable-line",
  ]) {
    assert.equal(labels(code).length, 1, code);
  }
});

test("text that stops mid-token is read to its end", () => {
  for (const code of [
    "/* eslint-disable",
    "const a = `${b",
    "const a = 'open",
    "const a = /open",
    "const a = `open",
    "//",
    "#!",
    "}}}",
  ]) {
    assert.doesNotThrow(() => comments(code), code);
  }
  assert.deepEqual(labels("/* eslint-disable"), ["eslint-disable"]);
});

test("the scanner reads comments as ESLint's parser does", () => {
  const code = [
    "#!/usr/bin/env node",
    "// one",
    "const a = 1; /* two */ const b = `x ${a /* three */} y`; // four",
    "/* five",
    "   six */",
    "const c = a / 2; // seven",
  ].join("\n");
  /** @type {{ type: string, value: string }[]} */
  const seen = [];
  /** @type {import("eslint").Linter.Config} */
  const probe = {
    plugins: {
      probe: {
        rules: {
          comments: {
            /** @param {import("eslint").Rule.RuleContext} context */
            create: (context) => ({
              Program: () => {
                seen.push(
                  ...context.sourceCode
                    .getAllComments()
                    .map(({ type, value }) => ({ type, value })),
                );
              },
            }),
          },
        },
      },
    },
    rules: { "probe/comments": "error" },
  };

  assert.deepEqual(linter.verify(code, [probe], "src/example.js"), []);
  assert.deepEqual(
    comments(code).map(({ type, value }) => ({ type, value })),
    seen.filter((comment) => comment.type !== "Shebang"),
  );
});

test("what the scanner calls a lint-off comment is what ESLint honours", () => {
  /** @type {import("eslint").Linter.Config[]} */
  const config = [{ rules: { "no-debugger": "error" } }];

  for (const [code, honoured] of /** @type {const} */ ([
    ["/* eslint-disable no-debugger */\ndebugger;", true],
    ["/*eslint-disable no-debugger*/\ndebugger;", true],
    ["// eslint-disable no-debugger\ndebugger;", false],
    ["/** eslint-disable no-debugger */\ndebugger;", false],
    ["debugger; // eslint-disable-line no-debugger", true],
    ["debugger; /* eslint-disable-line no-debugger */", true],
    ["// eslint-disable-next-line no-debugger\ndebugger;", true],
    ["/* eslint-disable-next-line no-debugger */\ndebugger;", true],
    ['/* eslint no-debugger: "off" */\ndebugger;', true],
    ["/* eslint-enable no-debugger */\ndebugger;", false],
    ["// eslint-disable-next-line no-debugger -- stops here\ndebugger;", true],
  ])) {
    const silenced = linter.verify(code, config, "src/example.js").length === 0;
    const [comment] = comments(code);

    assert.equal(silenced, honoured, code);
    assert.equal(comment && lintOff(comment) !== undefined, honoured, code);
  }
});
