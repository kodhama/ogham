// The one file that touches the disk and git. It reads what a command needs
// to decide, hands that to the pure plans in `plan.mjs`, and carries the plan
// out all or nothing: it snapshots every path it will touch, writes, checks
// what it wrote against the lock, writes the lock last, and on any failure
// puts every path back as it was.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  LOCK_PATH,
  VERSION,
  contentHash,
  drift,
  parseLock,
} from "../standard/check.mjs";
import { nulList, statusPaths, tagCommit } from "./git-text.mjs";
import { buildLock, lockText } from "./lock.mjs";
import { OUTSIDE, planInstall, planRemove, planUpdate } from "./plan.mjs";
import { OWNED_ROOT } from "./vendor.mjs";

/** @typedef {import("../standard/check.mjs").Drift} Drift */
/** @typedef {import("../standard/check.mjs").Lock} Lock */
/** @typedef {import("./plan.mjs").Facts} Facts */
/** @typedef {import("./plan.mjs").Plan} Plan */
/** @typedef {import("./plan.mjs").Source} Source */

/**
 * The repo as a command sees it. Every path is relative to the repo's root
 * and uses forward slashes.
 * @typedef {{
 *   readonly read: (path: string) => string | undefined,
 *   readonly write: (path: string, text: string) => void,
 *   readonly remove: (path: string) => void,
 *   readonly list: (dir: string) => readonly string[],
 *   readonly git: (args: readonly string[]) => { readonly ok: boolean, readonly out: string },
 * }} Io a file's text, or `undefined` when there is none; write a file, making its folders; remove a file, then each parent folder it leaves empty; every file under a folder, at any depth; run git in the repo, with what it printed to standard output, or to standard error when it failed
 */

/**
 * What a command ends with: its exit code, and the lines to print.
 * @typedef {{ readonly code: number, readonly lines: readonly string[] }} Outcome
 */

// Where `install` and `update` look up the commit behind a version's tag.
export const REMOTE = "https://github.com/kodhama/ogham.git";

const SHIPPED_ROOT = "standard";

/**
 * Whether an error is the file system saying there is no such file.
 * @param {unknown} error
 * @param {string} code
 */
const isCode = (error, code) =>
  /** @type {NodeJS.ErrnoException} */ (error).code === code;

/**
 * Effect: the repo at `root`, through the file system and git.
 * @param {string} root the repo's root folder
 * @returns {Io}
 */
export const repoIo = (root) => {
  const at = (/** @type {string} */ path) => join(root, path);

  /**
   * @param {string} dir
   * @returns {readonly string[]}
   */
  const list = (dir) => {
    try {
      return readdirSync(at(dir), { withFileTypes: true }).flatMap(
        /** @returns {readonly string[]} */ (entry) => {
          const path = `${dir}/${entry.name}`;
          if (entry.isDirectory()) return list(path);
          return entry.isFile() ? [path] : [];
        },
      );
    } catch (error) {
      if (isCode(error, "ENOENT")) return [];
      throw error;
    }
  };

  /** @param {string} dir */
  const pruneEmpty = (dir) => {
    if (dir === "." || dir === "") return;
    try {
      rmdirSync(at(dir));
    } catch (error) {
      if (isCode(error, "ENOTEMPTY") || isCode(error, "EEXIST")) return;
      if (isCode(error, "ENOENT")) return pruneEmpty(dirname(dir));
      throw error;
    }
    pruneEmpty(dirname(dir));
  };

  return {
    read: (path) => {
      try {
        return readFileSync(at(path), "utf8");
      } catch (error) {
        if (isCode(error, "ENOENT")) return undefined;
        throw error;
      }
    },
    write: (path, text) => {
      mkdirSync(dirname(at(path)), { recursive: true });
      writeFileSync(at(path), text);
    },
    remove: (path) => {
      rmSync(at(path), { force: true });
      pruneEmpty(dirname(path));
    },
    list,
    git: (args) => {
      try {
        return {
          ok: true,
          out: execFileSync("git", args, {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 256 * 1024 * 1024,
          }),
        };
      } catch (error) {
        const failed = /** @type {{ stderr?: unknown, message: string }} */ (
          error
        );
        return {
          ok: false,
          out:
            typeof failed.stderr === "string" && failed.stderr !== ""
              ? failed.stderr
              : failed.message,
        };
      }
    },
  };
};

/**
 * Effect: runs git, and fails when git does.
 * @param {Io} io
 * @param {readonly string[]} args
 */
const gitOut = (io, args) => {
  const { ok, out } = io.git(args);
  if (!ok) throw new Error(`git ${args.join(" ")} failed: ${out.trim()}`);
  return out;
};

