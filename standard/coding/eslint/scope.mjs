// Which files the coding standard's lint covers: source files with a
// JavaScript or TypeScript extension, and not tests or type declarations.
//
// The preset takes its `files` and `ignores` from here, and so does the check
// that runs outside ESLint, so the two cover the same files. This file imports
// nothing, because that check runs with Node alone.

export const FILES = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"];

// The standard covers source code only, and a declaration file holds no logic.
export const IGNORES = [
  "**/*.{test,spec}.*",
  "**/{test,tests,__tests__}/**",
  "**/*.d.{ts,mts,cts}",
];

// The pieces a glob here is made of, and any other single character.
const GLOB_PIECE = /\*\*\/|\*\*|\*|\{[^}]*\}|[\s\S]/gu;

/**
 * One piece of a glob as regular-expression source. `**` followed by a slash
 * stands for any folders or none, `*` for anything but a slash, and braces
 * for a choice of plain words.
 * @param {string} piece
 */
const pieceSource = (piece) => {
  if (piece === "**/") return "(?:.*/)?";
  if (piece === "**") return ".*";
  if (piece === "*") return "[^/]*";
  if (piece.length > 1) return `(?:${piece.slice(1, -1).replaceAll(",", "|")})`;
  return piece.replace(/[\\^$.|?+()[\]{}]/u, "\\$&");
};

/**
 * A glob as a regular expression over a whole path. It reads the pieces the
 * lists above use and no others.
 * @param {string} glob
 */
const matcher = (glob) =>
  new RegExp(
    `^${(glob.match(GLOB_PIECE) ?? []).map(pieceSource).join("")}$`,
    "u",
  );

const files = FILES.map(matcher);
const ignores = IGNORES.map(matcher);

/**
 * Whether the standard's lint covers a file. ESLint never lints a
 * `node_modules` folder, so a path through one is out.
 * @param {string} path the file's path from the repo root, with forward slashes
 */
export const inScope = (path) =>
  files.some((glob) => glob.test(path)) &&
  !ignores.some((glob) => glob.test(path)) &&
  !path.split("/").includes("node_modules");
