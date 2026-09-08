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

## Prerequisites

- Node.js 22.20.0 or newer and npm for `npx` and the local helpers.
- An agent with skill support.
- App Store Connect CLI 5.x and the current
  [ASC skill pack](https://github.com/rorkai/app-store-connect-cli-skills).
- Xcode and the signing setup required by the target app for local builds.
- Authenticated GitHub CLI when repository synchronization requires GitHub access.

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

## Update

Update installed skills:

```bash
npx skills@latest update
```

## License

MIT licensed. See [LICENSE](LICENSE).
