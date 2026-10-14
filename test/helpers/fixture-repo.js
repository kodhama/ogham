// A git repo in a temporary folder, for tests that run the commands on real
// files. Git runs with the user's and the system's config shut out, so a
// signing or hook setting on the machine cannot change what a test sees.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

/**
 * Effect: runs git in a folder.
 * @param {string} root
 * @param {readonly string[]} args
 */
export const git = (root, args) =>
  execFileSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });

/**
 * Effect: writes files into a folder, making their folders.
 * @param {string} root
 * @param {Record<string, string>} files text by path
 */
export const writeFiles = (root, files) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};

/**
 * Effect: commits everything in the repo.
 * @param {string} root
 * @param {string} message
 */
export const commitAll = (root, message) => {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", message]);
};

/**
 * Effect: what `git status` reports in the repo, untracked files listed one
 * by one; an empty string when the repo is clean.
 * @param {string} root
 */
export const status = (root) =>
  git(root, ["status", "--porcelain", "--untracked-files=all"]);

/**
 * Effect: a new repo holding `files` in one commit, deleted when the test
 * ends.
 * @param {import("node:test").TestContext} t
 * @param {Record<string, string>} files
 */
export const fixtureRepo = (t, files) => {
  const root = mkdtempSync(join(tmpdir(), "ogham-repo-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-q", "-b", "main"]);
  writeFiles(root, files);
  commitAll(root, "start");
  return root;
};
