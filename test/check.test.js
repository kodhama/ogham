// The check an adopted repo runs, as pure functions: what a lock is, which
// owned files have drifted from it, and what the check reports.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VERSION,
  contentHash,
  drift,
  parseLock,
  problems,
} from "../standard/check.mjs";
import { readRepoFile } from "./helpers/standard-text.js";

/** @returns {import("../standard/check.mjs").Lock} */
const lockFor = (/** @type {Record<string, string>} */ texts) => ({
  version: VERSION,
  commit: "c".repeat(40),
  choices: { languages: [], preset: false },
  files: Object.fromEntries(
    Object.entries(texts).map(([path, text]) => [path, contentHash(text)]),
  ),
  added: { lines: [] },
});

const noScan = () => [];

test("the version built into the check is the package's version", () => {
  assert.equal(VERSION, JSON.parse(readRepoFile("package.json")).version);
});

test("a hash covers the text with line endings normalised to LF", () => {
  assert.equal(contentHash("a\r\nb\r\n"), contentHash("a\nb\n"));
  assert.notEqual(contentHash("a\nb\n"), contentHash("a\nb"));
  assert.match(contentHash(""), /^[0-9a-f]{64}$/);
});

test("a lock is read back from its JSON", () => {
  const lock = lockFor({ ".ogham/coding/core.md": "core\n" });

  assert.deepEqual(parseLock(JSON.stringify(lock)), lock);
});

test("text that is not a lock reads as no lock", () => {
  const lock = lockFor({ ".ogham/coding/core.md": "core\n" });

  for (const text of [
    "",
    "not json",
    "null",
    "[]",
    JSON.stringify({ ...lock, version: 1 }),
    JSON.stringify({ ...lock, commit: undefined }),
    JSON.stringify({ ...lock, files: { a: 1 } }),
    JSON.stringify({ ...lock, files: [] }),
    JSON.stringify({
      ...lock,
      choices: { languages: "typescript", preset: true },
    }),
    JSON.stringify({ ...lock, choices: { languages: [], preset: "yes" } }),
    JSON.stringify({
      ...lock,
      added: { lines: [{ file: ".prettierignore" }] },
    }),
    JSON.stringify({ ...lock, added: {} }),
  ]) {
    assert.equal(parseLock(text), undefined, text);
  }
});

test("an owned file that matches its hash has not drifted, whatever its line endings", () => {
  const lock = lockFor({ ".ogham/a.md": "one\ntwo\n" });

  assert.deepEqual(drift(lock, new Map([[".ogham/a.md", "one\ntwo\n"]])), []);
  assert.deepEqual(
    drift(lock, new Map([[".ogham/a.md", "one\r\ntwo\r\n"]])),
    [],
  );
});

test("an edited owned file and a missing one have drifted", () => {
  const lock = lockFor({ ".ogham/a.md": "one\n", ".ogham/b.md": "two\n" });

  assert.deepEqual(drift(lock, new Map([[".ogham/a.md", "one, edited\n"]])), [
    { path: ".ogham/a.md", state: "edited" },
    { path: ".ogham/b.md", state: "missing" },
  ]);
});

test("a clean adoption has no problems", () => {
  const lock = lockFor({ ".ogham/a.md": "one\n" });

  assert.deepEqual(
    problems({
      lockText: JSON.stringify(lock),
      version: VERSION,
      contents: new Map([[".ogham/a.md", "one\n"]]),
      sources: new Map(),
      scan: noScan,
    }),
    [],
  );
});

test("a repo with no lock, or with text that is not a lock, is a problem", () => {
  const facts = {
    version: VERSION,
    contents: new Map(),
    sources: new Map(),
    scan: noScan,
  };

  assert.match(
    problems({ ...facts, lockText: undefined }).join("\n"),
    /\.ogham\/lock\.json is missing/,
  );
  assert.match(
    problems({ ...facts, lockText: "{}" }).join("\n"),
    /\.ogham\/lock\.json is not a lock/,
  );
});

test("an edited owned file is a problem that names the file and a formatter as a possible cause", () => {
  const lock = lockFor({ ".ogham/a.md": "one\n", ".ogham/b.md": "two\n" });

  const found = problems({
    lockText: JSON.stringify(lock),
    version: VERSION,
    contents: new Map([[".ogham/a.md", "one \n"]]),
    sources: new Map(),
    scan: noScan,
  });

  assert.equal(found.length, 2);
  assert.match(found[0] ?? "", /^\.ogham\/a\.md differs from its pinned text/);
  assert.match(found[0] ?? "", /formatter/);
  assert.match(found[1] ?? "", /^\.ogham\/b\.md is missing/);
});

test("a lock at another version than the check's is a problem", () => {
  const lock = { ...lockFor({}), version: "9.9.9" };

  const found = problems({
    lockText: JSON.stringify(lock),
    version: VERSION,
    contents: new Map(),
    sources: new Map(),
    scan: noScan,
  });

  assert.equal(found.length, 1);
  assert.match(found[0] ?? "", /9\.9\.9/);
  assert.ok((found[0] ?? "").includes(VERSION));
});

test("each reasonless comment the scan finds is a problem with its file, line and column", () => {
  const lock = lockFor({});

  const found = problems({
    lockText: JSON.stringify(lock),
    version: VERSION,
    contents: new Map(),
    sources: new Map([
      ["src/a.js", "text a"],
      ["src/b.ts", "text b"],
    ]),
    scan: (text) =>
      text === "text a"
        ? [
            { line: 1, column: 1, label: "eslint-disable" },
            { line: 7, column: 3, label: "eslint-disable-next-line" },
          ]
        : [],
  });

  assert.equal(found.length, 2);
  assert.match(found[0] ?? "", /^src\/a\.js:1:1 /);
  assert.match(found[0] ?? "", /eslint-disable comment gives no reason/);
  assert.match(found[0] ?? "", /og-reasoned-exceptions/);
  assert.match(found[1] ?? "", /^src\/a\.js:7:3 .*eslint-disable-next-line/);
});
