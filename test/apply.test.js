// The commands on real repos: each test builds a git repo in a temporary
// folder, runs install, update or remove against the standard this checkout
// ships, and reads back the files and `git status`. The tag lookup is the one
// call answered here instead of by the network.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCK_PATH,
  VERSION,
  contentHash,
  parseLock,
  readProblems,
} from "../standard/check.mjs";
import { install, readSource, remove, repoIo, update } from "../src/apply.mjs";
import {
  commitAll,
  fixtureRepo,
  git,
  status,
  writeFiles,
} from "./helpers/fixture-repo.js";

/** @typedef {import("../src/apply.mjs").Io} Io */
/** @typedef {import("../src/plan.mjs").Source} Source */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const shipped = readSource(repoIo(PACKAGE_ROOT));
const COMMIT = "1".repeat(40);

/**
 * The shipped standard at another version: the check's version constant
 * changed, and one line added to the core.
 * @param {string} version
 * @returns {Source}
 */
const shippedAt = (version) => {
  const check = shipped.files.get("check.mjs") ?? "";
  const constant = `export const VERSION = "${VERSION}";`;
  assert.ok(check.includes(constant), "the check declares its version");
  return {
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
const ioFor = (root, commit = COMMIT) => {
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
const corruptingFirstWrite = (io, target) => {
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
const read = (root, path) => readFileSync(join(root, path), "utf8");

/**
 * Every file under a folder of the repo, by its path from the repo's root.
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
const filesUnder = (root, dir) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();

/**
 * @param {string} root
 * @returns {import("../standard/check.mjs").Lock}
 */
const lockOf = (root) => {
  const lock = parseLock(read(root, LOCK_PATH));
  assert.ok(lock, "the repo has a lock");
  return lock;
};

/**
 * Effect: runs the vendored check in the repo, as an adopted repo does.
 * @param {string} root
 */
const runVendoredCheck = (root) =>
  spawnSync(process.execPath, [".ogham/check.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

const TS_REPO = {
  "package.json": '{ "name": "fixture" }\n',
  "tsconfig.json": "{}\n",
  "src/a.ts": "export const a = 1;\n",
  ".prettierignore": "dist/\n",
};

/**
 * A TypeScript repo that adopted the shipped standard, committed.
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} [extra]
 */
const adoptedRepo = (t, extra = {}) => {
  const root = fixtureRepo(t, { ...TS_REPO, ...extra });
  const outcome = install(ioFor(root), shipped);
  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  commitAll(root, "adopt ogham");
  return root;
};

test("install on a TypeScript repo vendors the standard, its check, the preset and a lock that matches them", (t) => {
  const root = fixtureRepo(t, TS_REPO);

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  const lock = lockOf(root);
  assert.equal(lock.version, VERSION);
  assert.equal(lock.commit, COMMIT);
  assert.deepEqual(lock.choices, { languages: ["typescript"], preset: true });
  const vendored = filesUnder(root, ".ogham").filter(
    (path) => path !== LOCK_PATH,
  );
  assert.deepEqual(Object.keys(lock.files), vendored);
  for (const path of [
    ".ogham/check.mjs",
    ".ogham/coding/core.md",
    ".ogham/coding/sources.md",
    ".ogham/coding/rubric.md",
    ".ogham/coding/typescript.md",
    ".ogham/coding/eslint/index.mjs",
    ".ogham/coding/eslint/scan-disables.mjs",
  ]) {
    assert.ok(vendored.includes(path), `${path} is vendored`);
  }
  for (const path of vendored) {
    assert.equal(lock.files[path], contentHash(read(root, path)), path);
    assert.equal(
      read(root, path),
      shipped.files.get(path.slice(".ogham/".length)),
      path,
    );
  }
});

test("the lock records the line install added outside .ogham/, and the core's pointer to its sources resolves", (t) => {
  const root = fixtureRepo(t, TS_REPO);

  install(ioFor(root), shipped);

  assert.equal(read(root, ".prettierignore"), "dist/\n.ogham/\n");
  assert.deepEqual(lockOf(root).added.lines, [
    { file: ".prettierignore", line: ".ogham/" },
  ]);
  assert.match(
    read(root, ".ogham/coding/core.md"),
    /\.ogham\/coding\/sources\.md/,
  );
  assert.ok(lockOf(root).files[".ogham/coding/sources.md"]);
});

test("a Go repo gets the prose and the rubric with no preset, and an update does not add the preset later", (t) => {
  const root = fixtureRepo(t, {
    "go.mod": "module x\n",
    "main.go": "package main\n",
  });

  assert.equal(install(ioFor(root), shipped).code, 0);
  assert.deepEqual(lockOf(root).choices, { languages: [], preset: false });
  assert.deepEqual(filesUnder(root, ".ogham"), [
    ".ogham/check.mjs",
    ".ogham/coding/core.md",
    ".ogham/coding/rubric.md",
    ".ogham/coding/sources.md",
    ".ogham/lock.json",
  ]);
  writeFiles(root, TS_REPO);
  commitAll(root, "adopt ogham, then add TypeScript");

  const outcome = update(ioFor(root), shippedAt("9.9.9"), false);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  assert.deepEqual(lockOf(root).choices, { languages: [], preset: false });
  assert.ok(
    !filesUnder(root, ".ogham").some((path) => path.includes("eslint")),
  );
});

test("install on a repo that has a lock writes nothing, says it is already adopted, and exits zero", (t) => {
  const root = adoptedRepo(t);

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 0);
  assert.match(outcome.lines.join("\n"), /Already adopted/);
  assert.equal(status(root), "");
});

test("install refuses and writes nothing when a path it would touch has uncommitted changes", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  writeFiles(root, { ".prettierignore": "dist/\nbuild/\n" });

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), /\.prettierignore/);
  assert.equal(status(root), " M .prettierignore\n");
});

test("install refuses and writes nothing when git ignores .ogham/", (t) => {
  const root = fixtureRepo(t, { ...TS_REPO, ".gitignore": ".ogham/\n" });

  const outcome = install(ioFor(root), shipped);
  const adopted = adoptedRepo(t);

  assert.equal(outcome.code, 1);
  const text = outcome.lines.join("\n");
  assert.match(text, /^git ignores these paths/);
  assert.match(text, /Nothing was written\.$/);
  assert.deepEqual(
    outcome.lines
      .filter((line) => line.startsWith("  "))
      .map((line) => line.trim())
      .sort(),
    filesUnder(adopted, ".ogham"),
  );
  assert.equal(existsSync(join(root, ".ogham")), false);
  assert.equal(status(root), "");
});

test("install names only the paths git ignores, and still writes nothing", (t) => {
  const root = fixtureRepo(t, { ...TS_REPO, ".gitignore": "check.mjs\n" });

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.deepEqual(
    outcome.lines.filter((line) => line.startsWith("  ")),
    ["  .ogham/check.mjs"],
  );
  assert.equal(existsSync(join(root, ".ogham")), false);
});

test("update --force refuses to overwrite an owned file git has been told to ignore", (t) => {
  const root = adoptedRepo(t);
  git(root, ["rm", "-q", "--cached", ".ogham/coding/core.md"]);
  writeFiles(root, { ".gitignore": ".ogham/coding/core.md\n" });
  commitAll(root, "stop tracking the core");
  writeFiles(root, { ".ogham/coding/core.md": "A local copy.\n" });

  const outcome = update(ioFor(root), shippedAt("9.9.9"), true);

  assert.equal(outcome.code, 1);
  assert.deepEqual(
    outcome.lines.filter((line) => line.startsWith("  ")),
    ["  .ogham/coding/core.md"],
  );
  assert.equal(read(root, ".ogham/coding/core.md"), "A local copy.\n");
  assert.equal(lockOf(root).version, VERSION);
});

test("install refuses on a failed ignore lookup instead of reading it as nothing ignored", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const io = ioFor(root);
  /** @type {Io} */
  const broken = {
    ...io,
    git: (args) =>
      args[0] === "check-ignore"
        ? { ok: false, out: "fatal: bad pattern\n", code: 128 }
        : io.git(args),
  };

  const outcome = install(broken, shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    outcome.lines.join("\n"),
    /which paths it ignores: fatal: bad pattern\. Nothing was written\./,
  );
  assert.equal(status(root), "");
});

test("install refuses before writing when the version's tag is not found", (t) => {
  const root = fixtureRepo(t, TS_REPO);

  const outcome = install(ioFor(root, ""), shipped);

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), new RegExp(`no tag v${VERSION}`));
  assert.equal(status(root), "");
});

