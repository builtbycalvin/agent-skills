---
name: ios-release
description: "Configure, inspect, prepare, and release iOS apps through one guided entry point. Use for release setup, version selection, release notes, builds, TestFlight, App Store staging, App Review submission, metadata scope, or release diagnosis. Routes changing ASC mechanics to the installed asc-* skills."
---

# iOS release

Own the request from repository setup through exact remote readback. Infer the app and release intent from evidence. Ask only when a remaining choice changes the target, version, copy, or allowed effect.

Keep portable policy in tracked-candidate `.ios-release/config.json` and the machine's ASC profile binding in ignored `.ios-release/local.json`. Never store credentials, current versions or builds, readiness, approvals, observations, or standing release authority in either file.

Resolve required leaf skills before changing the repository or App Store Connect. Do not hardcode skill installation paths or install missing skills. Return `blocked` with the missing skill names and installation guidance. Use `asc-cli-usage` for current commands and flags, and run the relevant `--help` before relying on a command shape.

## Classify authority

Choose the narrowest intent supported by the request.

| Request | Authorized result |
| --- | --- |
| configure, set up, initialize | Inspect and create or update release configuration. No release effect. |
| refresh, maintain, doctor | Reconcile configuration with read-only evidence. No release effect. |
| check, inspect, status, diagnose, ready | Read-only release inspection. |
| draft or update release notes | Create or revise the local archive and requested canonical metadata. No ASC write. |
| prepare, build, archive | Local version, build, archive, and export work stated by the request. No upload. |
| upload | Prepare an exact artifact when needed, then upload it. Do not distribute or submit. |
| release to internal TestFlight | Prepare and upload when needed, then distribute the exact build to the resolved internal group. |
| release to external TestFlight | Prepare and upload when needed, then complete beta review and distribute to the resolved external group. |
| stage for the App Store | Prepare and upload when needed, require approved release notes, stage the exact version and build, apply authorized metadata, and validate. Do not submit. |
| submit or release to the App Store | Prepare and upload when needed, require approved release notes, stage and validate the exact version and build, then create one review submission. |
| update listing metadata or ASO | Audit and change only the named fields. This is separate from a routine release unless explicitly combined. |

The bare word `release` uses `defaultIntent` only when the user explicitly configured it. Otherwise ask for internal TestFlight, external TestFlight, App Store staging, or App Review. Creating or pushing a Git tag, creating a GitHub release, changing testers or groups, and rewriting listing metadata are separate effects.

An exact imperative authorizes the effects in its row. State the exact effect plan before the first remote write. Do not ask for redundant confirmation when app, lane, version, copy, build provenance, and effects are already explicit or already approved during this run.

## Configure a project

Read [configuration.md](references/configuration.md).

1. Resolve the Git root. Read repository instructions, canonical project files, generators, and release documentation before generated Xcode output.
2. Run `node scripts/config.mjs init --repo <root>`. For V1, run migration in plan mode first. The helper creates the strict tracked and local split without overwriting existing files.
3. Discover shipping apps, bundle IDs, App Store IDs, source roots, Xcode containers, schemes, release configurations, TestFlight groups, metadata paths, locales, tone, and existing note archives.
4. Propose the portable configuration. During initial setup, select a repository-visible archive location using this order: documented convention, one existing safe archive, `release-notes/ios/<app-key>` for a multi-app repository, then `release-notes` for a single app. Ask only if multiple valid locations remain.
5. Inspect `asc auth status --output json` without printing credential material. Never switch the active profile. Put only the chosen profile name in `local.json`, and pass it explicitly to every app-scoped command.
6. Resolve app IDs through `asc-id-resolver`. Resolve groups only when setup or the selected lane needs them. Preserve configured identity and report a conflict when fresh evidence disagrees.
7. Run `node scripts/config.mjs doctor --repo <root> [--app <key>]`. Resolve evidence-backed missing values and present user choices for the rest.

Configuration is suitable to commit because it contains portable selectors and policy. `.ios-release/.gitignore` keeps `local.json`, backups, and future machine-local files ignored while exposing only `.gitignore` and `config.json`.

## Resolve the app and version

Resolve the app by explicit key, display name, or alias, then a unique `sourceRoot` containing the current path, then `defaultApp`, then the sole shipping app. Stop with evidence-backed candidates on ambiguity. Before any remote effect, verify that the named profile can read the configured app and that app ID, bundle ID, platform, and selected group match live ASC data.

