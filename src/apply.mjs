// The one file that touches the disk and git. It reads what a command needs
// to decide, hands that to the pure plans in `plan.mjs`, and carries the plan
// out all or nothing: it snapshots every path it will touch, writes, checks
// what it wrote against the lock, writes the lock last, and on any failure
// puts back each path it changed, naming any it could not.

import { execFileSync } from "node:child_process";
import {
  lstatSync,
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
  blockDrift,
  blockText,
  contentHash,
  drift,
  parseLock,
  scanBlocks,
} from "../standard/check.mjs";
import { nulList, statusPaths, tagCommit } from "./git-text.mjs";
import { buildLock, lockText } from "./lock.mjs";
import {
  OUTSIDE,
  planInstall,
  planRemove,
  planUpdate,
  uncommitted,
} from "./plan.mjs";
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
 *   readonly git: (args: readonly string[]) => { readonly ok: boolean, readonly out: string, readonly code?: number | undefined },
 * }} Io a file's text, or `undefined` when there is none; write a file, making its folders; remove a file, then each parent folder it leaves empty; every file under a folder, at any depth; run git in the repo, with what it printed to standard output, or to standard error when it failed, and the exit code it failed with
 */

/**
 * What a command ends with: its exit code, and the lines to print.
 * @typedef {{ readonly code: number, readonly lines: readonly string[] }} Outcome
 */

// Where `install` and `update` look up the commit behind a version's tag.
export const REMOTE = "https://github.com/kodhama/ogham.git";

const SHIPPED_ROOT = "standard";
const TEMPLATES_ROOT = "templates";