test("a refusal after writing during a first install deletes what it created and restores what it edited", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const corrupting = corruptingFirstWrite(ioFor(root), ".ogham/coding/core.md");

  const outcome = install(corrupting, shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    outcome.lines.join("\n"),
    /\.ogham\/coding\/core\.md did not match the lock/,
  );
  assert.equal(status(root), "");
  assert.equal(read(root, ".prettierignore"), TS_REPO[".prettierignore"]);
  assert.deepEqual(readdirSync(root).sort(), [
    ".git",
    ".prettierignore",
    "package.json",
    "src",
    "tsconfig.json",
  ]);
});

test("update to the same version writes nothing and reports no diff", (t) => {
  const root = adoptedRepo(t);

  const outcome = update(ioFor(root), shipped, false);

  assert.equal(outcome.code, 0);
  assert.deepEqual(outcome.lines, [
    `Already at version ${VERSION}: no file differs, and nothing was written.`,
  ]);
  assert.equal(status(root), "");
});

test("update to a newer version shows a diff for each changed owned file and leaves ogham.local.md alone", (t) => {
  const local = "# Local rules\n\nNothing yet.\n";
  const root = adoptedRepo(t, { "ogham.local.md": local });

  const outcome = update(
    ioFor(root, "2".repeat(40)),
    shippedAt("9.9.9"),
    false,
  );

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  const printed = outcome.lines.join("\n");
  assert.match(printed, /diff --git a\/\.ogham\/coding\/core\.md/);
  assert.match(printed, /\+A line the newer version adds\./);
  assert.match(printed, /diff --git a\/\.ogham\/check\.mjs/);
  assert.doesNotMatch(printed, /typescript\.md/);
  assert.equal(read(root, "ogham.local.md"), local);
  assert.equal(lockOf(root).version, "9.9.9");
  assert.equal(lockOf(root).commit, "2".repeat(40));
  assert.equal(runVendoredCheck(root).status, 0, runVendoredCheck(root).stderr);
});

