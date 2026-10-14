// What ogham chooses for a repo when it adopts: which language pages the
// repo gets, and whether it gets the lint preset. The choice is made once and
// recorded in the lock; an update reads it from there.

/** @typedef {import("../standard/check.mjs").Choices} Choices */

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/u;
const JAVASCRIPT_FILE = /\.(?:js|jsx|mjs|cjs)$/u;

/**
 * The choices for a repo. The TypeScript page covers JavaScript too, so
 * either language brings it. The preset goes only where the root has
 * TypeScript and a `package.json`: a `tsconfig.json` counts as TypeScript,
 * and so does any tracked TypeScript file.
 * @param {{ readonly rootFiles: readonly string[], readonly tracked: readonly string[] }} repo the names of the files at the repo's root, and the path of every tracked file
 * @returns {Choices}
 */
export const choices = ({ rootFiles, tracked }) => {
  const typescript =
    rootFiles.includes("tsconfig.json") ||
    tracked.some((path) => TYPESCRIPT_FILE.test(path));
  const javascript = tracked.some((path) => JAVASCRIPT_FILE.test(path));

  return {
    languages: typescript || javascript ? ["typescript"] : [],
    preset: typescript && rootFiles.includes("package.json"),
  };
};
