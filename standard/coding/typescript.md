# Coding standard: TypeScript

How the core rules look in TypeScript and JavaScript. **The core (`.ogham/coding/core.md`) is the standard; this page shows it applied.** Each section names the rule it illustrates.

## Pure functions and hidden inputs

`og-pure-by-default`, `og-no-hidden-inputs`

Code at the edge reads the clock, a random seed, the environment or storage, and passes the values in. Logic never reads them.

```ts
// Not this: the result depends on when it runs.
const isExpired = (token: Token): boolean => token.expiresAt < Date.now();

// This: the time is an argument, so a test passes any instant it likes.
const isExpired = (token: Token, now: number): boolean => token.expiresAt < now;
```

The same goes for randomness (take a seed, or a generator the caller made from one), `process.env` (take the parsed config) and storage (take the stored value).

**An injected clock or store is still an effect.** Edge code may take them as interfaces so a test can pass fakes, but logic receives the value they produced, never the interface.

## Returning new values

`og-return-new-values`, `og-local-building`

Copy and spread; never write to a parameter.

```ts
// Not this: the caller's cart changes under it.
const addItem = (cart: Cart, item: Item): void => {
  cart.items.push(item);
};

// This.
const addItem = (cart: Cart, item: Item): Cart => ({
  ...cart,
  items: [...cart.items, item],
});
```

A helper that pushes into an array its caller passed in breaks the rule too: return the values and let the caller combine them.

**Building your own value is fine** while nothing outside can see it:

```ts
const totalsByOwner = (orders: readonly Order[]): ReadonlyMap<string, number> => {
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.owner, (totals.get(order.owner) ?? 0) + order.amount);
  }
  return totals;
};
```

Lint sees a `reduce` accumulator as a parameter, so writing to it is reported. Build with a loop as above, or return a new value from the callback.

## Module-level state

`og-no-module-state`

No top-level `let` or `var`, and no top-level `const` holding a `Map`, array or object that is written later. State lives in a value the caller holds. A program keeps its one mutable cell at the edge and passes values inward.

```ts
// Not this.
let cache = new Map<string, Price>();

// This: the caller owns the cache and gets the next one back.
const withPrice = (
  cache: ReadonlyMap<string, Price>,
  id: string,
  price: Price,
): ReadonlyMap<string, Price> => new Map([...cache, [id, price]]);
```

## Marking an effect or mutation

`og-mark-effects`

A function that mutates or causes an effect carries all four markers.

```ts
/**
 * Sorts the scores from highest to lowest, in the array it is given.
 * Mutates: scores.
 */
const sortScoresInPlace = (scores: number[]): void => {
  scores.sort((a, b) => b - a);
};
```

- **Name:** `…InPlace`, `save…`, `apply…`, `emit…`, `send…`. Names such as `pop` and `next` already say that they change something.
- **Types:** data types and parameters are `readonly` by default (`readonly T[]`, `ReadonlyMap`, `Readonly<T>`, `readonly` fields). A mutable parameter type then means "this function changes it".
- **Doc line:** one line in the docblock, `Effect: …` or `Mutates: …`, naming what is touched.
- **Place:** effects live at the program's edge or in a file whose job is IO.

A higher-order function is marked by what it does itself. The functions passed to it follow `og-functions-as-values`.

**`readonly` and `as const` mark intent; they do not make a value immutable.** Both are shallow, and TypeScript says so: "const contexts don't immediately convert an expression to be fully immutable" ([TypeScript 3.4 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html)). The marker tells the reader and the reviewer what is meant; the rule is still "don't mutate".

## Thin effects

`og-thin-effects`

Pure code decides; effectful code performs. The only branch an effectful function needs is whether its effect succeeded.

```ts
/** Decides what a renewal should store. Pure. */
const renew = (account: Account, now: number): Renewal =>
  account.paidUntil < now
    ? { kind: "lapsed", account: { ...account, active: false } }
    : { kind: "renewed", account: { ...account, paidUntil: now + YEAR } };

/**
 * Stores the outcome of a renewal.
 * Effect: writes the account to the store.
 */
const saveRenewal = async (store: AccountStore, renewal: Renewal): Promise<void> => {
  await store.put(renewal.account);
};
```

