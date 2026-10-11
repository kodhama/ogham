# Coding standard: TypeScript

How the core rules look in TypeScript and JavaScript. **The core (`.ogham/coding/core.md`) is the standard; this page shows it applied.** Each section names the rule it illustrates. Like the core, it covers source code, not tests.

## Pure functions and hidden inputs

`og-pure-by-default`, `og-no-hidden-inputs`

Code at the edge reads the clock, a random seed, the environment or storage, and passes the values in. Logic never reads them.

```ts
// Not this: the result depends on when it runs.
const isExpired = (token: Token): boolean => token.expiresAt < Date.now();

// This: the time is an argument, so a test passes any instant it likes.
const isExpired = (token: Token, now: number): boolean => token.expiresAt < now;
```

The same goes for randomness (take a seed), `process.env` (take the parsed config) and storage (take the stored value).

**An injected clock or store is still an effect.** Edge code may take them as interfaces so a test can pass fakes, but logic receives the value they produced, never the interface.

**The edge's own read is a marked exception.** Lint cannot tell the edge from logic, so it reports the one place that is meant to read the clock. Mark that line as [Exceptions](#exceptions) shows, or exempt the edge's folder by name in `ogham.local.md`.

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

A function that causes an effect carries all four markers. A mutator carries the first three; it may live beside the logic that uses it.

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

`sortScoresInPlace` needs nothing more. Its markers are the record of the exception, and lint does not report a method call, so there is no disable comment to write.

A higher-order function is marked by what it does itself. The functions passed to it follow `og-functions-as-values`.

**`readonly` and `as const` mark intent; they do not guarantee an immutable value.** `readonly` is shallow, and `as const` reaches only the literal it is written on. TypeScript says so: "const contexts don't immediately convert an expression to be fully immutable" ([TypeScript 3.4 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html)). The marker tells the reader and the reviewer what is meant; the rule is still "don't mutate".

## Thin effects

`og-thin-effects`

Pure code decides; a function that mutates or causes an effect does only that. The only branch it needs is whether the effect succeeded.

```ts
type Renewal =
  | { readonly kind: "lapsed" }
  | { readonly kind: "renewed"; readonly paidUntil: number };

/** Decides what a renewal should do. Pure. */
const renew = (paidUntil: number, now: number): Renewal =>
  paidUntil < now ? { kind: "lapsed" } : { kind: "renewed", paidUntil: now + YEAR };

/**
 * Stores the outcome of a renewal.
 * Effect: writes the renewal to the store.
 */
const saveRenewal = async (store: RenewalStore, id: string, renewal: Renewal): Promise<void> => {
  await store.put(id, renewal);
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

**An entity is data with rules of its own.** An `Order` above is not one: any list of lines is a valid order. An email address is: not every string is valid. An entity is built by one function that checks its rules and returns the data or an error. The type, the builder and every other rule about the entity sit in one module, so a rule is written once.

```ts
// email.ts — everything that is true of an Email lives in this file.
import type { Built } from "./built.js";
// Built<T> is shared by every builder:
//   { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

export type Email = { readonly address: string };

/** Builds an Email, or says why the text is not one. */
export const buildEmail = (text: string): Built<Email> =>
  /^[^@\s]+@[^@\s]+$/.test(text)
    ? { ok: true, value: { address: text.toLowerCase() } }
    : { ok: false, error: `"${text}" is not an email address` };
```

Code elsewhere never writes an `Email` literal or a spread copy of one; it calls `buildEmail`, or another function in that module. Data with no rules of its own is built with plain literals and spread copies. Keep both easy, so nobody reaches for mutation to save typing.

## Exceptions

`og-reasoned-exceptions`

**A code-level exception is a comment at the spot that names the rule ID and the effect.** Where lint reports the line, the comment is the disable directive:

```ts
// eslint-disable-next-line ogham/no-param-reassign -- og-return-new-values: writes the sample into the caller's buffer
buffer[offset] = sample;
```

Where only the reviewer checks the rule, it is a plain comment in the same shape:

```ts
// og-thin-effects: pages through the table and decides per page; the rows do not fit in memory
```

- **The text after `--` is required**, and it names the rule ID and the effect. A disable with no text is itself reported, and so is a disable that no longer silences anything.
- **The function still carries its markers** (`og-mark-effects`). A marked mutator that lint does not report needs no comment at all.
- **In-place mutation for performance is allowed** as a marked mutator. No benchmark is required.
- **A loosening for a folder or the whole repo** is a named exemption with its reason in `ogham.local.md`, never a bare config change.

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
- a hidden input read through an alias (`const clock = Date; clock.now()`) or through `globalThis`;
- a top-level `const` holding a collection that is written later;
- every rule the table does not list.
