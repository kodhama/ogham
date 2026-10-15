<!-- prettier-ignore-start -->

{{core}}
<!-- prettier-ignore-end -->

### Where the rest of the standard is

{{languages}}- **Review rubric:** `.ogham/coding/rubric.md`. A reviewer grades a diff against it, and each finding cites a rule ID.
- **This repo's own layer:** `ogham.local.md` holds its tightenings, local rules and exemptions, and they change what counts as a finding. Read it before writing or reviewing code.
- **Read-only:** everything under `.ogham/`, and this block from `ogham:begin` to `ogham:end`, belong to ogham, whose `update` rewrites them. A change goes in `ogham.local.md`.

Agents that follow imports load the local layer from this line:

@ogham.local.md
