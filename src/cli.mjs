// The command line: which command was asked for, and running it on the git
// repo that holds the current folder. Nothing here prompts, so a command
// run with no terminal completes or refuses on its own.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readProblems, readWarnings } from "../standard/check.mjs";
import { install, readSource, remove, repoIo, update } from "./apply.mjs";

/** @typedef {import("./apply.mjs").Outcome} Outcome */

/**
 * A command line as ogham reads it, or why it cannot.
 * @typedef {{ readonly command: "install" | "update" | "check" | "remove", readonly force: boolean }
 *   | { readonly error: string }} Parsed
 */

export const USAGE = [
  "Usage: ogham <command>",
  "",
  "  install           adopt the standard in this repo",
  "  update [--force]  move the repo to this version; --force overwrites local edits to .ogham/",
  "  check             check the adoption, as .ogham/check.mjs does",
  "  remove            take ogham's files and lines back out",
].join("\n");

const COMMANDS = /** @type {const} */ ([
  "install",
  "update",
  "check",
  "remove",
]);

/**
 * @param {string} word
 * @returns {word is (typeof COMMANDS)[number]}
 */
const isCommand = (word) => COMMANDS.some((command) => command === word);

/**
 * The command a command line asks for.
 * @param {readonly string[]} args the words after the program's name
 * @returns {Parsed}
 */
export const parseArgs = (args) => {
  const [command, ...rest] = args;
  if (command === undefined) return { error: "No command given." };
  if (!isCommand(command)) return { error: `Unknown command: ${command}.` };
  const allowed = command === "update" ? ["--force"] : [];
  const unknown = rest.filter((arg) => !allowed.includes(arg));
  return unknown.length > 0
    ? { error: `${command} does not take ${unknown.join(" ")}.` }
    : { command, force: rest.includes("--force") };
};

/**
 * Effect: the root of the git repo that holds `cwd`, or `undefined` when
 * there is none.
 * @param {string} cwd
 * @returns {string | undefined}
 */
const repoRoot = (cwd) => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Effect: runs a command line in the repo that holds `cwd`.
 * @param {readonly string[]} args the words after the program's name
 * @param {string} cwd
 * @returns {Promise<Outcome>}
 */
export const run = async (args, cwd) => {
  const parsed = parseArgs(args);
  if ("error" in parsed) return { code: 2, lines: [parsed.error, "", USAGE] };
  const root = repoRoot(cwd);
  if (root === undefined) {
    return {
      code: 1,
      lines: [`${cwd} is not inside a git repo. ogham works on one.`],
    };
  }

  if (parsed.command === "check") {
    const found = await readProblems(root);
    const warned = readWarnings(root);
    return found.length > 0
      ? { code: 1, lines: [...warned, ...found] }
      : { code: 0, lines: [...warned, "The adoption is intact."] };
  }
  const io = repoIo(root);
  const source = readSource(
    repoIo(fileURLToPath(new URL("..", import.meta.url))),
  );
  if (parsed.command === "install") return install(io, source);
  if (parsed.command === "update") return update(io, source, parsed.force);
  return remove(io);
};
