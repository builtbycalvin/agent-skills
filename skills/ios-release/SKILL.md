---
name: ios-release
description: "Configure, inspect, prepare, and release iOS apps through one agent entry point. Use when asked to set up a project for releases, maintain its local release context, upload a build, distribute through TestFlight, stage an App Store version, submit to App Review, or diagnose release state. Routes changing ASC mechanics to the installed asc-* skills."
---

# iOS release

Own the release request from project setup through exact remote readback. The user does not need to choose an ASC skill.

Keep stable app selectors in the ignored `.ios-release/context.json` file. Keep credentials, versions, builds, submissions, observations, and release authority out of that file.

Resolve all referenced skills from the current skill catalog. Do not hardcode installation paths. Use `asc-cli-usage` for current command discovery and flags. Run `--help` before relying on an ASC command shape.

## Classify the request

Choose one intent. Use the narrowest meaning supported by the user's words.

| Request | Intent and authority |
| --- | --- |
| configure, set up, initialize | Inspect the project and ASC. Create or update ignored local context. No release effects. |
| refresh, maintain, doctor | Reconcile ignored local context with current read-only evidence. No release effects. |
| check, inspect, status, diagnose, ready | Read-only release inspection. |
| prepare, build, archive | Local version, build, archive, and export work stated by the request. No upload. |
| upload | Prepare an exact artifact when needed, then upload it. Do not distribute or submit. |
| release to internal TestFlight | Prepare and upload when needed, then make the exact build available to the resolved internal group. Do not run beta review for an internal group. |
| release to external TestFlight | Prepare and upload when needed, then complete the ASC steps required to make the exact build available to the resolved external group. Do not change testers or groups unless requested. |
| stage for the App Store | Prepare and upload when needed, stage the exact version and build, apply requested canonical metadata, and validate. Do not submit to review. |
| submit to App Review or release to the App Store | Prepare and upload when needed, stage the exact version and build, validate, and create one review submission. |

Creating a Git tag, pushing a tag, and creating a GitHub release are separate effects. TestFlight and App Store language never implies them.

The bare word `release` uses `defaultIntent` only when the user explicitly set that field. Without it, ask whether the destination is internal TestFlight, external TestFlight, App Store staging, or App Review. This is an authority choice. Do not ask the user for facts that repository or ASC evidence can answer.

An exact release imperative authorizes the effects in its selected row. State the effect plan immediately before the first remote write. Do not ask for redundant confirmation when the app, destination, version, build provenance, and effects are already exact.

## Configure or maintain a project

Read [the release-context reference](references/context.md) for configuration, maintenance, missing context, or conflicts.

1. Resolve the Git root. Read its `AGENTS.md`, canonical project files, and release documentation before inspecting generated Xcode output.
2. Resolve this skill's `scripts/context.mjs` relative to this file. Run `node scripts/context.mjs init --repo <root>` for configuration requests. This creates only ignored local state and updates the repository's local Git exclude file.
3. Gather repository evidence for app names, source roots, Xcode projects or workspaces, schemes, configurations, bundle IDs, team IDs, platforms, metadata paths, and release checks.
4. Inspect `asc auth status --output json` without printing credential material. Never call `asc auth switch`. Pass a named profile explicitly to every app-scoped ASC command.
5. Resolve apps by exact bundle ID through `asc-id-resolver`. Resolve TestFlight groups only when configuration or the selected intent needs them.
6. Write only stable, unambiguous selectors to `.ios-release/context.json`. Preserve configured identity when fresh evidence conflicts. Record the conflict instead of overwriting it.
7. Run `node scripts/context.mjs doctor --repo <root>`. Use `--app <key>` when validating one app. Resolve every `incomplete` item that evidence can answer. Ask only for choices that remain unresolved.

Never store API keys, issuer IDs, private-key paths, tokens, passwords, environment values, versions, build IDs, submission IDs, a prior readiness claim, or release authority in `.ios-release/`.

## Resolve one app

Resolve the target in this order:

1. Use an app explicitly named in the current request when it matches one configured app key, display name, or alias.
2. Use the configured app whose `sourceRoot` uniquely contains the current path.
3. Use `defaultApp` when the request is inside the same repository.
4. Use the sole configured or discovered shipping app.
5. Otherwise stop and show the evidence-backed candidates.

An explicit app that conflicts with the current repository is a targeting conflict. Do not jump to another repository or silently prefer the current checkout.

Before every remote effect, verify the named profile can read the configured app. Verify that the app ID, bundle ID, platform, and selected TestFlight group still match live ASC data. Local context selects the target. It never proves current remote identity.

## Build the release plan

State these values before the first remote effect:

- repository and exact Git commit;
- app key, display name, bundle ID, ASC app ID, platform, and named profile;
- Xcode container, scheme, configuration, version, and build provenance;
- destination and exact TestFlight group when applicable;
- allowed effects and excluded adjacent effects;
- required repository checks and ASC readbacks.

Stop when identity, intent, build provenance, or destination remains ambiguous. A dirty checkout is not automatically forbidden. Apply the repository's release policy and explain any provenance risk.

Resolve whether to reuse a verified existing build or create a fresh build from the user's request and repository policy. When both remain valid, ask before changing version or build numbers or uploading a new artifact.

## Route to ASC skills

Load only the skills needed for the resolved lane.

| Need | Owning skill |
| --- | --- |
| Current ASC commands, flags, output, and auth behavior | `asc-cli-usage` |
| App, build, version, group, tester, or submission IDs | `asc-id-resolver` |
| Local versioning, build, archive, export, validation, or upload | `asc-xcode-build` |
| Build processing and lookup | `asc-build-lifecycle` |
| TestFlight groups, notes, beta review, and distribution | `asc-testflight-orchestration` |
| App Store staging, publishing, and submission | `asc-release-flow` |
| Readiness blockers, stuck review, cancellation, or retry | `asc-submission-health` |
| Signing diagnosis or setup | `asc-signing-setup` |
| Canonical metadata changes | `asc-metadata-sync` |
| Release-note drafting | `asc-whats-new-writer` |
| An explicitly requested or already canonical resumable workflow | `asc-workflow` |

Do not copy their command recipes into this skill. Do not use `asc-workflow` by default.

## Execute and reconcile

Follow the owning skill's dry-run, validation, and confirmation rules. Preserve the effect boundary from this request when a leaf skill supports broader operations.

Use exact IDs after resolution. Do not rediscover an uploaded build through an unqualified latest-build query.

After each remote effect, read back the exact app, build, version, group, or submission state. A successful command exit, dry run, or agent report is not completion proof.

If a command times out or returns malformed output, treat its effect as unknown. Inspect live state before retrying. Continue from observed state instead of restarting the lane.

Return one outcome:

- `completed` with exact remote IDs and readback;
- `partial` with completed effects, unknown effects, current remote state, and one safe next action;
- `blocked` with the conflict or missing authority;
- `configured` with the context path and remaining setup choices.

Do not describe a partial release as successful. Do not widen the user's authority to repair an adjacent problem.
