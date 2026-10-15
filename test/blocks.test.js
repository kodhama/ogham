// The hook-in blocks and the local layer: where install puts the core and
// the pointers to the rest of the standard, how update rewrites them and
// remove takes them out, and what the check says about them. Most tests run
// the commands on a git repo in a temporary folder; the text functions they
// rest on are tested alone at the end.

import assert from "node:assert/strict";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import * as prettier from "prettier";

import {
  AGENTS_FILE,
  BEGIN,
  END,
  LOCAL_FILE,
  READ_LIMIT,
  blockText,
  contentHash,
  localProblems,
  readProblems,
  readWarnings,
  scanBlocks,
} from "../standard/check.mjs";
import { install, remove, update } from "../src/apply.mjs";
import { renderBlocks, withBlock, withoutBlock } from "../src/blocks.mjs";
import { run } from "../src/cli.mjs";
import {
  ioFor,
  lockOf,
  read,
  runVendoredCheck,
  shipped,
  shippedAt,
} from "./helpers/adoption.js";
import {
  commitAll,
  fixtureRepo,
  status,
  writeFiles,
} from "./helpers/fixture-repo.js";
import { portabilityProblems } from "./helpers/standard-text.js";

/** @typedef {import("../src/apply.mjs").Outcome} Outcome */

const CORE = shipped.files.get("coding/core.md") ?? "";
const LOCAL_TEMPLATE = shipped.templates.get("ogham.local.md") ?? "";
// A repo in a language with no page: the blocks name no language page.
const GO_REPO = { "go.mod": "module example.invalid/fixture\n" };
const TS_REPO = {
  "package.json": '{ "name": "fixture" }\n',
  "tsconfig.json": "{}\n",
  "src/a.ts": "export const a = 1;\n",
};
const TRELLIS_BLOCK = [
  "<!-- trellis:begin (managed by trellis — edit .trellis/, not this block) -->",
  "",
  "Conduct rules.",
  "",
  "<!-- trellis:end -->",
  "",
].join("\n");

/**
 * @param {Outcome} outcome
 */
const printed = (outcome) => outcome.lines.join("\n");

/**
 * @param {Outcome} outcome
 */
const succeeded = (outcome) => assert.equal(outcome.code, 0, printed(outcome));

/**
 * Effect: a repo holding `files`, adopted at the shipped version and
 * committed.
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} files
 */
const adopted = (t, files) => {
  const root = fixtureRepo(t, files);
  succeeded(install(ioFor(root), shipped));
  commitAll(root, "adopt ogham");
  return root;
};

/**
 * The ogham block in a file's text, from its begin marker to its end
 * marker, or `undefined` when it has none.
 * @param {string} text
 */
const blockIn = (text) => {
  const { span } = scanBlocks("file", text);
  return span === undefined ? undefined : blockText(text, span);
};

/**
 * How many times `part` occurs in `text`.
 * @param {string} text
 * @param {string} part
 */
const count = (text, part) => text.split(part).length - 1;

/**
 * The paths `git status` reports, sorted.
 * @param {string} root
 */
const statusPaths = (root) =>
  status(root)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();

test("a repo with no AGENTS.md or CLAUDE.md gets both: CLAUDE.md imports AGENTS.md, which holds the core inline, byte-identical", async (t) => {
  const root = fixtureRepo(t, GO_REPO);

  const outcome = install(ioFor(root), shipped);

  succeeded(outcome);
  assert.equal(read(root, "CLAUDE.md"), "@AGENTS.md\n");
  const agents = read(root, AGENTS_FILE);
  const vendored = read(root, ".ogham/coding/core.md");
  assert.equal(vendored, CORE);
  assert.ok(
    agents.includes(
      `<!-- prettier-ignore-start -->\n\n${vendored}\n<!-- prettier-ignore-end -->\n`,
    ),
    "the vendored core sits inline, whole, between the ignore markers",
  );
  assert.ok(agents.startsWith(`${BEGIN}\n`));
  assert.ok(agents.endsWith(`${END}\n`));
  assert.equal(count(agents, BEGIN), 1);
  assert.equal(read(root, LOCAL_FILE), LOCAL_TEMPLATE);
  const lock = lockOf(root);
  assert.deepEqual(lock.blocks, {
    [AGENTS_FILE]: contentHash(blockIn(agents) ?? ""),
  });
  assert.deepEqual(lock.added.files, [AGENTS_FILE, "CLAUDE.md"]);
  assert.deepEqual(lock.added.lines, [
    { file: "CLAUDE.md", line: "@AGENTS.md" },
  ]);
  assert.match(printed(outcome), /new file: AGENTS\.md/);
  assert.match(printed(outcome), /new file: CLAUDE\.md/);
  assert.match(printed(outcome), /new file: ogham\.local\.md/);
  commitAll(root, "adopt ogham");
  assert.deepEqual(await readProblems(root), []);
  assert.equal(runVendoredCheck(root).status, 0, runVendoredCheck(root).stderr);
});

