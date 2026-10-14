// Reading what git prints: pure functions over its output.

/**
 * The items of a NUL-separated list, as git prints one with `-z`.
 * @param {string} output
 */
export const nulList = (output) =>
  output.split("\0").filter((item) => item !== "");

/**
 * The path of every entry in `git status --porcelain -z` output. A rename or
 * a copy names two paths, and both are given. A folder's path ends in a slash.
 * @param {string} output
 * @returns {readonly string[]}
 */
export const statusPaths = (output) => {
  const fields = output.split("\0");
  /** @type {string[]} */
  const paths = [];
  // An entry is two status letters, a space and a path. After a rename or a
  // copy, the next field is the path it came from, with no letters.
  let origin = false;
  for (const field of fields) {
    if (origin) {
      paths.push(field);
      origin = false;
    } else if (field !== "") {
      paths.push(field.slice(3));
      origin = /[RC]/u.test(field.slice(0, 2));
    }
  }
  return paths;
};

/**
 * The commit a tag points at, read from `git ls-remote` output for the tag
 * and its peeled form, or `undefined` when the output names neither. An
 * annotated tag has a line of its own; the line that ends in `^{}` is the
 * commit.
 * @param {string} output
 * @param {string} tag
 * @returns {string | undefined}
 */
export const tagCommit = (output, tag) => {
  const refs = new Map(
    output
      .split("\n")
      .map((line) => line.split("\t"))
      .flatMap(([hash, ref]) => (hash && ref ? [[ref, hash]] : [])),
  );
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
};