Accept an explicit marketing version after checking repository and ASC conflicts. Otherwise recommend one version from current evidence:

- use the repository version when it is already ahead of the newest shipped version;
- recommend a patch for fixes and small maintenance work;
- recommend a minor version for a new user-visible capability;
- recommend a major version only when the user states a breaking or product-level reset.

Show the current shipped version, repository version, evidence category, and recommendation. Obtain confirmation before changing a marketing version. Version confirmation does not authorize an upload, distribution, staging, or submission that the request did not already authorize.

## Prepare release copy

Read [release-notes.md](references/release-notes.md). This skill owns the normalized release-note process. Do not require `ios-whats-new` or `asc-whats-new-writer`.

Determine the source range from the newest successfully shipped App Store version and its matching repository tag when live evidence can prove it. Do not use the newest uploaded or unshipped version as the baseline. If the shipped tag cannot be proved, present the proposed range and uncertainty before drafting.

Inspect user-provided bullets, canonical changelog or release artifacts, and user-visible changes in the source range. Exclude internal refactors, developer tooling, unshipped flags, speculation, and unsupported claims. Draft the source locale first, lead with the strongest user benefit, use concise scannable language, localize naturally, and enforce the 4,000-character App Store limit.

Store the approved normalized note set at `<archiveDirectory>/<marketingVersion>.md`. Use it to produce both the canonical App Store `whatsNew` fields and optional TestFlight What to Test copy. Do not maintain competing copies.

For an App Store stage or submit of an update, run:

```text
node scripts/release-notes.mjs check --repo <root> --app <key> --version <version> --source-commit <full-sha>
```

`missing` means draft the note and pause for copy approval. `conflict` means repair or reapprove stale or malformed copy. Proceed only on `valid`. A first App Store version may be not applicable only when live ASC evidence proves no shipped predecessor. Record that evidence in the release plan. TestFlight lanes never require an App Store release-note archive, though they may use optional What to Test copy.

Routine releases change only `whatsNew`. If `promotionalText` is `suggest`, draft an optional conversion-focused suggestion and ask for copy approval before applying it. `preserve` leaves it untouched. Description, keywords, subtitle, name, screenshots, and other listing fields require an explicit metadata or ASO intent. When requested, load `asc-aso-audit` for recommendations and `asc-metadata-sync` for canonical validation and writes. What’s New is conversion copy, not a keyword-indexing surface, so never stuff keywords into it.

## Build and execute

For lanes that can change tracked state, read [repository.md](references/repository.md). State repository and upstream state, `sourceCommit`, app identity, profile, Xcode container, scheme, configuration, marketing version, build provenance, archive path and note status, destination, allowed effects, excluded effects, required checks, and planned readbacks.

Load only the leaf skills needed for changing mechanics:

| Need | Owning skill |
| --- | --- |
| ASC commands, flags, output, and authentication | `asc-cli-usage` |
| App, build, version, group, tester, or submission IDs | `asc-id-resolver` |
| Versioning, build, archive, export, validation, or upload | `asc-xcode-build` |
| Build processing and lookup | `asc-build-lifecycle` |
| TestFlight groups, beta review, notes, and distribution | `asc-testflight-orchestration` |
| App Store staging and submission | `asc-release-flow` |
| Canonical metadata validation and writes | `asc-metadata-sync` |
| Listing and ASO review when explicitly requested | `asc-aso-audit` |
| Readiness blockers, stuck review, cancellation, or retry | `asc-submission-health` |
| Signing diagnosis or setup | `asc-signing-setup` |
| An explicitly requested canonical resumable workflow | `asc-workflow` |

Do not copy their command recipes here and do not use `asc-workflow` by default. Preserve this skill's narrower effect boundary when a leaf supports broader operations.

Use exact IDs after resolution. Never rediscover an uploaded build through an unqualified latest query. After every remote write, read back the exact app, build, version, group, localization, or submission. A successful exit or dry run is not proof.

If a write times out or returns malformed output, mark the effect `remote-unknown` and inspect live state before retrying. Never repeat an upload while that version and build outcome remains unknown. Continue from observed state and report `partial` when remote and repository outcomes differ.

Return `completed`, `partial`, `blocked`, or `configured`. Include exact versions, commits, remote IDs, readback, remaining uncertainty, and one safe next action. Never describe a partial release as successful or widen authority to repair an adjacent problem.
