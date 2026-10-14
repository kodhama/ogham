// What ogham vendors into a repo: which languages a repo has, which of the
// shipped files it gets, and the one line added to a formatter's ignore file.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { choices } from "../src/detect.mjs";
import { changes, owned, withLine, withoutLine } from "../src/vendor.mjs";

const source = new Map([
  ["check.mjs", "check\n"],
  ["coding/core.md", "core\n"],
  ["coding/sources.md", "sources\n"],
  ["coding/rubric.md", "rubric\n"],
  ["coding/typescript.md", "typescript\n"],
  ["coding/eslint/index.mjs", "preset\n"],
  ["coding/eslint/scope.mjs", "scope\n"],
]);

test("a repo with a tsconfig.json and a package.json gets the TypeScript page and the preset", () => {
  assert.deepEqual(
    choices({ rootFiles: ["package.json", "tsconfig.json"], tracked: [] }),
    { languages: ["typescript"], preset: true },
  );
});

test("tracked TypeScript files count as TypeScript, with any of its extensions", () => {
  for (const file of ["src/a.ts", "src/a.tsx", "src/a.mts", "src/a.cts"]) {
    assert.deepEqual(
      choices({ rootFiles: ["package.json"], tracked: ["README.md", file] }),
      { languages: ["typescript"], preset: true },
      file,
    );
  }
});

test("TypeScript with no package.json at the root gets the page and no preset", () => {
  assert.deepEqual(choices({ rootFiles: ["tsconfig.json"], tracked: [] }), {
    languages: ["typescript"],
    preset: false,
  });
});

test("a JavaScript-only repo gets the page, which covers JavaScript, and no preset", () => {
  for (const file of ["index.js", "lib/a.mjs", "lib/a.cjs", "app/a.jsx"]) {
    assert.deepEqual(
      choices({ rootFiles: ["package.json"], tracked: [file] }),
      { languages: ["typescript"], preset: false },
      file,
    );
  }
});

test("a repo in another language gets no language page and no preset", () => {
  assert.deepEqual(
    choices({
      rootFiles: [],
      tracked: ["go.mod", "main.go", "docs/notes.md", "scripts/tsx", "a.tsv"],
    }),
    { languages: [], preset: false },
  );
});

test("with the preset, every shipped file is owned, under .ogham/", () => {
  assert.deepEqual(
    [...owned(source, { languages: ["typescript"], preset: true })],
    [...source].map(([path, text]) => [`.ogham/${path}`, text]),
  );
});

test("without the preset the eslint folder stays out", () => {
  assert.deepEqual(
    [...owned(source, { languages: ["typescript"], preset: false }).keys()],
    [
      ".ogham/check.mjs",
      ".ogham/coding/core.md",
      ".ogham/coding/sources.md",
      ".ogham/coding/rubric.md",
      ".ogham/coding/typescript.md",
    ],
  );
});

test("a repo in another language gets the core, its sources and the rubric", () => {
  assert.deepEqual(
    [...owned(source, { languages: [], preset: false }).keys()],
    [
      ".ogham/check.mjs",
      ".ogham/coding/core.md",
      ".ogham/coding/sources.md",
      ".ogham/coding/rubric.md",
    ],
  );
});

test("every page under standard/coding/ is the core, its sources, the rubric or a known language page", () => {
  const shipped = readdirSync(
    fileURLToPath(new URL("../standard/coding", import.meta.url)),
  ).filter((name) => name.endsWith(".md"));
  const real = new Map(shipped.map((name) => [`coding/${name}`, ""]));

  // A new language page that `choices` never picks would reach no repo.
  assert.deepEqual(
    [
      ...owned(real, { languages: ["typescript"], preset: false }).keys(),
    ].sort(),
    shipped.map((name) => `.ogham/coding/${name}`).sort(),
  );
  assert.deepEqual(
    [...owned(real, { languages: [], preset: false }).keys()].sort(),
    [
      ".ogham/coding/core.md",
      ".ogham/coding/rubric.md",
      ".ogham/coding/sources.md",
    ],
  );
});

test("only files whose text differs are written, and line endings alone are no difference", () => {
  const target = new Map([
    [".ogham/a.md", "one\ntwo\n"],
    [".ogham/b.md", "new\n"],
    [".ogham/c.md", "added\n"],
  ]);
  const current = new Map([
    [".ogham/a.md", "one\r\ntwo\r\n"],
    [".ogham/b.md", "old\n"],
  ]);

  assert.deepEqual(changes(target, current, [".ogham/a.md", ".ogham/b.md"]), {
    write: new Map([
      [".ogham/b.md", "new\n"],
      [".ogham/c.md", "added\n"],
    ]),
    remove: [],
  });
});

test("a file the lock owned that the new version no longer ships is removed, if it is still there", () => {
  const target = new Map([[".ogham/a.md", "one\n"]]);
  const current = new Map([
    [".ogham/a.md", "one\n"],
    [".ogham/old.md", "old\n"],
    [".ogham/mine.md", "the repo's own file\n"],
  ]);

  assert.deepEqual(
    changes(target, current, [
      ".ogham/a.md",
      ".ogham/old.md",
      ".ogham/gone.md",
    ]),
    { write: new Map(), remove: [".ogham/old.md"] },
  );
});

test("a line is added at the end of an ignore file, keeping its line endings", () => {
  assert.equal(withLine("dist/\n", ".ogham/"), "dist/\n.ogham/\n");
  assert.equal(
    withLine("dist/\r\nout/\r\n", ".ogham/"),
    "dist/\r\nout/\r\n.ogham/\r\n",
  );
  assert.equal(withLine("", ".ogham/"), ".ogham/\n");
});

test("a file with no line break at its end keeps none", () => {
  assert.equal(withLine("dist/", ".ogham/"), "dist/\n.ogham/");
  assert.equal(withLine("a/\r\ndist/", ".ogham/"), "a/\r\ndist/\r\n.ogham/");
});

test("a line that is already there is not added again", () => {
  for (const text of ["dist/\n.ogham/\n", ".ogham/", "a\r\n.ogham/\r\nb\r\n"]) {
    assert.equal(withLine(text, ".ogham/"), text);
  }
});

test("taking the line out gives back the text it was added to", () => {
  for (const text of [
    "dist/\n",
    "dist/\r\nout/\r\n",
    "",
    "dist/",
    "a/\r\ndist/",
  ]) {
    assert.equal(withoutLine(withLine(text, ".ogham/"), ".ogham/"), text);
  }
});

test("taking the line out of the middle keeps every other line", () => {
  assert.equal(withoutLine("a\n.ogham/\nb\n", ".ogham/"), "a\nb\n");
  assert.equal(withoutLine("a\nb\n", ".ogham/"), "a\nb\n");
  assert.equal(withoutLine(".ogham/\n", ".ogham/"), "");
});
