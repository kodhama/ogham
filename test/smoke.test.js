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