test("a repo with CLAUDE.md but no AGENTS.md gets AGENTS.md, and CLAUDE.md gets the Claude block, so the core's text is there once", (t) => {
  const claude = "# Notes for the assistant\n\nUse tabs.\n";
  const root = fixtureRepo(t, { ...TS_REPO, "CLAUDE.md": claude });

  succeeded(install(ioFor(root), shipped));

  const agents = read(root, AGENTS_FILE);
  const claudeNow = read(root, "CLAUDE.md");
  assert.ok(agents.includes(CORE), "AGENTS.md holds the core");
  assert.ok(claudeNow.startsWith(`${claude}\n${BEGIN}\n`));
  assert.ok(claudeNow.endsWith(`${END}\n`));
  const block = claudeNow.slice(claude.length);
  assert.match(block, /^@\.ogham\/coding\/core\.md$/m);
  assert.match(block, /^@ogham\.local\.md$/m);
  // Every line of the core's text appears once across the two files.
  const firstRule = CORE.split("\n").find((line) =>
    line.startsWith("- **`og-"),
  );
  assert.ok(firstRule);
  assert.equal(count(`${agents}${claudeNow}`, firstRule), 1);
  assert.equal(count(`${agents}${claudeNow}`, CORE), 1);
  assert.deepEqual(Object.keys(lockOf(root).blocks), [
    AGENTS_FILE,
    "CLAUDE.md",
  ]);
  assert.deepEqual(lockOf(root).added.files, [AGENTS_FILE]);
});

test("the Claude block carries the rubric and language-page pointers, and no copy of the core", () => {
  const blocks = renderBlocks(shipped.templates, CORE, ["typescript"]);

  assert.match(blocks.claude, /`\.ogham\/coding\/rubric\.md`/);
  assert.match(blocks.claude, /`\.ogham\/coding\/typescript\.md`/);
  assert.match(blocks.agents, /`\.ogham\/coding\/rubric\.md`/);
  assert.match(blocks.agents, /`\.ogham\/coding\/typescript\.md`/);
  assert.match(blocks.agents, /^@ogham\.local\.md$/m);
  assert.ok(!blocks.claude.includes(CORE.split("\n")[2] ?? "missing"));
  assert.match(blocks.reviewer, /`\.ogham\/coding\/rubric\.md`/);
  assert.match(blocks.reviewer, /`ogham\.local\.md`/);
  assert.doesNotMatch(blocks.reviewer, /typescript\.md|@/);
  const without = renderBlocks(shipped.templates, CORE, []);
  assert.doesNotMatch(without.agents, /typescript\.md/);
  assert.doesNotMatch(without.claude, /typescript\.md/);
});

test("a CLAUDE.md that already imports AGENTS.md is left byte-identical", (t) => {
  const claude = "@AGENTS.md\n\n# Notes\n";
  const root = fixtureRepo(t, { ...GO_REPO, "CLAUDE.md": claude });

  succeeded(install(ioFor(root), shipped));

  assert.equal(read(root, "CLAUDE.md"), claude);
  assert.deepEqual(Object.keys(lockOf(root).blocks), [AGENTS_FILE]);
  assert.deepEqual(lockOf(root).added.lines, []);
});

test("update to a core that changed rewrites the inline text inside the block, and the diff shows it", (t) => {
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": "# Agents\n" });
  const newer = shippedAt("9.9.9");

  const outcome = update(ioFor(root, "2".repeat(40)), newer, false);

  succeeded(outcome);
  assert.match(printed(outcome), /diff --git a\/AGENTS\.md b\/AGENTS\.md/);
  assert.match(printed(outcome), /^\+A line the newer version adds\.$/m);
  const agents = read(root, AGENTS_FILE);
  assert.ok(agents.startsWith("# Agents\n\n"));
  assert.ok(agents.includes(newer.files.get("coding/core.md") ?? "missing"));
  assert.equal(count(agents, BEGIN), 1);
  assert.equal(
    lockOf(root).blocks[AGENTS_FILE],
    contentHash(blockIn(agents) ?? ""),
  );
  commitAll(root, "update ogham");
  // The check that update vendored is at the new version; run it.
  assert.equal(runVendoredCheck(root).status, 0, runVendoredCheck(root).stderr);
});

/**
 * Text of `bytes` bytes, in lines, for padding an `AGENTS.md`.
 * @param {number} bytes
 */
const filler = (bytes) => {
  const line = `${"x".repeat(63)}\n`;
  return line.repeat(Math.floor(bytes / line.length));
};

/**
 * The byte at which the ogham end marker ends in a text.
 * @param {string} text
 */
const endOffset = (text) =>
  Buffer.byteLength(text.slice(0, text.indexOf(END) + END.length), "utf8");

test("an AGENTS.md whose ogham end marker sits past byte 32,768 gets a warning naming the offset, and the run still succeeds", async (t) => {
  const root = fixtureRepo(t, { ...GO_REPO, "AGENTS.md": filler(30_000) });

  const outcome = install(ioFor(root), shipped);

  succeeded(outcome);
  const offset = endOffset(read(root, AGENTS_FILE));
  assert.ok(offset > READ_LIMIT);
  const warning = new RegExp(
    `AGENTS\\.md: the ogham block ends at byte ${offset}, past byte ${READ_LIMIT}`,
  );
  assert.match(printed(outcome), warning);
  commitAll(root, "adopt ogham");

  assert.deepEqual(await readProblems(root), []);
  assert.match((await readWarnings(root)).join("\n"), warning);
  const viaCommand = await run(["check"], root);
  assert.equal(viaCommand.code, 0);
  assert.match(viaCommand.lines.join("\n"), warning);
  const vendored = runVendoredCheck(root);
  assert.equal(vendored.status, 0);
  assert.match(vendored.stderr, warning);

  const updated = update(ioFor(root), shippedAt("9.9.9"), false);
  succeeded(updated);
  assert.match(
    printed(updated),
    new RegExp(
      `the ogham block ends at byte ${endOffset(read(root, AGENTS_FILE))}`,
    ),
  );
});

