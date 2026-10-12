// The coding standard's lint preset for TypeScript and JavaScript.
//
// It checks the part of the standard a syntax rule can see: a write to a
// parameter, the common spellings of a clock, randomness, environment or
// storage read, a top-level `let` or `var`, and a comment that turns lint off
// without saying why. The reviewer checks the rest; the TypeScript page beside
// this folder lists what each rule sees and what it misses.
//
// The first four rules are ESLint's own, registered again under `ogham/`. A
// repo that already uses `no-restricted-syntax` or one of the others keeps
// its options: the two report side by side, and neither replaces the other.
//
// Use: spread the default export into a flat config, after the block that
// sets a parser for TypeScript files. The preset sets none.

import { builtinRules } from "eslint/use-at-your-own-risk";

import disableNeedsReason from "./disable-needs-reason.mjs";

export const BUILTIN_RULES = [
  "no-param-reassign",
  "no-restricted-properties",
  "no-restricted-globals",
  "no-restricted-syntax",
];

/**
 * ESLint's own rules by name, to register under another prefix. ESLint gives
 * no promise to keep exporting them, so a missing one stops the load with a
 * message that names it.
 * @param {ReadonlyMap<string, import("eslint").Rule.RuleModule>} available
 * @param {readonly string[]} names
 * @returns {Record<string, import("eslint").Rule.RuleModule>}
 */
export const aliased = (available, names) =>
  Object.fromEntries(
    names.map((name) => {
      const rule = available.get(name);
      if (!rule) {
        throw new Error(
          `The coding standard's lint preset needs ESLint's ${name} rule, and eslint/use-at-your-own-risk no longer provides it.`,
        );
      }
      return [name, rule];
    }),
  );

const TAKE_IT = "take the value as an argument (og-no-hidden-inputs)";
const HOLD_IT =
  "keep state in a value the caller holds and passes in (og-no-module-state)";

const hiddenProperties = [
  {
    object: "Date",
    property: "now",
    message: `Date.now() reads the clock: ${TAKE_IT}.`,
  },
  {
    object: "performance",
    property: "now",
    message: `performance.now() reads the clock: ${TAKE_IT}.`,
  },
  {
    object: "Math",
    property: "random",
    message: `Math.random() is unseeded randomness: ${TAKE_IT}.`,
  },
  {
    object: "crypto",
    property: "getRandomValues",
    message: `crypto.getRandomValues() is ambient randomness: ${TAKE_IT}.`,
  },
  {
    object: "process",
    property: "env",
    message: `process.env is ambient configuration: ${TAKE_IT}.`,
  },
  // The three global receivers by name, not any receiver: `deps.localStorage`
  // on a value the function was handed is an argument, not a hidden input.
  ...["window", "globalThis", "self"].flatMap((object) =>
    ["localStorage", "sessionStorage"].map((property) => ({
      object,
      property,
      message: `Storage is ambient state: ${TAKE_IT}.`,
    })),
  ),
];

const hiddenGlobals = ["localStorage", "sessionStorage"].map((name) => ({
  name,
  message: `Storage is ambient state: ${TAKE_IT}.`,
}));

const restrictedSyntax = [
  {
    selector:
      "Program > VariableDeclaration[kind='let'], Program > ExportNamedDeclaration > VariableDeclaration[kind='let']",
    message: `A top-level let is shared mutable state: ${HOLD_IT}.`,
  },
  {
    selector:
      "Program > VariableDeclaration[kind='var'], Program > ExportNamedDeclaration > VariableDeclaration[kind='var']",
    message: `A top-level var is shared mutable state: ${HOLD_IT}.`,
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: `new Date() with no argument reads the clock: ${TAKE_IT}.`,
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: `Date() reads the clock: ${TAKE_IT}.`,
  },
  {
    // `.name` for `import.meta.env`, `.value` for `import.meta["env"]`.
    selector:
      "MemberExpression[object.type='MetaProperty'][property.name='env'], MemberExpression[object.type='MetaProperty'][property.value='env']",
    message: `import.meta.env is ambient configuration: ${TAKE_IT}.`,
  },
];

export const plugin = {
  meta: { name: "ogham" },
  rules: {
    ...aliased(builtinRules, BUILTIN_RULES),
    "disable-needs-reason": disableNeedsReason,
  },
};

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    name: "ogham/coding",
    // Source files, and not tests or type declarations: the standard covers
    // source code only, and a declaration file holds no logic.
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    ignores: [
      "**/*.{test,spec}.*",
      "**/{test,tests,__tests__}/**",
      "**/*.d.{ts,mts,cts}",
    ],
    plugins: { ogham: plugin },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "ogham/no-param-reassign": ["error", { props: true }],
      "ogham/no-restricted-properties": ["error", ...hiddenProperties],
      "ogham/no-restricted-globals": ["error", ...hiddenGlobals],
      "ogham/no-restricted-syntax": ["error", ...restrictedSyntax],
      "ogham/disable-needs-reason": "error",
    },
  },
];
