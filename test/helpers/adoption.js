// What the tests that run the commands on real repos share: the standard
// this checkout ships, the same at another version, the repo's io with the
// tag lookup answered here instead of by the network, and readers for what a
// command left behind.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCK_PATH, VERSION, parseLock } from "../../standard/check.mjs";
import { readSource, repoIo } from "../../src/apply.mjs";

/** @typedef {import("../../src/apply.mjs").Io} Io */
/** @typedef {import("../../src/plan.mjs").Source} Source */

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const shipped = readSource(repoIo(PACKAGE_ROOT));

export const COMMIT = "1".repeat(40);

/**
 * The shipped standard at another version: the check's version constant
 * changed, and one line added to the core.
 * @param {string} version
 * @returns {Source}
 */
export const shippedAt = (version) => {
  const check = shipped.files.get("check.mjs") ?? "";
  const constant = `export const VERSION = "${VERSION}";`;
  assert.ok(check.includes(constant), "the check declares its version");
  return {
    ...shipped,
    version,
    files: new Map(
      [...shipped.files].map(([path, text]) => [
        path,
        path === "check.mjs"
          ? text.replace(constant, `export const VERSION = "${version}";`)
          : path === "coding/core.md"
            ? `${text}\nA line the newer version adds.\n`
            : text,
      ]),
    ),
  };
};

/**
 * The repo's io, with the tag lookup answered: every tag asked for points
 * at `commit`, or at nothing when `commit` is empty.
 * @param {string} root
 * @param {string} [commit]
 * @returns {Io}
 */
export const ioFor = (root, commit = COMMIT) => {
  const io = repoIo(root);
  return {
    ...io,
    git: (args) =>
      args[0] === "ls-remote"
        ? { ok: true, out: commit ? `${commit}\t${args[2]}\n` : "" }
        : io.git(args),
  };
};

/**
 * The io with its first write to `target` corrupted, as a disk might, and
 * every later write, the restoring one included, left alone.
 * @param {Io} io
 * @param {string} target
 * @returns {Io}
 */
export const corruptingFirstWrite = (io, target) => {
  const seen = { corrupted: false };
  return {
    ...io,
    write: (path, text) => {
      const corrupt = path === target && !seen.corrupted;
      if (corrupt) seen.corrupted = true;
      io.write(path, corrupt ? `${text}x` : text);
    },
  };
};

/**
 * @param {string} root
 * @param {string} path
 */
export const read = (root, path) => readFileSync(join(root, path), "utf8");

/**
 * @param {string} root
 * @returns {import("../../standard/check.mjs").Lock}
 */
export const lockOf = (root) => {
  const lock = parseLock(read(root, LOCK_PATH));
  assert.ok(lock, "the repo has a lock");
  return lock;
};

/**
 * Effect: runs the vendored check in the repo, as an adopted repo does.
 * @param {string} root
 */
export const runVendoredCheck = (root) =>
  spawnSync(process.execPath, [".ogham/check.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
