// The lock ogham writes into an adopted repo: what it records, and that the
// check reads back exactly what was written.

import assert from "node:assert/strict";
import { test } from "node:test";

import { contentHash, drift, parseLock } from "../standard/check.mjs";
import { buildLock, lockText } from "../src/lock.mjs";

const owned = new Map([
  [".ogham/coding/core.md", "core\n"],
  [".ogham/check.mjs", "check\n"],
]);

const lock = buildLock({
  version: "1.2.3",
  commit: "a".repeat(40),
  choices: { languages: ["typescript"], preset: true },
  owned,
  lines: [{ file: ".prettierignore", line: ".ogham/" }],
});

test("the lock records the version, the commit, the choices and what was added outside .ogham/", () => {
  assert.equal(lock.version, "1.2.3");
  assert.equal(lock.commit, "a".repeat(40));
  assert.deepEqual(lock.choices, { languages: ["typescript"], preset: true });
  assert.deepEqual(lock.added, {
    lines: [{ file: ".prettierignore", line: ".ogham/" }],
  });
});

test("the lock holds one hash per owned file, in path order", () => {
  assert.deepEqual(Object.entries(lock.files), [
    [".ogham/check.mjs", contentHash("check\n")],
    [".ogham/coding/core.md", contentHash("core\n")],
  ]);
  assert.deepEqual(drift(lock, owned), []);
});

test("the lock's text ends with a line break and reads back as the same lock", () => {
  const text = lockText(lock);

  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(parseLock(text), lock);
});

test("the same input gives the same lock text, whatever order the files came in", () => {
  const reversed = buildLock({
    version: "1.2.3",
    commit: "a".repeat(40),
    choices: { languages: ["typescript"], preset: true },
    owned: new Map([...owned].reverse()),
    lines: [{ file: ".prettierignore", line: ".ogham/" }],
  });

  assert.equal(lockText(reversed), lockText(lock));
});
