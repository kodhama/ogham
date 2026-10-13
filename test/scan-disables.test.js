// The comment scanner behind `check`: it finds every comment that turns lint
// off without a reason, reading the text directly, so a blanket disable that
// silences ESLint's own report is still caught. It has to agree with ESLint
// on what a directive is, and with the inline rule on which ones lack a
// reason.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Linter } from "eslint";
import tseslint from "typescript-eslint";

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
    "#!/usr/bin/env node /* eslint-disable */\n",
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
    "const a = /[/']/.test(b); /* eslint-disable */",
    "const a = <p>don't</p>;\n/* eslint-disable */",
    "const a = x.map((y) => y / 2); // eslint-disable-line",
  ]) {
    assert.equal(labels(code).length, 1, code);
  }
});

test("a slash after a value divides: TypeScript's postfix !, a postfix ++, a keyword used as a property name, and a closing bracket", () => {
  for (const code of [
    "box.mid = width! / 2; // eslint-disable-line",
    "const half = i++ / 2; // eslint-disable-line",
    "const half = i-- / 2; // eslint-disable-line",
    "const half = o.in / 2; // eslint-disable-line",
    "const half = o?.return / 2; // eslint-disable-line",
    "const half = (a + b) / 2; // eslint-disable-line",
    "const half = xs[0] / 2; // eslint-disable-line",
  ]) {
    assert.deepEqual(labels(code), ["eslint-disable-line"], code);
  }
});

test("a slash that follows an operator still opens a regular expression", () => {
  for (const code of [
    "const a = !/'/.test(b); const c = '/* eslint-disable */';",
    "const a = b + /'/.source; const c = '/* eslint-disable */';",
    "const a = typeof /'/; const c = '/* eslint-disable */';",
    "const a = `${/'/.source}`; const c = '/* eslint-disable */';",
  ]) {
    assert.deepEqual(labels(code), [], code);
  }
});

// Each sample is real TypeScript or TSX that an earlier version of the
// scanner misread, or that exercises one of its branches.
const TYPED_SAMPLES = [
  [
    "export function pct(done?: number, total?: number): string {",
    "  return `${Math.round(done! / total! * 100)}%`; // one",
    "}",
    "/* two */",
  ],
  [
    "const html = `<div id=\"root\">${renderToString(<App store={store} />)}</div>`;",
    "/* one */",
  ],
  [
    "export const row = <tr>{cells.map((cell) => <td key={cell.id}>{cell.text}</td>)}</tr>; // one",
    "export const rule = <hr />; /* two */",
    "export const half = <Meter value={total / 2} />; // three",
    "export const el = <p>{half}</p>; /* four */",
    "export const pick = `${ { a: 1 }.a /* five */ }`;",
  ],
  [
    "function label<T extends string>(parts: readonly T[]): string {",
    "  return parts.map((part) => `${part}`).join(`${'/'}`); /* one */",
    "}",
    "// two",
    "const nested = `a ${ { b: `c ${d} e` }.b } f`; /* three */",
    "const ratio = (a + b) / (c[0] / 2); // four",
    "const path = url.replace(/\\/+$/, '').split('/'); // five",
  ],
  [
    "export const hasTick = (s: string): boolean => /`/.test(s); // one",
    "const TICK = `\\``; /* two */",
    "export const isUrl = (s: string) => /^https?:\\/\\//.test(s); // three",
  ],
];

/**
 * The comments typescript-eslint's parser finds in typed code or JSX.
 * @param {string} code
 */
const parsedComments = (code) => {
  const parse =
    /** @type {(code: string, options: object) => { ast: { comments?: readonly { type: string, value: string, range?: readonly number[] }[] } }} */ (
      tseslint.parser.parseForESLint
    );
  const { ast } = parse(code, {
    comment: true,
    range: true,
    ecmaFeatures: { jsx: true },
  });

  return (ast.comments ?? []).map(({ type, value, range }) => ({
    type,
    value,
    start: range?.[0],
  }));
};

