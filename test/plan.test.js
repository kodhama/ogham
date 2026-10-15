// What each command decides to do, as pure functions of what the repo holds:
// refuse, do nothing, or a set of files to write and remove.

import assert from "node:assert/strict";
import { test } from "node:test";

import { LOCK_PATH, contentHash } from "../standard/check.mjs";
import { statusPaths, tagCommit } from "../src/git-text.mjs";
import { buildLock, lockText } from "../src/lock.mjs";
import { planInstall, planRemove, planUpdate } from "../src/plan.mjs";

// Templates small enough to read in a test's expectations.
const TEMPLATES = new Map([
  ["block-agents.md", "{{core}}\n{{languages}}agents\n"],
  ["block-claude.md", "{{languages}}claude\n"],
  ["block-reviewer.md", "reviewer\n"],
  ["CLAUDE.md", "@AGENTS.md\n"],
  ["ogham.local.md", "local\n"],
]);

/**
 * A source of the standard at a version.
 * @param {string} version
 * @param {string} [core]
 * @returns {import("../src/plan.mjs").Source}
 */
const sourceAt = (version, core = "core\n") => ({
  version,
  files: new Map([
    ["check.mjs", `check ${version}\n`],
    ["coding/core.md", core],
    ["coding/rubric.md", "rubric\n"],
    ["coding/typescript.md", "typescript\n"],
    ["coding/eslint/index.mjs", "preset\n"],
  ]),
  templates: TEMPLATES,
});

// The files install writes outside `.ogham/` in a repo that has none of them.
const HOOKED = ["AGENTS.md", "CLAUDE.md", "ogham.local.md"];

/** @type {import("../src/plan.mjs").Facts} */
const empty = {
  lockText: undefined,
  contents: new Map(),
  dirty: [],
  rootFiles: [],
  tracked: [],
};

const typescript = { languages: ["typescript"], preset: true };

/**
 * @template {{ kind: string }} P
 * @template {P["kind"]} K
 * @param {P} plan
 * @param {K} kind
 * @returns {Extract<P, { kind: K }>}
 */
const as = (plan, kind) => {
  assert.equal(plan.kind, kind, JSON.stringify(plan));
  return /** @type {Extract<P, { kind: K }>} */ (plan);
};

/**
 * The facts of a repo that adopted `source` with the TypeScript choices, as
 * install plans it, then had `edits` made to its files. `lines` stand in for
 * lines an earlier version added.
 * @param {ReturnType<typeof sourceAt>} source
 * @param {Record<string, string | undefined>} [edits]
 * @param {readonly import("../standard/check.mjs").AddedLine[]} [lines]
 */
const adopted = (source, edits = {}, lines = []) => {
  const installed = as(
    planInstall(source, {
      ...empty,
      rootFiles: ["package.json", "tsconfig.json"],
    }),
    "apply",
  );
  const adoption = installed.adoption;
  assert.ok(adoption);
  const lock = lockText(
    buildLock({
      ...adoption,
      commit: "a".repeat(40),
      lines: [...adoption.lines, ...lines],
    }),
  );
  const contents = new Map([...installed.write, [LOCK_PATH, lock]]);
  for (const [path, text] of Object.entries(edits)) {
    if (text === undefined) contents.delete(path);
    else contents.set(path, text);
  }
  return { ...empty, lockText: lock, contents };
};

test("install on a repo with no code writes the core, its check and no language page", () => {
  const plan = as(planInstall(sourceAt("1.0.0"), empty), "apply");

  const owned = [
    ".ogham/check.mjs",
    ".ogham/coding/core.md",
    ".ogham/coding/rubric.md",
  ];
  assert.deepEqual([...plan.write.keys()], [...owned, ...HOOKED]);
  assert.deepEqual(plan.remove, []);
  const agents = "<!-- ogham:begin -->\n\ncore\n\nagents\n\n<!-- ogham:end -->";
  assert.equal(plan.write.get("AGENTS.md"), `${agents}\n`);
  assert.equal(plan.write.get("CLAUDE.md"), "@AGENTS.md\n");
  assert.equal(plan.write.get("ogham.local.md"), "local\n");
  assert.deepEqual(plan.adoption, {
    version: "1.0.0",
    commit: undefined,
    choices: { languages: [], preset: false },
    owned: new Map(owned.map((path) => [path, plan.write.get(path) ?? ""])),
    blocks: new Map([["AGENTS.md", agents]]),
    lines: [{ file: "CLAUDE.md", line: "@AGENTS.md" }],
    created: ["AGENTS.md", "CLAUDE.md"],
  });
  assert.deepEqual(plan.warnings, []);
});

