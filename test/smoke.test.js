import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("package.json declares the scripts every PR is gated on", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  for (const script of ["test", "typecheck", "lint"]) {
    assert.equal(typeof manifest.scripts[script], "string", script);
  }
});

test("CI tests on the oldest Node that package.json's engines allows", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const workflow = readFileSync(
    new URL("../.github/workflows/test.yml", import.meta.url),
    "utf8",
  );

  const floor = /^>=(\d+)$/.exec(manifest.engines.node)?.[1];
  assert.ok(floor, `engines.node is ">=<major>": ${manifest.engines.node}`);
  assert.match(workflow, new RegExp(`node-version: "${floor}"`));
  assert.equal(manifest.bin.ogham, "bin/ogham.mjs");
});