test("an AGENTS.md past 32,768 bytes whose block ends inside the limit gets no warning", async (t) => {
  const root = fixtureRepo(t, {
    ...GO_REPO,
    "AGENTS.md": `# Agents\n\n${BEGIN}\nold\n${END}\n\n${filler(40_000)}`,
  });

  const outcome = install(ioFor(root), shipped);

  succeeded(outcome);
  const agents = read(root, AGENTS_FILE);
  assert.ok(endOffset(agents) < READ_LIMIT);
  assert.ok(Buffer.byteLength(agents, "utf8") > READ_LIMIT);
  assert.doesNotMatch(printed(outcome), /ends at byte/);
  commitAll(root, "adopt ogham");
  assert.deepEqual(await readWarnings(root), []);
});

test("the inline core sits inside prettier-ignore, and Prettier leaves every block's hash, and the blocks' own lines, unchanged", async (t) => {
  const root = adopted(t, {
    ...TS_REPO,
    "AGENTS.md": "# Agents\n\nSome *emphasis* Prettier rewrites.\n",
    "CLAUDE.md": "# Notes\n",
    "CODING_STANDARDS.md": "# Standards\n",
  });
  const lock = lockOf(root);

  for (const file of [AGENTS_FILE, "CLAUDE.md", "CODING_STANDARDS.md"]) {
    const text = read(root, file);
    const formatted = await prettier.format(text, { parser: "markdown" });
    const block = blockIn(formatted);
    assert.ok(block, `${file} keeps its block`);
    assert.equal(contentHash(block), lock.blocks[file], file);
  }
  const agents = read(root, AGENTS_FILE);
  const block = blockIn(agents) ?? "";
  const ignored = block.slice(
    block.indexOf("<!-- prettier-ignore-start -->"),
    block.indexOf("<!-- prettier-ignore-end -->"),
  );
  assert.ok(
    ignored.includes(CORE.trimEnd()),
    "the core is inside the ignore markers",
  );
  // The rest of AGENTS.md was not Prettier-clean, and Prettier did change it.
  const formatted = await prettier.format(agents, { parser: "markdown" });
  assert.match(formatted, /Some _emphasis_/);

  // Each block, alone or after clean text, is already as Prettier writes it.
  const blocks = renderBlocks(shipped.templates, CORE, ["typescript"]);
  for (const text of [
    `${blocks.agents}\n`,
    `${blocks.claude}\n`,
    `${blocks.reviewer}\n`,
    `# Agents\n\n${TRELLIS_BLOCK}\n${blocks.agents}\n`,
  ]) {
    assert.equal(await prettier.format(text, { parser: "markdown" }), text);
  }
});

test("a repo whose AGENTS.md has content gets the block appended; a re-run does not duplicate it, and the rest stays byte-identical", (t) => {
  const own = "# Agents\n\nOur own rules.\n";
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });

  const agents = read(root, AGENTS_FILE);
  assert.ok(agents.startsWith(`${own}\n${BEGIN}\n`));
  assert.equal(count(agents, BEGIN), 1);

  const again = install(ioFor(root), shipped);
  succeeded(again);
  assert.match(printed(again), /Already adopted/);
  const sameVersion = update(ioFor(root), shipped, false);
  succeeded(sameVersion);
  assert.match(printed(sameVersion), /Already at version/);
  assert.equal(read(root, AGENTS_FILE), agents);
  assert.equal(status(root), "");
});

test("install on a repo that kept an ogham block but no lock rewrites that block in place", (t) => {
  const root = fixtureRepo(t, {
    ...GO_REPO,
    "AGENTS.md": `# Agents\n\n${BEGIN}\nold text\n${END}\n\nAfter.\n`,
  });

  succeeded(install(ioFor(root), shipped));

  const agents = read(root, AGENTS_FILE);
  assert.equal(count(agents, BEGIN), 1);
  assert.ok(agents.startsWith(`# Agents\n\n${BEGIN}\n`));
  assert.ok(agents.endsWith(`${END}\n\nAfter.\n`));
  assert.doesNotMatch(agents, /old text/);
});

test("a repo with CODING_STANDARDS.md gets the reviewer block there; a repo without one does not get the file", (t) => {
  const standards = "# Coding standards\n\nShort functions.\n";
  const withFile = adopted(t, { ...GO_REPO, "CODING_STANDARDS.md": standards });
  const without = adopted(t, GO_REPO);

  const text = read(withFile, "CODING_STANDARDS.md");
  assert.ok(text.startsWith(`${standards}\n${BEGIN}\n`));
  assert.match(text, /`\.ogham\/coding\/rubric\.md`/);
  assert.doesNotMatch(text, /og-pure-by-default/);
  assert.ok(lockOf(withFile).blocks["CODING_STANDARDS.md"]);
  assert.equal(status(without), "");
  assert.throws(() => read(without, "CODING_STANDARDS.md"), /ENOENT/);
  assert.equal(lockOf(without).blocks["CODING_STANDARDS.md"], undefined);
});