test("install on a TypeScript repo writes the page and the preset too", () => {
  const plan = as(
    planInstall(sourceAt("1.0.0"), {
      ...empty,
      rootFiles: ["package.json", "tsconfig.json"],
    }),
    "apply",
  );

  assert.deepEqual(plan.adoption?.choices, typescript);
  assert.ok(plan.write.has(".ogham/coding/typescript.md"));
  assert.ok(plan.write.has(".ogham/coding/eslint/index.mjs"));
});

test("install adds .ogham/ to an existing .prettierignore and records the line", () => {
  const plan = as(
    planInstall(sourceAt("1.0.0"), {
      ...empty,
      contents: new Map([[".prettierignore", "dist/\n"]]),
    }),
    "apply",
  );

  assert.equal(plan.write.get(".prettierignore"), "dist/\n.ogham/\n");
  assert.deepEqual(plan.adoption?.lines, [
    { file: ".prettierignore", line: ".ogham/" },
    { file: "CLAUDE.md", line: "@AGENTS.md" },
  ]);
  assert.ok(!plan.adoption?.owned.has(".prettierignore"));
});

test("install leaves a .prettierignore that already has the line alone, and records nothing", () => {
  const plan = as(
    planInstall(sourceAt("1.0.0"), {
      ...empty,
      contents: new Map([[".prettierignore", ".ogham/\n"]]),
    }),
    "apply",
  );

  assert.ok(!plan.write.has(".prettierignore"));
  assert.deepEqual(
    plan.adoption?.lines.filter(({ file }) => file === ".prettierignore"),
    [],
  );
});

test("install on a repo that has a lock does nothing and points to update", () => {
  const plan = as(
    planInstall(sourceAt("2.0.0"), adopted(sourceAt("1.0.0"))),
    "done",
  );

  assert.match(plan.message, /already adopted/i);
  assert.match(plan.message, /update/);
});

test("install refuses when a path it would write has uncommitted changes, and names it", () => {
  for (const dirty of [
    ".ogham/coding/core.md",
    ".ogham/",
    ".prettierignore",
    "AGENTS.md",
  ]) {
    const plan = as(
      planInstall(sourceAt("1.0.0"), {
        ...empty,
        contents: new Map([[".prettierignore", "dist/\n"]]),
        dirty: [dirty],
      }),
      "refuse",
    );

    assert.match(plan.message, /uncommitted/);
    assert.ok(plan.message.includes(dirty === ".ogham/" ? LOCK_PATH : dirty));
  }
});

test("install is not stopped by uncommitted changes to a path it leaves alone", () => {
  as(
    planInstall(sourceAt("1.0.0"), { ...empty, dirty: [".prettierignore"] }),
    "apply",
  );
});

test("update on a repo with no lock, or an unreadable one, refuses", () => {
  assert.match(
    as(planUpdate(sourceAt("1.0.0"), empty, false), "refuse").message,
    /install/,
  );
  assert.match(
    as(
      planUpdate(sourceAt("1.0.0"), { ...empty, lockText: "{}" }, false),
      "refuse",
    ).message,
    /not a lock/,
  );
});

test("update to the same version changes nothing", () => {
  const plan = as(
    planUpdate(sourceAt("1.0.0"), adopted(sourceAt("1.0.0")), false),
    "done",
  );

  assert.match(plan.message, /1\.0\.0/);
});

test("update to the same version is not stopped by uncommitted changes, since it writes nothing", () => {
  const facts = { ...adopted(sourceAt("1.0.0")), dirty: [".ogham/"] };

  as(planUpdate(sourceAt("1.0.0"), facts, false), "done");
});

test("update to a newer version writes the files that changed, and asks for the new tag's commit", () => {
  const plan = as(
    planUpdate(
      sourceAt("1.1.0", "core, reworded\n"),
      adopted(sourceAt("1.0.0")),
      false,
    ),
    "apply",
  );

  assert.deepEqual(
    [...plan.write],
    [
      [".ogham/check.mjs", "check 1.1.0\n"],
      [".ogham/coding/core.md", "core, reworded\n"],
      [
        "AGENTS.md",
        "<!-- ogham:begin -->\n\ncore, reworded\n\n- **Language page:** `.ogham/coding/typescript.md`. Read it before writing code in its language.\nagents\n\n<!-- ogham:end -->\n",
      ],
    ],
  );
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.adoption?.version, "1.1.0");
  assert.equal(plan.adoption?.commit, undefined);
  assert.deepEqual(plan.discarded, []);
});

