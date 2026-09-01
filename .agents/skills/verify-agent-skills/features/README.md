# agent-skills verification map

This directory is the maintained source for verifying the user-facing package behavior of agent-skills. Read this index before driving a feature, then use the matching feature file as the literal recipe.

## Baseline preconditions

- Run from the agent-skills Git worktree containing `skills/ios-release` and the project verifier at `.agents/skills/verify-agent-skills`.
- Provide Node.js 22.20.0 or newer, npm/npx, Python 3, Git, and network access during launch.
- Launch a unique run ID with `scripts/verify-agent-skills launch <run-id>`.
- Require `scripts/verify-agent-skills doctor <run-id>` to report `HEALTHY` before driving.
- Never drive a scratch project that lacks the repository-bound ownership marker.

## Driving conventions

- Start each recipe with a fresh run ID; install recipes mutate their disposable project.
- Let launch resolve `skills@latest` once. Drive commands use that recorded version offline from the isolated cache.
- Use the local worktree as the package source so proof covers the exact files under review.
- Install only into the disposable project with its isolated `HOME`. Never install with `--global`; use the global listing only as a read-only absence check.
- Treat `list --json`, copied package bytes, generated prompts, and transcripts as the stable handles.
- Run cleanup after every success or failure. Preserve `.verification/verify-agent-skills/<run-id>`.

## Proof and skip reporting

- Capture the literal CLI action and the resulting project state, not only a success line.
- For installs, require JSON listing evidence plus a byte-for-byte source/package comparison.
- For non-install use, require source-identical generated instructions aside from the CLI delimiter newline and a byte-identical supporting package, then prove no project install appeared.
- Require unchanged content-bound source manifests and an empty isolated global listing for install recipes.
- Record the resolved CLI version because `skills@latest` can change after the proof.
- Report local-package proof separately from remote GitHub availability and from actual agent or App Store Connect behavior.
- Do not report an unrun feature or different skill name as covered.

## Feature entry contract

Each feature file uses exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with skills CLI`, and `Gotchas`. Commands are literal except for `<run-id>` and `<skill-name>`.

## Features

- [Discover skills](./discover-skills.md) covers the repository's public skill catalog and descriptions.
- [Install a selected skill](./install-selected.md) covers one project-scoped copied install and its listed state.
- [Install all skills](./install-all.md) covers the documented all-skills installation shape without global mutation.
- [Use a skill without installing](./use-without-install.md) covers prompt generation and temporary supporting files.