test("update places the reviewer block in a CODING_STANDARDS.md made after install, and a second update changes nothing", (t) => {
  const root = adopted(t, GO_REPO);
  writeFiles(root, { "CODING_STANDARDS.md": "# Standards\n" });
  commitAll(root, "add standards");

  succeeded(update(ioFor(root), shipped, false));

  assert.match(read(root, "CODING_STANDARDS.md"), /ogham:begin/);
  assert.ok(lockOf(root).blocks["CODING_STANDARDS.md"]);
  commitAll(root, "update");
  const again = update(ioFor(root), shipped, false);
  succeeded(again);
  assert.match(printed(again), /Already at version/);
  assert.equal(status(root), "");
});

test("re-running update leaves the Claude block and the reviewer block as they are", (t) => {
  const root = adopted(t, {
    ...TS_REPO,
    "CLAUDE.md": "# Notes\n",
    "CODING_STANDARDS.md": "# Standards\n",
  });
  const claude = read(root, "CLAUDE.md");
  const standards = read(root, "CODING_STANDARDS.md");

  succeeded(update(ioFor(root, "2".repeat(40)), shippedAt("9.9.9"), false));
  commitAll(root, "update");
  const again = update(ioFor(root, "2".repeat(40)), shippedAt("9.9.9"), false);

  succeeded(again);
  assert.match(printed(again), /Already at version 9\.9\.9/);
  assert.equal(read(root, "CLAUDE.md"), claude);
  assert.equal(read(root, "CODING_STANDARDS.md"), standards);
  assert.equal(status(root), "");
});

test("an AGENTS.md holding a trellis block keeps it intact, with ogham's block after it, never inside", (t) => {
  const own = `# Agents\n\n${TRELLIS_BLOCK}`;
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });

  const agents = read(root, AGENTS_FILE);
  assert.ok(agents.startsWith(`${own}\n${BEGIN}\n`));
  assert.ok(agents.indexOf(BEGIN) > agents.indexOf("<!-- trellis:end -->"));
});

test("a block appended at the end would land inside an unclosed block of another tool, so install stops", (t) => {
  const root = fixtureRepo(t, {
    ...GO_REPO,
    "AGENTS.md": "# Agents\n\n<!-- trellis:begin -->\nConduct.\n",
  });

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    printed(outcome),
    /AGENTS\.md:3 opens a trellis block that never closes/,
  );
  assert.match(printed(outcome), /Nothing was written/);
  assert.equal(status(root), "");
});

for (const [name, text, lines] of /** @type {const} */ ([
  [
    "two ogham begin markers",
    `# A\n${BEGIN}\nx\n${END}\n${BEGIN}\ny\n${END}\n`,
    [/AGENTS\.md:5 opens a second ogham block; the first opens at line 2/],
  ],
  [
    "a begin without an end",
    `# A\n\n${BEGIN}\nx\n`,
    [/AGENTS\.md:3 opens an ogham block that never closes/],
  ],
  [
    "an end without a begin",
    `# A\n${END}\n`,
    [/AGENTS\.md:2 closes an ogham block that was never opened/],
  ],
  [
    "an ogham block inside another tool's block",
    `<!-- trellis:begin -->\n${BEGIN}\nx\n${END}\n<!-- trellis:end -->\n`,
    [
      /AGENTS\.md:2 opens an ogham block inside the trellis block that opens at line 1/,
    ],
  ],
])) {
  test(`${name} in AGENTS.md stops install with the file and line numbers`, (t) => {
    const root = fixtureRepo(t, { ...GO_REPO, "AGENTS.md": text });

    const outcome = install(ioFor(root), shipped);

    assert.equal(outcome.code, 1);
    for (const line of lines) assert.match(printed(outcome), line);
    assert.match(printed(outcome), /Nothing was written/);
    assert.equal(read(root, AGENTS_FILE), text);
    assert.equal(status(root), "");
  });
}

test("broken ogham markers stop update and remove too, and check reports them", async (t) => {
  const root = adopted(t, GO_REPO);
  const broken = `${read(root, AGENTS_FILE)}${BEGIN}\n`;
  writeFiles(root, { "AGENTS.md": broken });
  commitAll(root, "break the markers");
  const line = broken.split("\n").length - 1;
  const message = new RegExp(
    `AGENTS\\.md:${line} opens a second ogham block; the first opens at line 1`,
  );

  for (const outcome of [
    update(ioFor(root), shippedAt("9.9.9"), true),
    remove(ioFor(root)),
  ]) {
    assert.equal(outcome.code, 1);
    assert.match(printed(outcome), message);
    assert.match(printed(outcome), /Nothing was written/);
  }
  assert.equal(status(root), "");
  assert.match((await readProblems(root)).join("\n"), message);
});

test("ogham markers inside a fenced code block are text, not a block", (t) => {
  const own = `# Agents\n\n\`\`\`md\n${BEGIN}\n${BEGIN}\n\`\`\`\n`;
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });

  assert.ok(read(root, AGENTS_FILE).startsWith(`${own}\n${BEGIN}\n`));
  succeeded(remove(ioFor(root)));
  assert.equal(read(root, AGENTS_FILE), own);
});