test("update keeps the choices the lock recorded, whatever the repo holds now", () => {
  const source = sourceAt("1.0.0");
  const owned = new Map([[".ogham/check.mjs", "check 1.0.0\n"]]);
  const lock = lockText(
    buildLock({
      version: "1.0.0",
      commit: "a".repeat(40),
      choices: { languages: [], preset: false },
      owned,
      blocks: new Map(),
      lines: [],
      created: [],
    }),
  );
  const plan = as(
    planUpdate(
      sourceAt("1.1.0"),
      {
        ...empty,
        lockText: lock,
        contents: new Map([
          ...owned,
          [".ogham/coding/core.md", source.files.get("coding/core.md") ?? ""],
          [".ogham/coding/rubric.md", "rubric\n"],
        ]),
        rootFiles: ["package.json", "tsconfig.json"],
        tracked: ["src/a.ts"],
      },
      false,
    ),
    "apply",
  );

  assert.deepEqual(plan.adoption?.choices, { languages: [], preset: false });
  assert.ok(!plan.write.has(".ogham/coding/eslint/index.mjs"));
  assert.ok(!plan.write.has(".ogham/coding/typescript.md"));
});

test("update removes an owned file the new version no longer ships", () => {
  const old = sourceAt("1.0.0");
  const next = {
    ...sourceAt("1.1.0"),
    files: new Map(
      [...sourceAt("1.1.0").files].filter(
        ([path]) => path !== "coding/rubric.md",
      ),
    ),
  };

  const plan = as(planUpdate(next, adopted(old), false), "apply");

  assert.deepEqual(plan.remove, [".ogham/coding/rubric.md"]);
  assert.ok(!plan.adoption?.owned.has(".ogham/coding/rubric.md"));
});

test("update stops on an owned file that was edited or deleted, and says which", () => {
  const facts = adopted(sourceAt("1.0.0"), {
    ".ogham/coding/core.md": "core, edited here\n",
    ".ogham/coding/rubric.md": undefined,
  });

  for (const source of [sourceAt("1.0.0"), sourceAt("1.1.0")]) {
    const plan = as(planUpdate(source, facts, false), "refuse");

    assert.deepEqual(plan.edits, [
      { path: ".ogham/coding/core.md", state: "edited" },
      { path: ".ogham/coding/rubric.md", state: "missing" },
    ]);
    assert.match(plan.message, /--force/);
    assert.match(plan.message, /ogham\.local\.md/);
  }
});

test("the edit stops update whether or not it is committed: uncommitted changes to the edited file are not what refuses", () => {
  const facts = {
    ...adopted(sourceAt("1.0.0"), {
      ".ogham/coding/core.md": "core, edited here\n",
    }),
    dirty: [".ogham/coding/core.md"],
  };

  const plan = as(planUpdate(sourceAt("1.0.0"), facts, false), "refuse");

  assert.equal(plan.edits.length, 1);
  assert.doesNotMatch(plan.message, /uncommitted/);
});

test("a file that differs only in its line endings is not an edit", () => {
  const facts = adopted(sourceAt("1.0.0"), {
    ".ogham/coding/core.md": "core\r\n",
  });

  as(planUpdate(sourceAt("1.0.0"), facts, false), "done");
});

test("update --force overwrites the edited files, at the same version too, and reports them as discarded", () => {
  const facts = {
    ...adopted(sourceAt("1.0.0"), {
      ".ogham/coding/core.md": "core, edited here\n",
      ".ogham/coding/rubric.md": undefined,
    }),
    dirty: [".ogham/coding/core.md"],
  };

  const plan = as(planUpdate(sourceAt("1.0.0"), facts, true), "apply");

  assert.deepEqual(
    [...plan.write],
    [
      [".ogham/coding/core.md", "core\n"],
      [".ogham/coding/rubric.md", "rubric\n"],
    ],
  );
  assert.deepEqual(plan.discarded, [
    { path: ".ogham/coding/core.md", state: "edited" },
    { path: ".ogham/coding/rubric.md", state: "missing" },
  ]);
  // The same version: the lock's commit stands, and no tag is looked up.
  assert.equal(plan.adoption?.commit, "a".repeat(40));
});

test("update refuses when a path it would write has uncommitted changes that are not an edit to an owned file", () => {
  for (const dirty of [".ogham/check.mjs", LOCK_PATH]) {
    const plan = as(
      planUpdate(
        sourceAt("1.1.0"),
        { ...adopted(sourceAt("1.0.0")), dirty: [dirty] },
        false,
      ),
      "refuse",
    );

    assert.match(plan.message, /uncommitted/);
    assert.ok(plan.message.includes(dirty));
    assert.deepEqual(plan.edits, []);
  }
});

