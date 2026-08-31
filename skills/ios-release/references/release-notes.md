# Release notes and metadata scope

Use one normalized `ReleaseNoteSet` per app and marketing version. The tracked Markdown archive is the reviewable source. Canonical ASC metadata and optional TestFlight copy are derived outputs.

## Archive format

Write `<archiveDirectory>/<marketingVersion>.md` with JSON front matter between exact `---` lines:

```markdown
---
{
  "schemaVersion": 2,
  "app": "example",
  "marketingVersion": "2.4.0",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "sourceRange": "fedcba9876543210fedcba9876543210fedcba98..0123456789abcdef0123456789abcdef01234567",
  "sourceLocale": "en-US",
  "locales": ["en-US", "zh-Hant"]
}
---

## App Store What's New

### en-US

Find saved items faster with the new search and filters.

### zh-Hant

全新搜尋與篩選功能，讓你更快找到已儲存的項目。

## TestFlight What to Test

### en-US

Try searching a large saved-items list and changing filters.

## Evidence

Used: shipped tag ios/2.3.0, user-visible search and filter changes
Skipped: internal refactor, test-only changes
```

Front matter is identity, not mutable release state. Require one app key, marketing version, full 40-character `sourceCommit`, a range ending at that commit, and the exact configured locale list. Do not add build IDs, submission IDs, approval state, timestamps, or remote observations.

## Drafting

Prefer evidence in this order:

1. user-provided facts and approved product language;
2. the newest successfully shipped ASC version mapped to a repository tag;
3. canonical changelog or release artifacts;
4. user-visible source changes in the proved range.

Resolve the proved shipped tag once, then store its full commit ID as the `sourceRange` base. A tag or branch name is not immutable archived evidence.

If shipped ASC state and tags disagree, stop and present the candidates. Do not silently use the newest tag. Separate customer-visible changes from internal work. Never promise performance, security, compatibility, or behavior that the evidence does not prove.

Draft and approve the source locale before localization. Lead with the strongest benefit in the opening sentence. Prefer concrete verbs, short paragraphs, and a small number of meaningful changes. Preserve product names and platform terminology. Localize meaning and tone rather than translating mechanically. Each App Store locale must be nonempty and no longer than 4,000 characters.

TestFlight What to Test is optional and task-oriented. Tell testers what to exercise and what feedback matters. It may share evidence with App Store copy but should not simply duplicate marketing prose.

Optional promotional text uses a `## Promotional Text` section with the same locale headings. When present, require every configured locale and enforce Apple's 170-character limit. Keep it absent when the configured policy is `preserve`.

## Approval and gate

Copy approval is field-level and version-specific. An approved source-locale note authorizes localization drafting, not an ASC write. Approval of the complete locale set authorizes local canonical generation only unless the active request already authorizes metadata application.

For an update, App Store staging and submission require a valid archive matching app, version, source commit, source range, and locales. Missing notes require drafting and approval. Changed source commit, locale policy, or copy invalidates the gate. TestFlight does not use this gate.

On a fresh release, check against the archived `sourceCommit`. On resume after
the release-state commit is synchronized, the checker also accepts that exact
one-parent `releaseCommit` only when its parent is the archived source and its
committed note blob matches the archive. This preserves the immutable source
identity without making an already-pushed release impossible to resume.

The first App Store version has no What's New field. Skip the gate only after a live read proves there is no successfully shipped predecessor. A local empty history is insufficient.

## Metadata policy

| Field | Routine release behavior |
| --- | --- |
| `whatsNew` | Required for App Store updates and derived from the approved archive. |
| TestFlight What to Test | Optional, derived from the same evidence when useful. |
| `promotionalText` | Preserve by default. Draft an optional suggestion when policy is `suggest`; apply only after approval. |
| description, keywords, subtitle, name | Preserve unless the user explicitly requests listing or ASO work. |
| screenshots and previews | Preserve unless explicitly requested. |

Apply ASO principles to the customer decision, not as keyword stuffing. What’s New can improve clarity and conversion but is not an indexed keyword field. A broader listing change should run as an explicit metadata scope with an audit, per-field diff, canonical validation, dry run, approval, write, and exact readback.