test("ogham markers inside a tilde fence, or a fence indented four spaces in a nested list, are text", (t) => {
  for (const own of [
    `# Agents\n\n~~~md\n${BEGIN}\n${END}\n~~~\n`,
    `- Item\n  - Nested\n\n    \`\`\`md\n    ${BEGIN}\n    example\n    ${END}\n    \`\`\`\n`,
  ]) {
    const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });

    assert.ok(read(root, AGENTS_FILE).startsWith(`${own}\n${BEGIN}\n`), own);
    succeeded(remove(ioFor(root)));
    assert.equal(read(root, AGENTS_FILE), own);
  }
});

test("a line that opens and closes inline code with three backticks is not a fence", (t) => {
  const own = "# Agents\n\n```npm test``` runs the tests.\n";
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });

  assert.ok(read(root, AGENTS_FILE).startsWith(`${own}\n${BEGIN}\n`));
  succeeded(remove(ioFor(root)));
  assert.equal(read(root, AGENTS_FILE), own);
});

test("an AGENTS.md that ends inside an open code fence stops install, naming the line the fence opens at", (t) => {
  const own = "# Agents\n\n```sh\nnpm test\n";
  const root = fixtureRepo(t, { ...GO_REPO, "AGENTS.md": own });

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.match(
    printed(outcome),
    /AGENTS\.md:3 opens a code fence that never closes, so a block added at its end would sit inside it/,
  );
  assert.match(printed(outcome), /Nothing was written/);
  assert.equal(read(root, AGENTS_FILE), own);
  assert.equal(status(root), "");
});

for (const [name, wrap] of /** @type {const} */ ([
  [
    "an unclosed fence above it",
    (/** @type {string} */ text) =>
      text.replace("# Agents\n\n", "# Agents\n\n```sh\n"),
  ],
  [
    "a fence around it",
    (/** @type {string} */ text) =>
      `${text.replace("# Agents\n\n", "# Agents\n\n```sh\n")}\`\`\`\n`,
  ],
])) {
  test(`a pinned block hidden by ${name} stops remove and update --force, naming the fence's line, and nothing is written`, (t) => {
    const root = adopted(t, { ...GO_REPO, "AGENTS.md": "# Agents\n" });
    const hidden = wrap(read(root, AGENTS_FILE));
    writeFiles(root, { "AGENTS.md": hidden });
    commitAll(root, "fence the block");

    for (const outcome of [
      remove(ioFor(root)),
      update(ioFor(root), shippedAt("9.9.9"), true),
    ]) {
      assert.equal(outcome.code, 1, printed(outcome));
      assert.match(
        printed(outcome),
        /AGENTS\.md:3 opens a code fence that hides the ogham marker at line 4/,
      );
      assert.match(printed(outcome), /Nothing was written/);
    }
    assert.equal(read(root, AGENTS_FILE), hidden);
    assert.equal(status(root), "");
  });
}

for (const [name, claude] of /** @type {const} */ ([
  ["a fenced code block", "# Notes\n\n```\n@AGENTS.md\n```\n"],
  ["an indented code block", "# Notes\n\n    @AGENTS.md\n"],
  ["an inline code span", "# Notes\n\nWrite `see @AGENTS.md first` there.\n"],
])) {
  test(`a CLAUDE.md whose only @AGENTS.md sits in ${name} does not import it, and gets the Claude block`, (t) => {
    const root = fixtureRepo(t, { ...GO_REPO, "CLAUDE.md": claude });

    succeeded(install(ioFor(root), shipped));

    assert.ok(read(root, "CLAUDE.md").startsWith(`${claude}\n${BEGIN}\n`));
    assert.ok(lockOf(root).blocks["CLAUDE.md"]);
  });
}

test("remove keeps an empty AGENTS.md the repo had before install", (t) => {
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": "" });
  assert.deepEqual(lockOf(root).added.files, ["CLAUDE.md"]);

  succeeded(remove(ioFor(root)));

  assert.equal(read(root, AGENTS_FILE), "");
});

test("an existing ogham.local.md is never rewritten by install, update or remove", (t) => {
  const local = "# Ours\n\n- **`local-short-files`** Keep files short.\n";
  const root = adopted(t, { ...GO_REPO, [LOCAL_FILE]: local });
  assert.equal(read(root, LOCAL_FILE), local);

  succeeded(update(ioFor(root), shippedAt("9.9.9"), false));
  assert.equal(read(root, LOCAL_FILE), local);
  commitAll(root, "update");

  succeeded(remove(ioFor(root)));
  assert.equal(read(root, LOCAL_FILE), local);
  assert.ok(!statusPaths(root).includes(LOCAL_FILE));
});

test("update does not put back an ogham.local.md the repo deleted, and remove keeps the one install created", (t) => {
  const root = adopted(t, GO_REPO);
  assert.equal(read(root, LOCAL_FILE), LOCAL_TEMPLATE);

  succeeded(remove(ioFor(root)));
  assert.equal(read(root, LOCAL_FILE), LOCAL_TEMPLATE);

  const again = adopted(t, GO_REPO);
  rmSync(join(again, LOCAL_FILE));
  commitAll(again, "drop the local layer");
  succeeded(update(ioFor(again), shippedAt("9.9.9"), false));
  assert.throws(() => read(again, LOCAL_FILE), /ENOENT/);
});