// How long one git call may run before it is stopped: the tag lookup goes
// over the network.
const GIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Whether an error carries a file system error code, such as `ENOENT`.
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
  const linkError = (/** @type {string} */ path) =>
    new Error(
      `${path} is a symbolic link, and ogham writes only real files inside the repo`,
    );

  /**
   * Fails when the path, or a folder on the way to it, is a symbolic link:
   * writing or removing through one could reach a file outside the repo.
   * @param {string} path
   */
  const refuseLinks = (path) => {
    const parts = path.split("/");
    parts.forEach((_, index) => {
      const prefix = parts.slice(0, index + 1).join("/");
      try {
        if (lstatSync(at(prefix)).isSymbolicLink()) throw linkError(prefix);
      } catch (error) {
        if (!isCode(error, "ENOENT")) throw error;
      }
    });
  };

  /**
   * Every file under `dir`. Fails on a symbolic link inside it, which the
   * command would otherwise leave out of what it reads, writes and removes.
   * @param {string} dir
   * @returns {readonly string[]}
   */
  const list = (dir) => {
    try {
      return readdirSync(at(dir), { withFileTypes: true }).flatMap(
        /** @returns {readonly string[]} */ (entry) => {
          const path = `${dir}/${entry.name}`;
          if (entry.isSymbolicLink()) throw linkError(path);
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
      refuseLinks(path);
      mkdirSync(dirname(at(path)), { recursive: true });
      writeFileSync(at(path), text);
    },
    remove: (path) => {
      refuseLinks(path);
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
            timeout: GIT_TIMEOUT_MS,
            // git asks for no credentials on the terminal. An askpass program
            // or ssh the user configured may still ask; the limit bounds it.
            // eslint-disable-next-line ogham/no-restricted-properties -- og-no-hidden-inputs: passes the environment on to git; this is the edge, where git is run
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          }),
        };
      } catch (error) {
        const failed =
          /** @type {{ stderr?: unknown, status?: unknown, message: string }} */ (
            error
          );
        if (isCode(error, "ETIMEDOUT")) {
          return {
            ok: false,
            out: `git gave no answer in ${GIT_TIMEOUT_MS / 60000} minutes and was stopped`,
          };
        }
        return {
          ok: false,
          out:
            typeof failed.stderr === "string" && failed.stderr !== ""
              ? failed.stderr
              : failed.message,
          code: typeof failed.status === "number" ? failed.status : undefined,
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
 * Effect: the paths among `paths` that git ignores, which a commit would
 * leave out, or git's error when it could not say.
 * @param {Io} io
 * @param {readonly string[]} paths
 * @returns {{ ignored: readonly string[], failure: string | undefined }}
 */
const ignoredPaths = (io, paths) => {
  if (paths.length === 0) return { ignored: [], failure: undefined };
  const { ok, out, code } = io.git(["check-ignore", "--", ...paths]);
  // check-ignore exits 1 when it ignores none of them.
  if (!ok && code === 1) return { ignored: [], failure: undefined };
  if (!ok) return { ignored: [], failure: out.trim() };
  return {
    ignored: out.split("\n").filter((line) => line !== ""),
    failure: undefined,
  };
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
 * Effect: reads every file under one of the package's folders, by its path
 * inside that folder.
 * @param {Io} io the package's own folder
 * @param {string} dir
 * @returns {ReadonlyMap<string, string>}
 */
const readFolder = (io, dir) =>
  new Map(
    io
      .list(dir)
      .map((path) => [path.slice(dir.length + 1), io.read(path) ?? ""]),
  );

/**
 * Effect: reads the standard this copy of ogham ships, from `standard/`
 * beside its `src/`, and the templates for the blocks and the files it
 * seeds, from `templates/`.
 * @param {Io} io the package's own folder
 * @returns {Source}
 */
export const readSource = (io) => ({
  version: VERSION,
  files: readFolder(io, SHIPPED_ROOT),
  templates: readFolder(io, TEMPLATES_ROOT),
});

/**
 * The hash of the ogham block in a file's text, or `undefined` when it holds
 * none it can read.
 * @param {string} path
 * @param {string} text
 */
const blockHash = (path, text) => {
  const { span, errors } = scanBlocks(path, text);
  return span === undefined || errors.length > 0
    ? undefined
    : contentHash(blockText(text, span));
};

/**
 * Effect: the local edit to one owned file or block, as lines to print. It
 * is shown against the latest commit whose copy of the file still has the
 * pinned text, so a committed edit and an uncommitted one show alike.
 * @param {Io} io
 * @param {Lock} lock
 * @param {Drift} drifted
 * @returns {readonly string[]}
 */
const showEdit = (io, lock, { path, state, block }) => {
  const what = block ? `The ogham block in ${path}` : path;
  if (state === "missing") return [`${what} was deleted.`];
  const pinned = block ? lock.blocks[path] : lock.files[path];
  const hashOf = block
    ? (/** @type {string} */ text) => blockHash(path, text)
    : contentHash;
  const history = io.git(["log", "--format=%H", "--", path]);
  const commits = history.ok ? history.out.split("\n").filter(Boolean) : [];
  // og-thin-effects: reads each commit's copy until one matches the pinned hash; deciding purely would mean reading every copy in the file's history first
  const base = commits.find((commit) => {
    const shown = io.git(["show", `${commit}:${path}`]);
    return shown.ok && hashOf(shown.out) === pinned;
  });
  if (base === undefined) {
    return [
      `${what} was edited, and its pinned text is in no commit of this repo, so the edit cannot be shown.`,
    ];
  }
  const diff = io.git([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    base,
    "--",
    path,
  ]);
  return [
    `${what} was edited, against ${base.slice(0, 12)}:`,
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
 * Effect: the commit a version's tag points at, from the remote, or git's
 * error when the remote could not be asked.
 * @param {Io} io
 * @param {string} version
 * @returns {{ readonly commit: string | undefined, readonly failure: string | undefined }}
 */
const resolveTag = (io, version) => {
  const tag = `v${version}`;
  const found = io.git([
    "ls-remote",
    REMOTE,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  return found.ok
    ? { commit: tagCommit(found.out, tag), failure: undefined }
    : { commit: undefined, failure: found.out.trim() };
};

/**
 * Effect: writes and removes what a plan says, checks the owned files
 * against the lock, and writes the lock last. On any failure it writes back
 * each touched path that changed as the snapshot holds it, and deletes what
 * it created.
 * @param {Io} io
 * @param {ReadonlyMap<string, string>} write
 * @param {readonly string[]} remove
 * @param {Lock | undefined} lock the lock to leave, or none
 * @returns {{ readonly before: ReadonlyMap<string, string | undefined>, readonly error: string | undefined, readonly unrestored: readonly string[] }} each touched path's text before; why it failed; and each path it could not put back, with why
 */
const applyAll = (io, write, remove, lock) => {
  const touched = [...new Set([...write.keys(), ...remove, LOCK_PATH])];
  const before = new Map(touched.map((path) => [path, io.read(path)]));
  try {
    for (const [path, text] of write) io.write(path, text);
    for (const path of remove) io.remove(path);
    if (lock !== undefined) {
      const wrong = [
        ...drift(lock, readTexts(io, Object.keys(lock.files))),
        ...blockDrift(lock, readTexts(io, Object.keys(lock.blocks))),
      ];
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
    return { before, error: undefined, unrestored: [] };
  } catch (error) {
    const unrestored = [...before].flatMap(([path, text]) => {
      try {
        if (io.read(path) === text) {
          // Still absent: a write that failed may have made its folders, so
          // prune them, best effort. Nothing was changed to name.
          if (text === undefined) {
            try {
              io.remove(path);
            } catch {
              // A folder that will not go is left; git does not see it.
            }
          }
          return [];
        }
        if (text === undefined) io.remove(path);
        else io.write(path, text);
        return [];
      } catch (restoring) {
        return [`${path}: ${String(restoring)}`];
      }
    });
    return {
      before,
      error: String(error instanceof Error ? error.message : error),
      unrestored,
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
  if (plan.kind === "done") {
    return { code: 0, lines: [plan.message, ...plan.warnings] };
  }
  if (plan.kind === "refuse") {
    return {
      code: 1,
      lines: [plan.message, ...showEdits(io, facts.lockText, plan.edits)],
    };
  }

  const { adoption } = plan;
  // Of the files the plan writes and the owned files the lock will claim,
  // git is asked about each new one and each one git reports as changed,
  // untracked or ignored. An owned file whose text already matches is not
  // written but is still claimed, so it is asked about too. A tracked file
  // git reports unchanged is left out: git never ignores one.
  const claimed =
    adoption === undefined
      ? []
      : [
          ...new Set([
            ...plan.write.keys(),
            ...adoption.owned.keys(),
            LOCK_PATH,
          ]),
        ];
  const changed = uncommitted(claimed, facts.dirty);
  const { ignored, failure } = ignoredPaths(
    io,
    claimed.filter(
      (path) => !facts.contents.has(path) || changed.includes(path),
    ),
  );
  if (failure !== undefined) {
    return {
      code: 1,
      lines: [
        `Could not ask git which paths it ignores: ${failure}. Nothing was written.`,
      ],
    };
  }
  if (ignored.length > 0) {
    return {
      code: 1,
      lines: [
        "git ignores these paths, so a commit would leave them out:",
        ...ignored.map((path) => `  ${path}`),
        `Stop ignoring them (in .gitignore, .git/info/exclude or the global excludes file), then run ${command} again. Nothing was written.`,
      ],
    };
  }
  const resolved =
    adoption === undefined || adoption.commit !== undefined
      ? { commit: adoption?.commit, failure: undefined }
      : resolveTag(io, adoption.version);
  const { commit } = resolved;
  if (adoption !== undefined && commit === undefined) {
    return {
      code: 1,
      lines: [
        resolved.failure === undefined
          ? `Found no tag v${adoption.version} at ${REMOTE}, so the lock could not record the source commit. Nothing was written.`
          : `Could not ask ${REMOTE} for tag v${adoption.version}: ${resolved.failure}. Nothing was written.`,
      ],
    };
  }
  const lock =
    adoption === undefined || commit === undefined
      ? undefined
      : buildLock({ ...adoption, commit });
  const discarded = showEdits(io, facts.lockText, plan.discarded);
  const { before, error, unrestored } = applyAll(
    io,
    plan.write,
    plan.remove,
    lock,
  );
  if (error !== undefined) {
    return {
      code: 1,
      lines:
        unrestored.length === 0
          ? [
              `${command} failed and put every path it touched back as it was: ${error}`,
            ]
          : [
              `${command} failed: ${error}`,
              "It could not put these paths back as they were. Check each before running it again:",
              ...unrestored.map((line) => `  ${line}`),
            ],
    };
  }

  const existed = [...before].flatMap(([path, text]) =>
    text === undefined ? [] : [path],
  );
  const diff =
    existed.length > 0
      ? io.git(["diff", "--no-ext-diff", "--no-textconv", "--", ...existed])
      : undefined;
  return {
    code: 0,
    lines: [
      ...summary({
        discarded,
        diff:
          diff === undefined || diff.ok
            ? (diff?.out ?? "")
            : `Could not show git's diff: ${diff.out.trim().replace(/\s+/g, " ")}. Run git diff --no-ext-diff --no-textconv to see what changed.`,
        before,
        lock,
        removed: plan.remove,
      }),
      ...plan.warnings,
    ],
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
