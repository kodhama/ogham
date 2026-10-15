## Coding standard

This repo follows a coding standard. Its core and this repo's own layer are imported here:

@.ogham/coding/core.md

@ogham.local.md

{{languages}}- **Review rubric:** `.ogham/coding/rubric.md`. A reviewer grades a diff against it, and each finding cites a rule ID.
- **Read-only:** everything under `.ogham/`, and this block from `ogham:begin` to `ogham:end`, belong to ogham, whose `update` rewrites them. A change goes in `ogham.local.md`.