/**
 * Effect: reads the text of each path that exists.
 * @param {Io} io
 * @param {readonly string[]} paths
 * @returns {ReadonlyMap<string, string>}
 */
const readTexts = (io, paths) =>
  new Map(
    paths.flatMap((path) => {
      const text = io.read(path);
      return text === undefined ? [] : [[path, text]];
    }),
  );

/**
 * Effect: reads what every command decides from.
 * @param {Io} io
 * @returns {Facts}
 */
export const readFacts = (io) => ({
  lockText: io.read(LOCK_PATH),
  contents: readTexts(io, [...io.list(OWNED_ROOT), ...OUTSIDE]),
  dirty: statusPaths(
    gitOut(io, [
      "status",
      "--porcelain",
      "-z",
      "--untracked-files=all",
      "--ignored=matching",
      "--",
      OWNED_ROOT,
      ...OUTSIDE,
    ]),
  ),
  rootFiles: ["package.json", "tsconfig.json"].filter(
    (name) => io.read(name) !== undefined,
  ),
  tracked: nulList(gitOut(io, ["ls-files", "-z"])),
});

/**
 * Effect: reads the standard this copy of ogham ships, from `standard/`
 * beside its `src/`.
 * @param {Io} io the package's own folder
 * @returns {Source}
 */
export const readSource = (io) => ({
  version: VERSION,
  files: new Map(
    io
      .list(SHIPPED_ROOT)
      .map((path) => [
        path.slice(SHIPPED_ROOT.length + 1),
        io.read(path) ?? "",
      ]),
  ),
});

/**
 * Effect: the local edit to one owned file, as lines to print. It is shown
 * against the latest commit whose copy of the file still has the pinned
 * text, so a committed edit and an uncommitted one show alike.
 * @param {Io} io
 * @param {Lock} lock
 * @param {Drift} drifted
 * @returns {readonly string[]}
 */
const showEdit = (io, lock, { path, state }) => {
  if (state === "missing") return [`${path} was deleted.`];
  const pinned = lock.files[path];
  const history = io.git(["log", "--format=%H", "--", path]);
  const commits = history.ok ? history.out.split("\n").filter(Boolean) : [];
  const base = commits.find((commit) => {
    const shown = io.git(["show", `${commit}:${path}`]);
    return shown.ok && contentHash(shown.out) === pinned;
  });
  if (base === undefined) {
    return [
      `${path} was edited, and its pinned text is in no commit of this repo, so the edit cannot be shown.`,
    ];
  }
  const diff = io.git(["diff", base, "--", path]);
  return [
    `${path} was edited, against ${base.slice(0, 12)}:`,
    ...(diff.ok ? diff.out : diff.out.trim()).split("\n").filter(Boolean),
  ];
};

/**
 * Effect: the local edits to print, in the lock's order.
 * @param {Io} io
 * @param {string | undefined} text the lock's text
 * @param {readonly Drift[]} edits
 * @returns {readonly string[]}
 */
const showEdits = (io, text, edits) => {
  const lock = text === undefined ? undefined : parseLock(text);
  return lock === undefined
    ? []
    : edits.flatMap((drifted) => showEdit(io, lock, drifted));
};

/**
 * Effect: the commit a version's tag points at, from the remote.
 * @param {Io} io
 * @param {string} version
 * @returns {string | undefined}
 */