test("a slash after each word that expects an expression opens a regular expression", () => {
  for (const code of [
    "function f(b) { return /'/.test(b); } const c = '/* eslint-disable */';",
    "function f() { throw /'/; } const c = '/* eslint-disable */';",
    "switch (true) { case /'/.test(b): break; } const c = '/* eslint-disable */';",
    "if (a) b(); else /'/.test(b); const c = '/* eslint-disable */';",
    "do /'/.test(b); while (a); const c = '/* eslint-disable */';",
    "function* g() { yield /'/; } const c = '/* eslint-disable */';",
    "async function h() { await /'/; } const c = '/* eslint-disable */';",
    "const a = new /'/.constructor('x'); const c = '/* eslint-disable */';",
    "delete /'/.lastIndex; const c = '/* eslint-disable */';",
    "void /'/; const c = '/* eslint-disable */';",
    "const a = b instanceof /'/.constructor; const c = '/* eslint-disable */';",
    "const a = 'x' in /'/; const c = '/* eslint-disable */';",
    "for (const m of /'/[Symbol.matchAll]('x')) m; const c = '/* eslint-disable */';",
    "export default /'/; export const c = '/* eslint-disable */';",
  ]) {
    assert.deepEqual(parsedComments(code), [], code);
    assert.deepEqual(labels(code), [], code);
  }
});

test("the scanner reads comments as the TypeScript parser does, in typed code and JSX", () => {
  for (const lines of TYPED_SAMPLES) {
    const code = lines.join("\n");

    assert.ok(parsedComments(code).length > 0, code);
    assert.deepEqual(
      comments(code).map(({ type, value, start }) => ({ type, value, start })),
      parsedComments(code),
      code,
    );
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

test("a regular expression with no closing slash ends at its line's end", () => {
  assert.deepEqual(labels("const a = /open\n/* eslint-disable */"), [
    "eslint-disable",
  ]);
});

test("a string carried over a line break by a backslash is read to its quote, whatever the line ending", () => {
  for (const code of [
    "const s = 'a \\\n b'; /* eslint-disable */\n",
    "const s = 'a \\\r\n b'; /* eslint-disable */\r\n",
    "const s = 'a \\\n /* note */ b'; // eslint-disable-line\n",
    "const s = 'a \\\r\n /* note */ b'; // eslint-disable-line\r\n",
    "const s = 'a \\\n'; /* eslint-disable */\n",
    "const s = 'a \\\r\n'; /* eslint-disable */\r\n",
  ]) {
    assert.equal(labels(code).length, 1, JSON.stringify(code));
  }
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

  // The same text with Windows line endings: a `//` comment's text stops
  // before the carriage return.
  const windows = code.replaceAll("\n", "\r\n");
  seen.length = 0;
  assert.deepEqual(linter.verify(windows, [probe], "src/example.js"), []);
  assert.deepEqual(
    comments(windows).map(({ type, value }) => ({ type, value })),
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
    ['// eslint no-debugger: "off"\ndebugger;', false],
    ["/* eslint */\ndebugger;", false],
    ["debugger; /* eslint-disable-line\n no-debugger */", false],
    ["/* eslint-disable-next-line\n no-debugger */\ndebugger;", true],
    ["// eslint-disable-next-line no-debugger -- stops here\ndebugger;", true],
  ])) {
    const silenced = linter.verify(code, config, "src/example.js").length === 0;
    const [comment] = comments(code);

    assert.equal(silenced, honoured, code);
    assert.equal(comment && lintOff(comment) !== undefined, honoured, code);
  }
});

test("a reason is the text after the first dashes set apart by white space, and white space alone is not one", () => {
  /** @type {import("eslint").Linter.Config[]} */
  const config = [{ rules: { "no-debugger": "error" } }];

  for (const [code, reason] of /** @type {const} */ ([
    ["// eslint-disable-next-line no-debugger -- stops here\ndebugger;", "stops here"],
    ["// eslint-disable-next-line no-debugger --- stops here\ndebugger;", "stops here"],
    ["// eslint-disable-next-line no-debugger -- stops -- here\ndebugger;", "stops -- here"],
    ["/* eslint-disable no-debugger --   stops here   */\ndebugger;", "stops here"],
    ["/* eslint-disable no-debugger --\n */\ndebugger;", ""],
    ["/* eslint-disable-next-line no-debugger --  */\ndebugger;", ""],
  ])) {
    const [comment] = comments(code);

    assert.deepEqual(linter.verify(code, config, "src/example.js"), [], code);
    assert.equal(comment && lintOff(comment)?.reason, reason, code);
  }
});
