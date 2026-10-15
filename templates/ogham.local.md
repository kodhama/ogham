# Local coding rules

This file is this repo's own layer over the coding standard under `.ogham/coding/`. It was created once, and ogham never changes it: edit it freely. Rules here may add to the core or tighten it; they loosen it only through an exemption. Every agent that writes or reviews code here reads this file.

Each rule has a stable ID. The core's IDs start with `og-`, and a rule of this repo's own starts with `local-`. The check that ships with the standard fails when this file cites an `og-` ID the core does not define, or defines one `local-` ID twice.

## Tightenings

A tightening narrows a core rule for this repo. Write one bullet per tightening, citing the rule's ID:

```md
- `og-<id>`: <how this repo narrows the rule>.
```

None yet.

## Local rules

A rule the core does not have takes a `local-` ID, unique in this file. Write it the way the core writes its own: a bullet that opens with the ID in bold code, then the rule and its reason. Cite the ID in findings, and in an exception comment in place of an `og-` ID.

```md
- **`local-<slug>`** <the rule>.
  - Why: <the reason>.
```

None yet.

## Exemptions

An exemption loosens a core rule for a named scope. Each one names the rule's ID, where it applies, and why:

```md
- `og-<id>` in `<folder or glob>`: <the reason the rule cannot hold there>.
```

- **A code-level exception** needs no entry here. It is a comment at the spot, `og-<id>: <effect>; <reason>`. Where lint reports the line, the lint disable carries it (for example, in TypeScript, `eslint-disable-next-line ogham/<rule> -- og-<id>: <effect>; <reason>`); it is a plain comment otherwise.
- **A folder-wide loosening** is a block in the repo's own lint config that turns an `ogham/` rule off for a glob, plus a matching entry here. The config change without the entry is a finding.

None yet.
