// The command line: reading the arguments, and the program run for real
// with no terminal. Its tag lookup goes to a local repo standing in for
// GitHub, through git's `insteadOf`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { LOCK_PATH, VERSION } from "../standard/check.mjs";
import { REMOTE } from "../src/apply.mjs";
import { parseArgs } from "../src/cli.mjs";
import {
  GIT_ENV,
  commitAll,
  fixtureRepo,
  git,
  status,
} from "./helpers/fixture-repo.js";

const BIN = fileURLToPath(new URL("../bin/ogham.mjs", import.meta.url));

/**
 * A repo standing in for ogham's own on GitHub, with the version's tag as
 * an annotated tag, or with no tag. Its path is what the remote resolves to.
 * @param {import("node:test").TestContext} t
 * @param {boolean} tagged
 */
const fakeRemote = (t, tagged) => {
  const root = fixtureRepo(t, { "README.md": "ogham\n" });
  if (tagged) git(root, ["tag", "-a", `v${VERSION}`, "-m", "release"]);
  return { root, commit: git(root, ["rev-parse", "HEAD"]).trim() };
};

/**
 * Effect: runs the program in `cwd` with stdin closed, the remote pointed
 * at `remote`.
 * @param {string} cwd
 * @param {string} remote
 * @param {readonly string[]} args
 */
const ogham = (cwd, remote, args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...GIT_ENV,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`,
      GIT_CONFIG_VALUE_0: REMOTE,
    },
  });

test("a command line names one of four commands, and only update takes --force", () => {
  assert.deepEqual(parseArgs(["install"]), {
    command: "install",
    force: false,
  });
  assert.deepEqual(parseArgs(["update", "--force"]), {
    command: "update",
    force: true,
  });
  assert.deepEqual(parseArgs(["check"]), { command: "check", force: false });
  assert.deepEqual(parseArgs(["remove"]), { command: "remove", force: false });
  for (const args of [
    [],
    ["adopt"],
    ["install", "--force"],
    ["update", "-f"],
  ]) {
    assert.ok("error" in parseArgs(args), JSON.stringify(args));
  }
});

test("install, check, update and remove each run to the end with stdin closed", (t) => {
  const remote = fakeRemote(t, true);
  const root = fixtureRepo(t, { "src/a.ts": "export const a = 1;\n" });

  const installed = ogham(root, remote.root, ["install"]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(
    JSON.parse(readFileSync(join(root, LOCK_PATH), "utf8")).commit,
    remote.commit,
  );
  commitAll(root, "adopt ogham");

  const checked = ogham(root, remote.root, ["check"]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /intact/);

  const updated = ogham(root, remote.root, ["update"]);
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(updated.stdout, /Already at version/);

  const removed = ogham(join(root, "src"), remote.root, ["remove"]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(status(root), /^ D \.ogham\/lock\.json$/m);
});

test("install refuses with a non-zero exit, and writes nothing, when the tag is not found", (t) => {
  const remote = fakeRemote(t, false);
  const root = fixtureRepo(t, { "README.md": "x\n" });

  const outcome = ogham(root, remote.root, ["install"]);

  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /Found no tag/);
  assert.equal(status(root), "");
});

test("check fails on a repo that has not adopted", (t) => {
  const root = fixtureRepo(t, { "README.md": "x\n" });

  const outcome = ogham(root, root, ["check"]);

  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /lock\.json is missing/);
});

test("an unknown command prints the usage and exits 2", (t) => {
  const root = fixtureRepo(t, { "README.md": "x\n" });

  const outcome = ogham(root, root, ["adopt"]);

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /Unknown command: adopt\./);
  assert.match(outcome.stderr, /Usage: ogham <command>/);
});

test("outside a git repo, a command refuses", (t) => {
  const folder = mkdtempSync(join(tmpdir(), "ogham-plain-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));

  const outcome = ogham(folder, folder, ["install"]);

  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /not inside a git repo/);
});