const resolveTag = (io, version) => {
  const tag = `v${version}`;
  const found = io.git([
    "ls-remote",
    REMOTE,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  return found.ok ? tagCommit(found.out, tag) : undefined;
};

/**
 * Effect: writes and removes what a plan says, checks the owned files
 * against the lock, and writes the lock last. On any failure it writes back
 * every touched path as the snapshot holds it, and deletes what it created.
 * @param {Io} io
 * @param {ReadonlyMap<string, string>} write
 * @param {readonly string[]} remove
 * @param {Lock | undefined} lock the lock to leave, or none
 * @returns {{ readonly before: ReadonlyMap<string, string | undefined>, readonly error: string | undefined }} each touched path's text before, and why it failed
 */
const applyAll = (io, write, remove, lock) => {
  const touched = [...new Set([...write.keys(), ...remove, LOCK_PATH])];
  const before = new Map(touched.map((path) => [path, io.read(path)]));
  try {
    for (const [path, text] of write) io.write(path, text);
    for (const path of remove) io.remove(path);
    if (lock !== undefined) {
      const wrong = drift(lock, readTexts(io, Object.keys(lock.files)));
      if (wrong.length > 0) {
        throw new Error(
          `after writing, ${wrong.map(({ path }) => path).join(", ")} did not match the lock`,
        );
      }
      io.write(LOCK_PATH, lockText(lock));
    } else {
      const left = remove.filter((path) => io.read(path) !== undefined);
      if (left.length > 0) {
        throw new Error(`after removing, ${left.join(", ")} still existed`);
      }
    }
    return { before, error: undefined };
  } catch (error) {
    const failed = [...before].flatMap(([path, text]) => {
      try {
        if (text === undefined) io.remove(path);
        else io.write(path, text);
        return [];
      } catch (restoring) {
        return [`${path}: ${String(restoring)}`];
      }
    });
    return {
      before,
      error: [
        String(error instanceof Error ? error.message : error),
        ...(failed.length > 0
          ? ["These paths could not be put back:", ...failed]
          : []),
      ].join("\n"),
    };
  }
};

/**
 * What a finished command prints: the local edits it discarded, git's diff
 * of the files that existed before, the files it created, and one closing
 * line.
 * @param {{
 *   readonly discarded: readonly string[],
 *   readonly diff: string,
 *   readonly before: ReadonlyMap<string, string | undefined>,
 *   readonly lock: Lock | undefined,
 *   readonly removed: readonly string[],
 * }} done
 * @returns {readonly string[]}
 */
export const summary = ({ discarded, diff, before, lock, removed }) => [
  ...(discarded.length > 0
    ? ["These local edits were discarded:", ...discarded]
    : []),
  ...diff.split("\n").filter(Boolean),
  ...[...before].flatMap(([path, text]) =>
    text === undefined ? [`new file: ${path}`] : [],
  ),
  lock === undefined
    ? `Removed ogham: ${removed.filter((path) => path !== LOCK_PATH).length} files and ${LOCK_PATH}.`
    : `ogham ${lock.version} (${lock.commit.slice(0, 12)}): ${Object.keys(lock.files).length} files under ${OWNED_ROOT}/.`,
];

/**
 * Effect: carries out a command's plan, from a refusal to a finished write.
 * @param {Io} io
 * @param {Facts} facts
 * @param {Plan} plan
 * @param {string} command
 * @returns {Outcome}
 */
const carryOut = (io, facts, plan, command) => {
  if (plan.kind === "done") return { code: 0, lines: [plan.message] };
  if (plan.kind === "refuse") {
    return {
      code: 1,
      lines: [plan.message, ...showEdits(io, facts.lockText, plan.edits)],
    };
  }

  const { adoption } = plan;
  const commit =
    adoption === undefined
      ? undefined
      : (adoption.commit ?? resolveTag(io, adoption.version));
  if (adoption !== undefined && commit === undefined) {
    return {
      code: 1,
      lines: [
        `Found no tag v${adoption.version} at ${REMOTE}, so the lock could not record the source commit. Nothing was written.`,
      ],
    };
  }
  const lock =
    adoption === undefined || commit === undefined
      ? undefined
      : buildLock({ ...adoption, commit });
  const discarded = showEdits(io, facts.lockText, plan.discarded);
  const { before, error } = applyAll(io, plan.write, plan.remove, lock);
  if (error !== undefined) {
    return {
      code: 1,
      lines: [
        `${command} failed and put every path it touched back as it was: ${error}`,
      ],
    };
  }

  const existed = [...before].flatMap(([path, text]) =>
    text === undefined ? [] : [path],
  );
  const diff =
    existed.length > 0 ? io.git(["diff", "--", ...existed]) : undefined;
  return {
    code: 0,
    lines: summary({
      discarded,
      diff: diff?.ok ? diff.out : "",
      before,
      lock,
      removed: plan.remove,
    }),
  };
};

/**
 * Effect: adopts the standard in the repo.
 * @param {Io} io the repo
 * @param {Source} source
 * @returns {Outcome}
 */
export const install = (io, source) => {
  const facts = readFacts(io);
  return carryOut(io, facts, planInstall(source, facts), "install");
};

/**
 * Effect: moves the repo's owned files to the running version.
 * @param {Io} io the repo
 * @param {Source} source
 * @param {boolean} force overwrite local edits to owned files
 * @returns {Outcome}
 */
export const update = (io, source, force) => {
  const facts = readFacts(io);
  return carryOut(io, facts, planUpdate(source, facts, force), "update");
};

/**
 * Effect: takes the owned files and the lines the lock records back out.
 * @param {Io} io the repo
 * @returns {Outcome}
 */
export const remove = (io) => {
  const facts = readFacts(io);
  return carryOut(io, facts, planRemove(facts), "remove");
};
