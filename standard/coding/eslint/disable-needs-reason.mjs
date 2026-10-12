// ogham/disable-needs-reason: a comment that turns lint off says why.
//
// ESLint takes the text after ` -- ` in a directive comment as its reason and
// does nothing with it. This rule reports a directive that has none. It only
// checks that a reason is there; whether the reason is a good one is for the
// reviewer (og-reasoned-exceptions).
//
// A comment turns lint off when ESLint would act on it as one of four
// directives: `eslint-disable` (from the comment to a matching
// `eslint-enable`, or to the file's end), `eslint-disable-line` (the
// comment's own line), `eslint-disable-next-line` (the line after it), and
// `eslint <rule>: <setting>` (a rule's setting for the whole file).
//
// A disable that names no rule, or names this one, silences this rule's own
// report. `lintOff` is exported for that case: a scan of the comments
// themselves, outside ESLint, uses it and cannot be silenced.

/**
 * A comment as ESLint's parser gives it: `Line` or `Block`, and the text
 * between its markers.
 * @typedef {{ readonly type: string, readonly value: string }} Comment
 */

/**
 * A comment that turns lint off: which directive it is, and its reason.
 * @typedef {{ readonly label: string, readonly reason: string }} LintOff
 */

const REASON_MARK = /\s-{2,}\s/u;
const LABEL = /^(eslint(?:-disable(?:(?:-next)?-line)?)?)(?:\s|$)/u;
const IN_A_LINE_COMMENT = /^eslint-disable-(?:next-)?line$/u;

/**
 * What a comment turns off, or `undefined` when ESLint would not act on it
 * that way. It follows ESLint's own reading: the reason starts at the first
 * ` -- ` with white space on both sides, and a `//` comment can only disable
 * its own line or the next.
 * @param {Comment} comment
 * @returns {LintOff | undefined}
 */
export const lintOff = (comment) => {
  const mark = REASON_MARK.exec(comment.value);
  const directive = comment.value.slice(0, mark?.index).trim();
  const label = LABEL.exec(directive)?.[1];
  // ESLint acts on a `//` comment only for a line, on `eslint` only when a
  // rule follows it, and on `eslint-disable-line` only when it fits one line.
  const read =
    (comment.type === "Block" && directive !== "eslint") ||
    (comment.type === "Line" && IN_A_LINE_COMMENT.test(label ?? ""));
  const split = label === "eslint-disable-line" && comment.value.includes("\n");

  return label && read && !split
    ? {
        label,
        reason: mark
          ? comment.value.slice(mark.index + mark[0].length).trim()
          : "",
      }
    : undefined;
};

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "require a reason on every comment that turns lint off",
    },
    schema: [],
    messages: {
      missing:
        "This {{label}} comment gives no reason. Say why after ` -- ` (og-reasoned-exceptions).",
    },
  },
  // og-mark-effects: reports to ESLint through the context it is handed; ESLint fixes the names `create` and `Program`
  /** Effect: reports each reasonless comment to ESLint. */
  create: (context) => ({
    Program: () => {
      for (const comment of context.sourceCode.getAllComments()) {
        const off = lintOff(comment);
        if (off && off.reason === "" && comment.loc) {
          context.report({
            loc: comment.loc,
            messageId: "missing",
            data: { label: off.label },
          });
        }
      }
    },
  }),
};