for (const committed of [true, false]) {
  test(`update stops on a local edit to an owned file and shows it, ${committed ? "committed" : "uncommitted"}`, (t) => {
    const root = adoptedRepo(t);
    const edited = `${read(root, ".ogham/coding/rubric.md")}A local addition.\n`;
    writeFiles(root, { ".ogham/coding/rubric.md": edited });
    if (committed) commitAll(root, "edit the rubric");

    const outcome = update(ioFor(root), shippedAt("9.9.9"), false);

    assert.equal(outcome.code, 1);
    const printed = outcome.lines.join("\n");
    assert.match(printed, /\.ogham\/coding\/rubric\.md \(edited\)/);
    assert.match(printed, /\+A local addition\./);
    assert.match(printed, /Nothing was written/);
    assert.equal(read(root, ".ogham/coding/rubric.md"), edited);
    assert.equal(lockOf(root).version, VERSION);
  });
}

test("update with --force overwrites a local edit and reports what it discarded", (t) => {
  const root = adoptedRepo(t);
  writeFiles(root, {
    ".ogham/coding/rubric.md": `${read(root, ".ogham/coding/rubric.md")}A local addition.\n`,
  });

  const outcome = update(ioFor(root), shippedAt("9.9.9"), true);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  const printed = outcome.lines.join("\n");
  assert.match(printed, /These local edits were discarded:/);
  assert.match(printed, /\+A local addition\./);
  assert.equal(
    read(root, ".ogham/coding/rubric.md"),
    shipped.files.get("coding/rubric.md"),
  );
});

