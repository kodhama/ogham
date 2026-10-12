// Finds every comment in a JavaScript or TypeScript text that turns lint off
// without a reason, by reading the text itself.
//
// ESLint's own rule for this (`ogham/disable-needs-reason`) is silenced by a
// disable that names no rule, or names that rule. This scan runs outside
// ESLint, so nothing in the file can switch it off. It uses that rule's
// `lintOff` to decide what a comment turns off, so the two never disagree.
//
// It has no parser, because `check` runs with Node alone. It walks the text
// and steps over strings, template literals and regular expressions, so text
// that only looks like a comment is not read as one.
//
// Where it guesses. Whether a `/` opens a regular expression or divides is
// settled by what comes before it: after a value it divides. After `)` it is
// read as division, and after `}` as a regular expression, unless `>` follows
// as in a JSX tag that closes itself; either can be wrong. JSX text is read
// as code, so a quote, a backtick or a comment marker in it is taken for the
// real thing.
//
// What a wrong guess costs. A string or a regular expression ends at its
// line's end, so most wrong guesses hide or invent a comment on one line. One
// that swallows a backtick, or the brace that closes a template substitution,
// or that opens a block comment, can throw off the reading of the rest of the
// file. The lint rule still reports a comment this scan misses, unless that
// comment is itself a blanket disable: such a file needs the reviewer.

import { lintOff } from "../standard/coding/eslint/disable-needs-reason.mjs";

/**
 * A comment found in a text: its kind, the text between its markers, and
 * where it starts.
 * @typedef {{ readonly type: "Line" | "Block", readonly value: string, readonly start: number }} Comment
 */

/**
 * A reasonless comment that turns lint off: where it starts, counting lines
 * and columns from 1, and which directive it is.
 * @typedef {{ readonly line: number, readonly column: number, readonly label: string }} Finding
 */

// A `/` after one of these words opens a regular expression.
const BEFORE_AN_EXPRESSION = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/**
 * Where the line that holds `from` ends: the index of its line break, or the
 * text's length.
 * @param {string} text
 * @param {number} from
 */
const lineEnd = (text, from) => {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
};

/**
 * The index just past the string that opens at `start`. A string ends at its
 * quote, or at the line's end when it has none.
 * @param {string} text
 * @param {number} start
 */
const stringEnd = (text, start) => {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote && text[index] !== "\n") {
    index += text[index] === "\\" ? 2 : 1;
  }
  return Math.min(index + 1, text.length);
};

/**
 * The index just past the regular expression that opens at `start`. A `/`
 * inside a character class does not close it.
 * @param {string} text
 * @param {number} start
 */
const regexEnd = (text, start) => {
  let index = start + 1;
  let inClass = false;
  while (
    index < text.length &&
    text[index] !== "\n" &&
    (inClass || text[index] !== "/")
  ) {
    if (text[index] === "\\") {
      index += 2;
    } else {
      inClass = text[index] === "[" || (inClass && text[index] !== "]");
      index += 1;
    }
  }
  return Math.min(index + 1, text.length);
};

/**
 * Reads template text from `start` to the backtick that closes the template
 * or to the next `${`. It gives the index just past that, and whether a
 * substitution opened there.
 * @param {string} text
 * @param {number} start
 */
const templateTextEnd = (text, start) => {
  let index = start;
  while (
    index < text.length &&
    text[index] !== "`" &&
    !(text[index] === "$" && text[index + 1] === "{")
  ) {
    index += text[index] === "\\" ? 2 : 1;
  }
  return {
    end: Math.min(index + (text[index] === "`" ? 1 : 2), text.length),
    substitution: text[index] === "$",
  };
};

/**
 * Every comment in a text, in order.
 * @param {string} text
 * @returns {readonly Comment[]}
 */
export const comments = (text) => {
  /** @type {Comment[]} */
  const found = [];
  // The brace depth each open `${` was written at: the `}` that returns to
  // that depth closes it, and template text follows.
  /** @type {number[]} */
  const substitutions = [];
  let depth = 0;
  // Whether the code just read is a value, so that a `/` here divides.
  let afterValue = false;
  // The last character of code read, white space and comments aside.
  let last = "";
  const wordAt = /[\w$\u0080-\u{10ffff}]+/uy;
  let index = text.startsWith("#!") ? lineEnd(text, 0) : 0;

  while (index < text.length) {
    const char = text[index] ?? "";
    const pair = text.slice(index, index + 2);
    wordAt.lastIndex = index;
    const word = wordAt.exec(text)?.[0];
    // A `/` opens a regular expression where no value comes before it. `</`
    // and `} />` are JSX tags closing.
    const opensRegex =
      char === "/" &&
      !afterValue &&
      last !== "<" &&
      !(last === "}" && text[index + 1] === ">");

    if (pair === "//") {
      const end = lineEnd(text, index);
      found.push({
        type: "Line",
        value: text.slice(index + 2, end).replace(/\r$/, ""),
        start: index,
      });
      index = end;
    } else if (pair === "/*") {
      const close = text.indexOf("*/", index + 2);
      const end = close === -1 ? text.length : close;
      found.push({
        type: "Block",
        value: text.slice(index + 2, end),
        start: index,
      });
      index = end + 2;
    } else if (word) {
      // A keyword such as `return` expects an expression next; the same word
      // as a property name (`o.in`) is a value.
      afterValue = last === "." || !BEFORE_AN_EXPRESSION.has(word);
      last = word;
      index += word.length;
    } else if (char === '"' || char === "'") {
      afterValue = true;
      last = char;
      index = stringEnd(text, index);
    } else if (opensRegex) {
      afterValue = true;
      last = char;
      index = regexEnd(text, index);
    } else if (
      char === "`" ||
      (char === "}" && substitutions.at(-1) === depth)
    ) {
      if (char === "}") substitutions.pop();
      const template = templateTextEnd(text, index + 1);
      if (template.substitution) substitutions.push(depth);
      afterValue = !template.substitution;
      last = "`";
      index = template.end;
    } else if (afterValue && (pair === "++" || pair === "--")) {
      // Postfix: what comes before is still a value.
      index += 2;
    } else {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (/\S/.test(char)) {
        // `)` and `]` end a value. A `!` after a value is TypeScript's
        // postfix operator, or the start of `!=`, whose `=` settles it.
        afterValue = char === ")" || char === "]" || (char === "!" && afterValue);
        last = char;
      }
      index += 1;
    }
  }
  return found;
};

/**
 * Every comment in a text that turns lint off and gives no reason.
 * @param {string} text
 * @returns {readonly Finding[]}
 */
export const scanDisables = (text) =>
  comments(text).flatMap((comment) => {
    const off = lintOff(comment);
    const before = text.slice(0, comment.start);
    return off && off.reason === ""
      ? [
          {
            line: before.split("\n").length,
            column: comment.start - before.lastIndexOf("\n"),
            label: off.label,
          },
        ]
      : [];
  });