test("remove deletes every ogham block and leaves the rest of each file byte-identical", (t) => {
  const files = {
    ...TS_REPO,
    "AGENTS.md": `# Agents\n\n${TRELLIS_BLOCK}`,
    "CLAUDE.md": "# Notes\n\nUse tabs.\n",
    "CODING_STANDARDS.md": "# Standards",
  };
  const root = adopted(t, files);

  const outcome = remove(ioFor(root));

  succeeded(outcome);
  for (const file of /** @type {const} */ ([
    "AGENTS.md",
    "CLAUDE.md",
    "CODING_STANDARDS.md",
  ])) {
    assert.equal(read(root, file), files[file], file);
  }
  assert.equal(read(root, LOCAL_FILE), LOCAL_TEMPLATE);
  assert.ok(!statusPaths(root).includes(LOCAL_FILE));
});

test("remove deletes the AGENTS.md and CLAUDE.md it created while they hold nothing but ogham's text", (t) => {
  const root = adopted(t, GO_REPO);

  succeeded(remove(ioFor(root)));

  assert.throws(() => read(root, AGENTS_FILE), /ENOENT/);
  assert.throws(() => read(root, "CLAUDE.md"), /ENOENT/);
  assert.deepEqual(
    statusPaths(root).filter((path) => !path.startsWith(".ogham/")),
    ["AGENTS.md", "CLAUDE.md"],
  );
});

test("remove keeps an AGENTS.md and a CLAUDE.md it created once the repo added to them, and takes out only ogham's text", (t) => {
  const root = adopted(t, GO_REPO);
  writeFiles(root, {
    "AGENTS.md": `# Ours\n\n${read(root, AGENTS_FILE)}`,
    "CLAUDE.md": `${read(root, "CLAUDE.md")}\nUse tabs.\n`,
  });
  commitAll(root, "add our own text");

  succeeded(remove(ioFor(root)));

  assert.equal(read(root, AGENTS_FILE), "# Ours\n");
  assert.equal(read(root, "CLAUDE.md"), "\nUse tabs.\n");
});

for (const [name, own] of /** @type {const} */ ([
  ["CRLF line endings", "# Agents\r\n\r\nOurs.\r\n"],
  ["no line break at its end", "# Agents\n\nOurs."],
  ["a blank line at its end", "# Agents\n\n"],
])) {
  test(`an AGENTS.md with ${name} gets the block in its own style, and remove gives back its exact bytes`, (t) => {
    const root = adopted(t, { ...GO_REPO, "AGENTS.md": own });
    const agents = read(root, AGENTS_FILE);
    assert.ok(agents.startsWith(own));
    if (own.includes("\r\n")) {
      assert.equal(
        count(agents, "\n"),
        count(agents, "\r\n"),
        "every line break is CRLF",
      );
    }
    assert.equal(
      lockOf(root).blocks[AGENTS_FILE],
      contentHash(blockIn(agents) ?? ""),
    );
    assert.equal(
      runVendoredCheck(root).status,
      0,
      runVendoredCheck(root).stderr,
    );

    succeeded(remove(ioFor(root)));

    assert.equal(read(root, AGENTS_FILE), own);
  });
}

test("check fails when a placed block was deleted, naming the file", async (t) => {
  const own = "# Agents\n";
  const root = adopted(t, {
    ...GO_REPO,
    "AGENTS.md": own,
    "CODING_STANDARDS.md": "# S\n",
  });
  writeFiles(root, { "AGENTS.md": own });

  const found = (await readProblems(root)).join("\n");

  assert.match(found, /AGENTS\.md has no ogham block/);
  assert.doesNotMatch(found, /CODING_STANDARDS\.md/);
  assert.equal(runVendoredCheck(root).status, 1);
});

test("check fails when a placed block's text was edited, naming the file and saying a formatter may have caused it", async (t) => {
  const root = adopted(t, { ...GO_REPO, "CODING_STANDARDS.md": "# S\n" });
  writeFiles(root, {
    "CODING_STANDARDS.md": read(root, "CODING_STANDARDS.md").replace(
      "grade a diff",
      "grade the diff",
    ),
  });

  const found = (await readProblems(root)).join("\n");

  assert.match(
    found,
    /The ogham block in CODING_STANDARDS\.md differs from its pinned text\. A formatter may have caused it/,
  );
  assert.doesNotMatch(found, /AGENTS\.md/);
  const vendored = runVendoredCheck(root);
  assert.equal(vendored.status, 1);
  assert.match(vendored.stderr, /CODING_STANDARDS\.md/);
});