test("a refusal after writing during update restores every touched path, leaving git status clean", (t) => {
  const root = adoptedRepo(t);
  const corrupting = corruptingFirstWrite(ioFor(root), ".ogham/check.mjs");

  const outcome = update(corrupting, shippedAt("9.9.9"), false);

  assert.equal(outcome.code, 1);
  assert.equal(status(root), "");
  assert.equal(lockOf(root).version, VERSION);
});

test("update says so when git cannot show its diff, and keeps what it wrote", (t) => {
  const root = adoptedRepo(t);
  const io = ioFor(root);
  /** @type {Io} */
  const noDiff = {
    ...io,
    git: (args) =>
      args[0] === "diff"
        ? { ok: false, out: "fatal: external diff died\n", code: 128 }
        : io.git(args),
  };

  const outcome = update(noDiff, shippedAt("9.9.9"), false);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  assert.ok(
    outcome.lines.includes(
      "Could not show git's diff: fatal: external diff died. Run git diff --no-ext-diff to see what changed.",
    ),
  );
  assert.equal(lockOf(root).version, "9.9.9");
  assert.match(
    read(root, ".ogham/coding/core.md"),
    /A line the newer version adds\.\n$/,
  );
});

test("update shows git's own diff when the repo sets an external diff program", (t) => {
  const root = adoptedRepo(t);
  git(root, ["config", "diff.external", "false"]);

  const outcome = update(ioFor(root), shippedAt("9.9.9"), false);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  assert.match(
    outcome.lines.join("\n"),
    /diff --git a\/\.ogham\/coding\/core\.md/,
  );
});

test("a file that differs only in CRLF line endings is not a local edit", (t) => {
  const root = adoptedRepo(t);
  writeFiles(root, {
    ".ogham/coding/core.md": read(root, ".ogham/coding/core.md").replaceAll(
      "\n",
      "\r\n",
    ),
  });

  const outcome = update(ioFor(root), shipped, false);

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  assert.match(outcome.lines.join("\n"), /Already at version/);
});

test("check and the vendored check pass a clean adoption, and both fail an edited owned file", async (t) => {
  const root = adoptedRepo(t);

  assert.deepEqual(await readProblems(root), []);
  const clean = runVendoredCheck(root);
  assert.equal(clean.status, 0, clean.stderr);

  writeFiles(root, { ".ogham/coding/core.md": "edited\n" });
  assert.match((await readProblems(root)).join("\n"), /core\.md differs/);
  const edited = runVendoredCheck(root);
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /core\.md differs from its pinned text/);
});

test("check and the vendored check fail a lock at another version than the check", async (t) => {
  const root = adoptedRepo(t);
  const lock = read(root, LOCK_PATH);
  writeFileSync(
    join(root, LOCK_PATH),
    lock.replace(`"version": "${VERSION}"`, '"version": "9.9.9"'),
  );

  assert.match(
    (await readProblems(root)).join("\n"),
    /records version 9\.9\.9/,
  );
  const outcome = runVendoredCheck(root);
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /records version 9\.9\.9/);
});

test("the vendored check runs its scan from .ogham/ and reports a reasonless disable", (t) => {
  const root = adoptedRepo(t);
  writeFiles(root, {
    "src/b.ts": "// eslint-disable-next-line no-console\nconsole.log(1);\n",
  });

  const outcome = runVendoredCheck(root);

  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /src\/b\.ts:1:1 .* gives no reason/);
});

test("remove deletes .ogham/ and the line it added, keeps ogham.local.md, and touches nothing else", (t) => {
  const local = "# Local rules\n";
  const root = adoptedRepo(t, { "ogham.local.md": local });
  const owned = Object.keys(lockOf(root).files);

  const outcome = remove(ioFor(root));

  assert.equal(outcome.code, 0, outcome.lines.join("\n"));
  assert.ok(!readdirSync(root).includes(".ogham"));
  assert.equal(read(root, "ogham.local.md"), local);
  assert.equal(read(root, ".prettierignore"), TS_REPO[".prettierignore"]);
  const touched = status(root)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();
  assert.deepEqual(touched, [...owned, LOCK_PATH, ".prettierignore"].sort());
});

