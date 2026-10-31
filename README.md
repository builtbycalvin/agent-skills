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

## App Store Assets

[app-store-assets](skills/app-store-assets/SKILL.md) configures and coordinates
app-agnostic screenshots, app preview videos, product page headers, and search
creative assets. It reuses installed ASC skills for capture, validation, upload,
and placement mechanics. Portable asset policy stays separate from ignored
machine bindings and run state. A local bundle helper detects changes after review.

The skill includes offline `init` and `doctor` commands for consistent repository
setup and validation. Run them from the skill directory with `--repo` pointing to
the app repository. See the [configuration contract](skills/app-store-assets/references/configuration.md).

```text
$app-store-assets configure this repository for App Store asset production.
$app-store-assets prepare a local screenshot and header bundle for review.
```

Routine `ios-release` runs preserve assets. Asset upload, assignment, review, and
publication require their stated scope. The skill documents browser/manual
fallbacks and does not claim that an upload proves storefront publication.

## App Store Listing

[app-store-listing](skills/app-store-listing/SKILL.md) diagnoses a product page
from App Store Connect analytics. It turns the standard Discovery and Engagement
and Downloads reports into funnel snapshots by source and territory, compares
them with a volume floor and a significance test, and maps each weak stage to the
listing fields that drive it. Proposals go to their owners: `ios-release` for
release copy, `app-store-assets` for media, and the ASC skills for keywords and
field writes.

The `monitor` command is app-agnostic. Schedule one weekly task per app with
that app's ID, profile, and analytics request; it exits 0 when quiet and 3 when
it has findings. It never writes to App Store Connect.

```text
$app-store-listing why did conversion drop last week?
$app-store-listing propose subtitle and screenshot changes from the funnel.
```

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