A function that reads from a database, branches on business rules and writes back is the shape to avoid, even for a simple transaction: split the decision out and it tests without the database.

## Functions as values

`og-functions-as-values`

- **Pass a function where it removes duplication**, not as a habit. A plain loop is fine.
- **Name a function once it runs past a few lines** instead of inlining it as a lambda.
- **A passed function mutates nothing it captures.** Reading a captured value is fine: `prices.map((price) => price * rate)`. Writing to one is not, unless the enclosing function just built it (`og-local-building`).
- **Give a passed function an explicit type** when the inferred one would hide a constraint the caller relies on.

## Data apart from behaviour

`og-data-apart-from-behaviour`, `og-entity-builders`

Data is a `type` or `interface` with `readonly` fields and no methods. Behaviour is a function that takes the data. A class is for behaviour only: it holds no data of its own and works on its arguments.

```ts
// Not this: data and business logic in one class.
class Order {
  constructor(public lines: OrderLine[]) {}
  total(): number {
    return this.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  }
}

// This.
type Order = { readonly lines: readonly OrderLine[] };

const orderTotal = (order: Order): number =>
  order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
```

**An entity is built by one function that checks its rules** and returns the data or an error. The type, the builder and every other rule about the entity sit in one module, so a rule is written once.

```ts
// email.ts — everything that is true of an Email lives in this file.
export type Email = { readonly address: string };

export type Built<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Builds an Email, or says why the text is not one. */
export const buildEmail = (text: string): Built<Email> =>
  /^[^@\s]+@[^@\s]+$/.test(text)
    ? { ok: true, value: { address: text.toLowerCase() } }
    : { ok: false, error: `"${text}" is not an email address` };
```

Code elsewhere never writes an `Email` literal; it calls `buildEmail`. Keep building easy (object literals, spread copies, small builders) so nobody reaches for mutation to save typing.

## Exceptions

`og-reasoned-exceptions`

**A code-level exception is a disable comment that names the rule ID and the effect:**

```ts
// eslint-disable-next-line ogham/no-param-reassign -- og-return-new-values: sorts the caller's buffer in place, 2M rows
rows[i] = rows[j];
```

- The reason after `--` is required. A disable with no reason is itself reported, and so is a disable that no longer silences anything.
- The comment is the exception's marker in the code; the function still carries the four markers of `og-mark-effects`.
- In-place mutation for performance is allowed this way. No benchmark is required, but the reason says what is mutated.
- A loosening for a whole folder or repo is a named exemption in `ogham.local.md`, never a bare config change.

## Lint rules and the core rules they check

The preset registers ESLint's own rules under an `ogham/` prefix, so they never collide with the repo's use of the same rules.

| Lint rule | Core rule | What it sees |
| --- | --- | --- |
| `ogham/no-param-reassign` | `og-return-new-values` | Assigning to a parameter or to one of its properties, and `delete` on one |
| `ogham/no-restricted-properties` | `og-no-hidden-inputs` | Clock, randomness and environment reads spelled as a property, such as `Date.now()`, `Math.random()` and `process.env` |
| `ogham/no-restricted-globals` | `og-no-hidden-inputs` | Ambient globals used directly, such as browser storage |
| `ogham/no-restricted-syntax` | `og-no-hidden-inputs`, `og-no-module-state` | `new Date()` with no argument and `Date()`; a top-level `let` or `var` |
| `ogham/disable-needs-reason` | `og-reasoned-exceptions` | A disable directive with no `-- reason` |

**Lint is a tripwire for the common spellings, not a proof.** The reviewer checks what it cannot see:

- a method call that mutates a parameter, such as `items.push(x)`;
- a hidden input read through an alias (`const { now } = Date`) or through `globalThis`;
- a top-level `const` holding a collection that is written later;
- every rule the table does not list.