test("remove refuses on uncommitted changes to a path it would touch", (t) => {
  const root = adoptedRepo(t);
  writeFiles(root, {
    ".prettierignore": `${read(root, ".prettierignore")}build/\n`,
  });

  const outcome = remove(ioFor(root));

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), /\.prettierignore/);
  assert.ok(readdirSync(root).includes(".ogham"));
});

test("a failure partway through remove restores every touched path", (t) => {
  const root = adoptedRepo(t);
  const io = ioFor(root);
  const removed = { count: 0 };
  /** @type {Io} */
  const failing = {
    ...io,
    remove: (path) => {
      removed.count += 1;
      if (removed.count === 3) throw new Error("disk went away");
      io.remove(path);
    },
  };

  const outcome = remove(failing);

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), /disk went away/);
  assert.equal(status(root), "");
});

test("install reports git's error, not a missing tag, when the remote cannot be asked", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const io = repoIo(root);
  /** @type {Io} */
  const offline = {
    ...io,
    git: (args) =>
      args[0] === "ls-remote"
        ? { ok: false, out: "fatal: unable to access the remote\n" }
        : io.git(args),
  };

  const outcome = install(offline, shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    outcome.lines.join("\n"),
    /for tag v\S+: fatal: unable to access the remote\. Nothing was written\./,
  );
  assert.equal(status(root), "");
});

test("a failed rollback names the paths it could not put back, and claims no clean rollback", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const io = corruptingFirstWrite(ioFor(root), ".ogham/coding/core.md");
  /** @type {Io} */
  const stuck = {
    ...io,
    remove: (path) => {
      if (path === ".ogham/coding/rubric.md") throw new Error("read-only");
      io.remove(path);
    },
  };

  const outcome = install(stuck, shipped);

  assert.equal(outcome.code, 1);
  const printed = outcome.lines.join("\n");
  assert.doesNotMatch(printed, /put every path it touched back/);
  assert.match(printed, /could not put these paths back/);
  assert.match(printed, /\.ogham\/coding\/rubric\.md: Error: read-only/);
  assert.doesNotMatch(printed, /core\.md:/);
});

test("a rollback names a path whose read fails while it is put back", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const io = ioFor(root);
  const failing = ".ogham/check.mjs";
  let failed = false;
  /** @type {Io} */
  const broken = {
    ...io,
    write: (path, text) => {
      if (path === failing) {
        failed = true;
        throw new Error("disk full");
      }
      io.write(path, text);
    },
    read: (path) => {
      if (failed && path === failing) throw new Error("read broke");
      return io.read(path);
    },
  };

  const outcome = install(broken, shipped);

  assert.equal(outcome.code, 1);
  const printed = outcome.lines.join("\n");
  assert.doesNotMatch(printed, /put every path it touched back/);
  assert.match(printed, /\.ogham\/check\.mjs: Error: read broke/);
});

test("a rolled-back first install leaves no empty folder, even after a write that failed past its mkdir", (t) => {
  const root = fixtureRepo(t, TS_REPO);
  const io = ioFor(root);
  /** @type {Io} */
  const brokenOpen = {
    ...io,
    write: (path) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      throw new Error("EMFILE open");
    },
  };

  const outcome = install(brokenOpen, shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    outcome.lines.join("\n"),
    /install failed and put every path it touched back as it was: EMFILE open/,
  );
  assert.equal(existsSync(join(root, ".ogham")), false);
  assert.equal(status(root), "");
});

test("a rollback leaves alone the paths the run never changed", (t) => {
  const root = adoptedRepo(t);
  const io = ioFor(root);
  /** @type {Io} */
  const full = {
    ...io,
    write: () => {
      throw new Error("disk full");
    },
  };

  const outcome = update(full, shippedAt("9.9.9"), false);

  assert.equal(outcome.code, 1);
  assert.match(
    outcome.lines.join("\n"),
    /update failed and put every path it touched back as it was: disk full/,
  );
  assert.doesNotMatch(outcome.lines.join("\n"), /could not/);
  assert.equal(status(root), "");
});