test("update stops on an edited block and shows the edit; --force puts the block back", (t) => {
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": "# Agents\n" });
  const pinned = read(root, AGENTS_FILE);
  const edited = pinned.replace(
    "### Where the rest",
    "### Where the rest of it",
  );
  writeFiles(root, { "AGENTS.md": edited });
  commitAll(root, "edit the block");

  const stopped = update(ioFor(root), shippedAt("9.9.9"), false);

  assert.equal(stopped.code, 1);
  assert.match(printed(stopped), /AGENTS\.md \(ogham block edited\)/);
  assert.match(printed(stopped), /^\+### Where the rest of it/m);
  assert.match(printed(stopped), /Nothing was written/);
  assert.equal(read(root, AGENTS_FILE), edited);

  const forced = update(ioFor(root), shipped, true);
  succeeded(forced);
  assert.match(printed(forced), /These local edits were discarded:/);
  assert.equal(read(root, AGENTS_FILE), pinned);
});

test("update --force puts back a block that was deleted, after the repo's own text", (t) => {
  const root = adopted(t, { ...GO_REPO, "AGENTS.md": "# Agents\n" });
  const pinned = read(root, AGENTS_FILE);
  writeFiles(root, { "AGENTS.md": "# Agents\n" });
  commitAll(root, "delete the block");

  const stopped = update(ioFor(root), shipped, false);
  assert.equal(stopped.code, 1);
  assert.match(printed(stopped), /AGENTS\.md \(ogham block missing\)/);

  succeeded(update(ioFor(root), shipped, true));
  assert.equal(read(root, AGENTS_FILE), pinned);
});

test("install refuses when AGENTS.md has uncommitted changes, and writes nothing", (t) => {
  const root = fixtureRepo(t, { ...GO_REPO, "AGENTS.md": "# Agents\n" });
  writeFiles(root, { "AGENTS.md": "# Agents, edited\n" });

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.match(printed(outcome), /uncommitted changes:\n {2}AGENTS\.md/);
  assert.deepEqual(statusPaths(root), ["AGENTS.md"]);
});

test("a block that does not read back as written rolls the whole install back", (t) => {
  const own = "# Agents\n";
  const root = fixtureRepo(t, {
    ...GO_REPO,
    "AGENTS.md": own,
    "CODING_STANDARDS.md": "# S\n",
  });

  const io = ioFor(root);
  // The block's text, not only the file's, comes back changed.
  /** @type {import("../src/apply.mjs").Io} */
  const corrupting = {
    ...io,
    write: (path, text) =>
      io.write(
        path,
        path === "CODING_STANDARDS.md"
          ? text.replace("rubric", "rubrik")
          : text,
      ),
  };

  const outcome = install(corrupting, shipped);

  assert.equal(outcome.code, 1);
  assert.match(printed(outcome), /CODING_STANDARDS\.md did not match the lock/);
  assert.match(printed(outcome), /put every path it touched back/);
  assert.equal(read(root, AGENTS_FILE), own);
  assert.equal(status(root), "");
});

test("check fails on an og- ID the core lacks and on a duplicate local- ID; a unique local- rule passes", async (t) => {
  const root = adopted(t, GO_REPO);
  const good = [
    "# Local",
    "",
    "- `og-no-module-state`: no singletons either.",
    "- **`local-short-files`** Keep files short.",
    "- **`local-no-default-exports`** Name every export.",
    "",
  ].join("\n");
  writeFiles(root, { [LOCAL_FILE]: good });
  assert.deepEqual(await readProblems(root), []);

  writeFiles(root, {
    [LOCAL_FILE]: `${good}- og-no-such-rule in \`src/\`: legacy.\n- **\`local-short-files\`** Again.\n`,
  });
  const found = (await readProblems(root)).join("\n");

  assert.match(
    found,
    /ogham\.local\.md:6 cites og-no-such-rule, which the core does not define/,
  );
  assert.match(
    found,
    /ogham\.local\.md:7 defines local-short-files again; it is first defined at line 4/,
  );
  assert.equal(runVendoredCheck(root).status, 1);
});

test("a CLAUDE.md that is a symbolic link to AGENTS.md stops install, which puts AGENTS.md back", (t) => {
  const own = "# Agents\n";
  const root = fixtureRepo(t, { ...GO_REPO, "AGENTS.md": own });
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  commitAll(root, "link CLAUDE.md to AGENTS.md");

  const outcome = install(ioFor(root), shipped);

  assert.equal(outcome.code, 1);
  assert.match(printed(outcome), /CLAUDE\.md is a symbolic link/);
  assert.match(printed(outcome), /put every path it touched back/);
  assert.equal(read(root, AGENTS_FILE), own);
  assert.equal(status(root), "");
});

// The text functions alone.

test("the local layer's check reads IDs from the core and the file it is given", () => {
  const core = "- **`og-a`** Rule a.\n- **`og-b-c`** Rule b.\n";

  assert.deepEqual(localProblems(undefined, core), []);
  assert.deepEqual(localProblems("cites og-a and og-b-c.\n", core), []);
  assert.deepEqual(
    localProblems("cites og-<id> as a placeholder.\n", core),
    [],
  );
  assert.deepEqual(
    localProblems("- **`local-x`** One.\n- **local-x** Two.\n", core),
    ["ogham.local.md:2 defines local-x again; it is first defined at line 1."],
  );
  assert.deepEqual(
    localProblems(
      "```md\n- **`local-x`** Example.\n```\n- **`local-x`** Real.\n",
      core,
    ),
    [],
  );
  assert.deepEqual(localProblems("og-zz og-zz\n", core), [
    "ogham.local.md:1 cites og-zz, which the core does not define.",
  ]);
  // With no core to read, the IDs cannot be judged; drift reports the core.
  assert.deepEqual(localProblems("og-zz\n", undefined), []);
});

test("an og- inside a URL or a file name is not a citation; one at a sentence's end is", () => {
  const core = "- **`og-a`** Rule a.\n";

  assert.deepEqual(
    localProblems(
      "See https://example.com/og-image.png and og-notes.md.\n",
      core,
    ),
    [],
  );
  assert.deepEqual(localProblems("Then see og-no-hidden-inputs.\n", core), [
    "ogham.local.md:1 cites og-no-hidden-inputs, which the core does not define.",
  ]);
});

test("the local layer's code-level exception reads true in any language, with the lint disable only as an example", () => {
  assert.match(
    LOCAL_TEMPLATE,
    /It is a comment at the spot, `og-<id>: <effect>; <reason>`\./,
  );
  assert.match(
    LOCAL_TEMPLATE,
    /for example, in TypeScript, `eslint-disable-next-line ogham\/<rule> -- og-<id>: <effect>; <reason>`/,
  );
  assert.match(LOCAL_TEMPLATE, /a plain comment otherwise\./);
});

test("the agents block tells an agent that does not follow imports to read the local layer", () => {
  const { agents } = renderBlocks(shipped.templates, CORE, []);

  assert.match(
    agents,
    /^- \*\*This repo's own layer:\*\* `ogham\.local\.md` .* Read it before writing or reviewing code\.$/m,
  );
});

test("the shipped local-layer template passes the check against the shipped core", () => {
  assert.deepEqual(localProblems(LOCAL_TEMPLATE, CORE), []);
  for (const heading of ["## Tightenings", "## Local rules", "## Exemptions"]) {
    assert.match(LOCAL_TEMPLATE, new RegExp(`^${heading}$`, "m"));
  }
});

test("a block goes at the end and comes back out to the same bytes, whatever the text's ending", () => {
  const block = `${BEGIN}\n\nbody\n\n${END}`;
  for (const text of ["", "a\n", "a", "a\n\n", "a\r\nb\r\n", "a\r\nb"]) {
    const placed = withBlock(text, block);
    assert.ok(placed.startsWith(text), JSON.stringify(text));
    assert.equal(withoutBlock(placed), text, JSON.stringify(text));
    assert.equal(
      withBlock(placed, block),
      placed,
      "placing it again changes nothing",
    );
  }
  assert.equal(withBlock("", block), `${block}\n`);
  assert.equal(withBlock("a\n", block), `a\n\n${block}\n`);
  assert.equal(withBlock("a", block), `a\n\n${block}`);
});

test("a block already in the text is replaced where it stands, keeping what is around it", () => {
  const text = `top\n\n${BEGIN}\nold\n${END}\n\nbottom\n`;

  assert.equal(
    withBlock(text, `${BEGIN}\nnew\n${END}`),
    `top\n\n${BEGIN}\nnew\n${END}\n\nbottom\n`,
  );
  assert.equal(withoutBlock(text), "top\n\nbottom\n");
});

test("a block on the first line of a file with a byte-order mark keeps the mark when replaced or taken out", () => {
  const text = `\uFEFF${BEGIN}\nold\n${END}\n\nrest\n`;

  assert.equal(
    withBlock(text, `${BEGIN}\nnew\n${END}`),
    `\uFEFF${BEGIN}\nnew\n${END}\n\nrest\n`,
  );
  assert.equal(withoutBlock(text), "\uFEFFrest\n");
});

test("the scan names a code fence left open at the end, and inline code is no fence", () => {
  assert.equal(
    scanBlocks("F.md", "a\n```sh\nb\n").unclosed,
    "F.md:2 opens a code fence that never closes",
  );
  assert.equal(scanBlocks("F.md", "```a``` b\n").unclosed, undefined);
  assert.equal(
    scanBlocks("F.md", `\`\`\`a\`\`\` b\n${BEGIN}\n${END}\n`).span?.start,
    1,
  );
});

test("the scan finds the one block, and reports each broken marker by line", () => {
  assert.deepEqual(scanBlocks("F.md", `a\n${BEGIN}\nb\n${END}\n`), {
    span: { start: 1, end: 3 },
    errors: [],
    unclosed: undefined,
    hidden: undefined,
  });
  assert.deepEqual(scanBlocks("F.md", "a\n"), {
    span: undefined,
    errors: [],
    unclosed: undefined,
    hidden: undefined,
  });
  assert.deepEqual(
    scanBlocks("F.md", `${BEGIN}\n${BEGIN}\n${END}\n${END}\n`).errors,
    [
      "F.md:2 opens a second ogham block; the first opens at line 1.",
      "F.md:4 closes an ogham block that was never opened.",
    ],
  );
  assert.equal(
    scanBlocks("F.md", "<!-- x:begin -->\na\n").unclosed,
    "F.md:1 opens a x block that never closes",
  );
  assert.equal(
    scanBlocks("F.md", `${BEGIN}   \nb\n  ${END}\n`).span?.end,
    2,
    "markers may carry spaces around them",
  );
});

test("what ogham writes into a repo's own files reads the same in any repo and under any agent", () => {
  const blocks = renderBlocks(shipped.templates, CORE, ["typescript"]);
  for (const text of [
    blocks.agents.replace(CORE, ""),
    blocks.claude,
    blocks.reviewer,
    LOCAL_TEMPLATE,
  ]) {
    assert.deepEqual(portabilityProblems(text), []);
  }
  assert.equal(shipped.templates.get("CLAUDE.md"), "@AGENTS.md\n");
});

test("the local-layer template is already as Prettier writes it", async () => {
  assert.equal(
    await prettier.format(LOCAL_TEMPLATE, { parser: "markdown" }),
    LOCAL_TEMPLATE,
  );
});