test("update adds the .prettierignore line to a file that appeared since, keeping the lines already recorded", () => {
  const recorded = [{ file: "other", line: "x" }];
  const base = adopted(sourceAt("1.0.0"), {}, recorded);
  const plan = as(
    planUpdate(
      sourceAt("1.0.0"),
      {
        ...base,
        contents: new Map([...base.contents, [".prettierignore", "dist/\n"]]),
      },
      false,
    ),
    "apply",
  );

  assert.deepEqual([...plan.write], [[".prettierignore", "dist/\n.ogham/\n"]]);
  assert.deepEqual(plan.adoption?.lines, [
    { file: "CLAUDE.md", line: "@AGENTS.md" },
    ...recorded,
    { file: ".prettierignore", line: ".ogham/" },
  ]);
});

test("remove on a repo with no lock, or an unreadable one, refuses", () => {
  assert.match(as(planRemove(empty), "refuse").message, /has not adopted/);
  assert.match(
    as(planRemove({ ...empty, lockText: "[]" }), "refuse").message,
    /not a lock/,
  );
});

test("remove takes out the files the lock lists, the lock itself and the lines it recorded, and nothing else", () => {
  const line = { file: ".prettierignore", line: ".ogham/" };
  const base = adopted(sourceAt("1.0.0"), {}, [line]);
  const facts = {
    ...base,
    contents: new Map([
      ...base.contents,
      [".prettierignore", "dist/\n.ogham/\n"],
      [".ogham/notes.md", "the repo's own file\n"],
    ]),
  };

  const plan = as(planRemove(facts), "apply");

  assert.deepEqual(plan.remove, [
    ".ogham/check.mjs",
    ".ogham/coding/core.md",
    ".ogham/coding/eslint/index.mjs",
    ".ogham/coding/rubric.md",
    ".ogham/coding/typescript.md",
    "AGENTS.md",
    "CLAUDE.md",
    LOCK_PATH,
  ]);
  assert.deepEqual([...plan.write], [[".prettierignore", "dist/\n"]]);
  assert.equal(plan.adoption, undefined);
});

test("remove leaves a file alone when the recorded line is no longer in it, and skips an owned file that is already gone", () => {
  const line = { file: ".prettierignore", line: ".ogham/" };
  const base = adopted(
    sourceAt("1.0.0"),
    { ".ogham/coding/rubric.md": undefined },
    [line],
  );
  const facts = {
    ...base,
    contents: new Map([...base.contents, [".prettierignore", "dist/\n"]]),
  };

  const plan = as(planRemove(facts), "apply");

  assert.deepEqual([...plan.write], []);
  assert.ok(!plan.remove.includes(".ogham/coding/rubric.md"));
});

test("remove refuses when a path it would touch has uncommitted changes, an edited owned file included", () => {
  const line = { file: ".prettierignore", line: ".ogham/" };
  const base = adopted(sourceAt("1.0.0"), {}, [line]);
  const contents = new Map([
    ...base.contents,
    [".prettierignore", ".ogham/\n"],
  ]);

  for (const dirty of [".ogham/coding/core.md", LOCK_PATH, ".prettierignore"]) {
    const plan = as(
      planRemove({ ...base, contents, dirty: [dirty] }),
      "refuse",
    );

    assert.match(plan.message, /uncommitted/);
    assert.ok(plan.message.includes(dirty));
  }
});

test("git's status output gives the path of every entry, both paths of a rename included", () => {
  assert.deepEqual(
    statusPaths(
      " M .ogham/coding/core.md\0?? .ogham/new file.md\0R  to.md\0from.md\0!! .ogham/\0",
    ),
    [
      ".ogham/coding/core.md",
      ".ogham/new file.md",
      "to.md",
      "from.md",
      ".ogham/",
    ],
  );
  assert.deepEqual(statusPaths(""), []);
});

test("a tag's commit is read from git's ls-remote output, the peeled line first", () => {
  const tagObject = "1".repeat(40);
  const commit = "2".repeat(40);

  assert.equal(tagCommit(`${commit}\trefs/tags/v1.0.0\n`, "v1.0.0"), commit);
  assert.equal(
    tagCommit(
      `${tagObject}\trefs/tags/v1.0.0\n${commit}\trefs/tags/v1.0.0^{}\n`,
      "v1.0.0",
    ),
    commit,
  );
  assert.equal(
    tagCommit(`${commit}\trefs/tags/v1.0.0-rc\n`, "v1.0.0"),
    undefined,
  );
  assert.equal(tagCommit("", "v1.0.0"), undefined);
});

test("the hash of a planned file is the one the lock will carry", () => {
  const plan = as(planInstall(sourceAt("1.0.0"), empty), "apply");
  const adoption = plan.adoption;
  assert.ok(adoption);
  const lock = buildLock({ ...adoption, commit: "b".repeat(40) });

  assert.equal(lock.files[".ogham/coding/core.md"], contentHash("core\n"));
});