test("a rollback restores an uncommitted local edit that update --force overwrote", (t) => {
  const root = adoptedRepo(t);
  const edited = `${read(root, ".ogham/coding/rubric.md")}A local addition.\n`;
  writeFiles(root, { ".ogham/coding/rubric.md": edited });

  const outcome = update(
    corruptingFirstWrite(ioFor(root), ".ogham/check.mjs"),
    shippedAt("9.9.9"),
    true,
  );

  assert.equal(outcome.code, 1);
  assert.equal(read(root, ".ogham/coding/rubric.md"), edited);
  assert.equal(lockOf(root).version, VERSION);
  assert.equal(status(root), " M .ogham/coding/rubric.md\n");
});

test("update writes nothing through .ogham/ when it is a symbolic link, and rolls back", (t) => {
  const root = adoptedRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "ogham-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  renameSync(join(root, ".ogham"), join(outside, "ogham"));
  symlinkSync(join(outside, "ogham"), join(root, ".ogham"));
  commitAll(root, "link .ogham out of the repo");
  const victim = join(outside, "ogham/check.mjs");
  const before = readFileSync(victim, "utf8");

  const outcome = update(ioFor(root), shippedAt("9.9.9"), true);

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), /\.ogham is a symbolic link/);
  assert.match(outcome.lines.join("\n"), /put every path it touched back/);
  assert.equal(readFileSync(victim, "utf8"), before);
  assert.equal(status(root), "");
});

test("remove deletes nothing through .ogham/ when it is a symbolic link, and rolls back", (t) => {
  const root = adoptedRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "ogham-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  renameSync(join(root, ".ogham"), join(outside, "ogham"));
  symlinkSync(join(outside, "ogham"), join(root, ".ogham"));
  commitAll(root, "link .ogham out of the repo");
  const victim = join(outside, "ogham/check.mjs");
  const before = readFileSync(victim, "utf8");

  const outcome = remove(ioFor(root));

  assert.equal(outcome.code, 1);
  assert.match(outcome.lines.join("\n"), /\.ogham is a symbolic link/);
  assert.match(outcome.lines.join("\n"), /put every path it touched back/);
  assert.equal(readFileSync(victim, "utf8"), before);
  assert.equal(status(root), "");
});

test("remove stops on a symbolic link to a folder under .ogham/, before writing anything", (t) => {
  const root = adoptedRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "ogham-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  renameSync(join(root, ".ogham/coding"), join(outside, "coding"));
  symlinkSync(join(outside, "coding"), join(root, ".ogham/coding"));
  commitAll(root, "link the coding folder out of the repo");
  const rubric = readFileSync(join(outside, "coding/rubric.md"), "utf8");

  assert.throws(
    () => remove(ioFor(root)),
    /\.ogham\/coding is a symbolic link/,
  );
  assert.equal(readFileSync(join(outside, "coding/rubric.md"), "utf8"), rubric);
  assert.equal(status(root), "");
});

test("update stops on a symbolic link to a file under .ogham/, before writing anything", (t) => {
  const root = adoptedRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "ogham-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const victim = join(outside, "victim.txt");
  writeFileSync(victim, "not ogham's\n");
  unlinkSync(join(root, ".ogham/coding/rubric.md"));
  symlinkSync(victim, join(root, ".ogham/coding/rubric.md"));
  commitAll(root, "link the rubric out of the repo");

  assert.throws(
    () => update(ioFor(root), shippedAt("9.9.9"), true),
    /\.ogham\/coding\/rubric\.md is a symbolic link/,
  );
  assert.equal(readFileSync(victim, "utf8"), "not ogham's\n");
  assert.equal(status(root), "");
});

test("the vendored check reports a deleted scanner module instead of crashing", (t) => {
  const root = adoptedRepo(t);
  unlinkSync(join(root, ".ogham/coding/eslint/scope.mjs"));

  const outcome = runVendoredCheck(root);

  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /scope\.mjs is missing/);
  assert.match(outcome.stderr, /could not run/);
  assert.doesNotMatch(outcome.stderr, /^\s+at /m);
});
