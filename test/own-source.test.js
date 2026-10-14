// ogham's own source passes the scan its check runs on an adopted repo: no
// comment in the preset's file scope turns lint off without a reason. The
// scan joins `npm run lint` once ogham adopts itself; until then, this test
// runs it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { scanDisables } from "../standard/coding/eslint/scan-disables.mjs";
import { inScope } from "../standard/coding/eslint/scope.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("no file of ogham's own in the preset's scope turns lint off without a reason", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path !== "" && inScope(path))
    .filter((path) => existsSync(join(ROOT, path)));
  assert.ok(files.includes("src/apply.mjs"), "the scope covers src/");
  assert.ok(files.includes("standard/check.mjs"), "the scope covers standard/");

  const found = files.flatMap((path) =>
    scanDisables(readFileSync(join(ROOT, path), "utf8")).map(
      ({ line, column, label }) => `${path}:${line}:${column} ${label}`,
    ),
  );
  assert.deepEqual(found, []);
});
