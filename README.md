# Agent skills

Reusable coding-agent workflows by [Calvin](https://github.com/builtbycalvin).

## iOS Release

[ios-release](skills/ios-release/SKILL.md) configures, inspects, prepares, and
releases iOS apps through one entry point. It keeps portable policy in tracked
`.ios-release/config.json`, keeps the ASC profile binding in ignored
`.ios-release/local.json`, resolves the app and version, and maintains one
reviewable release-note archive for App Store and optional TestFlight copy.

It never stores credentials or standing release authority. Exact release
requests authorize only their stated TestFlight or App Store lane. When the
canonical workflow changes tracked release state, the skill commits the exact
generated state and reconciles that commit with the verified upstream. Git
tags, tag pushes, and GitHub releases remain separate effects.

## Verify Agent Skills

[verify-agent-skills](.agents/skills/verify-agent-skills/SKILL.md) drives this
repository through the real `skills` CLI in an isolated project. It proves
discovery, selected or complete installation, package integrity, and prompt
generation without changing global skills or claiming downstream agent and
external-service behavior.

## Prerequisites

- Node.js 22.20.0 or newer and npm for `npx`.
- Codex with skill support.
- Python 3, Git, and network access during `verify-agent-skills` launch.
- App Store Connect CLI and the `rorkai/app-store-connect-cli-skills` skill pack
  for `ios-release` setup, TestFlight, and App Store work.

## Install

Install all skills from this repository:

```bash
npx skills@latest add builtbycalvin/agent-skills -g
```

## Use

Configure an iOS app repository for releases:

```text
$ios-release configure this repository for releases.
```

Release the configured app to an exact destination:

```text
$ios-release release this app to the internal TestFlight group.
```

`ios-release` recommends a marketing version when one is not supplied and asks
for confirmation before changing it. App Store staging and submission require
approved release notes for updates; TestFlight does not. It uses installed ASC
skills for current CLI mechanics and does not persist credentials or release
authority.

Verify the repository's installable package:

```text
$verify-agent-skills verify the installable skills in this repository.
```

`verify-agent-skills` uses an isolated project and home directory. It does not
change globally installed skills.

## Update

Update installed skills:

```bash
npx skills@latest update
```

## Attribution and license

This project is MIT licensed. See [LICENSE](LICENSE).
