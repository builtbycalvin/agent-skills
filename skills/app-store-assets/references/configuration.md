# Configure an app asset pipeline

## Portable configuration

Store asset policy in `.app-store-assets/config.json`. Create it only when setup for a target repository is requested. Do not configure this skill repository as a shipping app.

Run the commands from the installed skill directory:

```text
node scripts/config.mjs init --repo /absolute/path/to/app-repository
node scripts/config.mjs doctor --repo /absolute/path/to/app-repository
node scripts/config.mjs doctor --repo /absolute/path/to/app-repository --app app-key
```

`init` creates only missing `.gitignore`, `config.json`, and `local.json` files. Both JSON files start as `{ "schemaVersion": 1, "apps": {} }`. New local bindings use mode 0600. Existing file contents and permissions stay unchanged. Known namespace, tracking, or ignore conflicts stop initialization before file creation. Rerunning `init` does not populate app choices or repair existing configuration.

`doctor` reads configuration and Git state without writing files or calling ASC. It validates UTF-8, object roots, duplicate JSON keys, the portable/local contract, linked release identity and profiles, selectors, path ownership, Git visibility, and local-file protection. Empty or missing required choices produce `incomplete`. Malformed values, unsafe paths, or conflicting bindings produce `conflict`. `ready` means local configuration is complete, not that credentials, devices, Apple requirements, or remote targets are ready.

Both commands print JSON. `init` exits 0 for `initialized`. `doctor` exits 0 for `ready`. Incomplete or conflicting results exit 1. Use `--help` for supported options. `--app` scopes missing-choice reporting to that app; malformed or unsafe configuration remains a conflict across the whole file.

This example shows an existing `ios-release` integration. The app key must exist there. Values are illustrative, not defaults for another app.

```json
{
  "schemaVersion": 1,
  "defaultApp": "example",
  "apps": {
    "example": {
      "releaseApp": "example",
      "assetRoot": "store-assets/example",
      "sourceLocale": "en-US",
      "locales": ["en-US"],
      "devices": ["iphone", "ipad"],
      "orientations": ["portrait"],
      "templates": {},
      "capturePlan": "store-assets/example/capture.json"
    }
  }
}
```

Use either `releaseApp` or a standalone `identity` object, never both. Standalone identity has `name`, `bundleId`, `ascAppId`, `sourceRoot`, and `platform: "IOS"`. Discover its Xcode configuration through canonical repository files and `asc-xcode-build` when a local build is needed. Keep machine Xcode selections out of portable identity. Bundle ID and App Store ID are public selectors, not secrets.

`schemaVersion`, `apps`, and each app's `assetRoot`, `sourceLocale`, `locales`, `devices`, `orientations`, and `templates` are required. `defaultApp`, `capturePlan`, and exactly one identity form complete the supported fields. App keys are unique case-insensitive selectors. Resolve display names and aliases from linked release config, or the standalone name. Reject ambiguous selectors.

`locales` is nonempty and unique, and includes `sourceLocale`. `devices` contains `iphone`, `ipad`, or both, only when the app supports them. `orientations` contains supported `portrait`, `landscape`, or both. Discover individual display targets and Duo inner/outer variants per run. These broad device selectors are not an evergreen Apple requirement matrix.

`templates` maps any of `screenshots`, `appPreview`, `header`, and `search` to a repository-relative editable template file. Empty means undecided, not permission to invent branding. Missing optional asset kinds stay unchanged remotely. A universal template may serve header and search only after crop review. Template files own typography, spacing, backgrounds, frame strategy, localized copy slots, and animation parameters. Do not put those details in multiple config fields.

Create `.app-store-assets/.gitignore` with this whitelist:

```gitignore
*
!.gitignore
!config.json
```

Store machine bindings only in `.app-store-assets/local.json`, mode 0600:

```json
{
  "schemaVersion": 1,
  "apps": {
    "example": {
      "ascProfile": "my-profile",
      "simulators": {"iphone:en-US": "simulator-udid"}
    }
  }
}
```

For linked apps, omit `ascProfile` here and resolve `.ios-release/local.json` by `releaseApp`. If both define it, require agreement. Never switch the active profile. Pass the resolved name as global `asc --profile <name>` for app-scoped reads and writes. Simulator bindings are optional and do not authorize installation or simulator creation.

## Setup and doctor checks

1. Inspect existing files before writing. Create only missing files, and propose conflicts without overwriting them.
2. Reject unknown config fields and secret-shaped values. Never store credentials, current versions, builds, approval flags, remote observations, or standing authority.
3. Require all referenced paths to stay within the repository. Reject traversal, absolute portable paths, symlinks, credential paths, nested repositories, and generated output as canonical asset sources.
4. Keep `assetRoot` visible to Git and outside `.git`, `.asc`, `.ios-release`, `.app-store-assets`, build output, and secret directories. Keep editable templates and capture plans portable.
5. Confirm config is visible to Git and local bindings remain ignored and untracked. Preserve existing ignore rules. Do not broadly ignore the portable asset source directory.
6. Verify linked app keys, source locale, and device support. Report locale differences against the current listing and release config. Do not silently add or remove listing localizations.
7. Inspect current auth status without exposing credentials. Resolve app identity through the named profile before remote operations. Local shape completeness is not remote readiness.

The helper performs deterministic local checks. The agent still verifies actual device support, live locale coverage, credentials, and remote identity when the request needs ASC access. Linked locale differences are reported for reconciliation, without silently rewriting either configuration. Existing release helpers still own `.ios-release`; asset initialization never modifies them.

Prospective `assetRoot` directories may be absent. A configured template or capture-plan file that has not been created produces `incomplete`. Existing paths must have the correct type. Each app needs a distinct, nonoverlapping asset root. For linked apps, doctor reads only the release identity, selector, locale, source-root, and profile fields needed by the asset integration. A linked release app's omitted `sourceRoot` means the repository root, as in `ios-release`. Unrelated release build or TestFlight completeness does not gate asset configuration.

Bundle IDs use [Apple's allowed character set](https://developer.apple.com/documentation/BundleResources/Information-Property-List/CFBundleIdentifier). A reverse-DNS naming convention is not an extra local readiness gate. Live app identity still requires ASC evidence before remote effects.

## Bundle and run contract

Use `<assetRoot>/bundles/<bundle-key>/` for a reviewable local bundle. The key is a descriptive run label, not an automatic current-version selector. Put the bundle manifest at its root. Paths inside it are relative to that root.

```json
{
  "schemaVersion": 1,
  "appKey": "example",
  "assets": [
    {
      "key": "home-en-phone-01",
      "kind": "screenshot",
      "locale": "en-US",
      "group": "APP_IPHONE_61",
      "order": 1,
      "file": "exports/en-US/home.png",
      "sourceFiles": ["sources/home.png", "sources/capture.json", "sources/template.json"]
    }
  ]
}
```

The strict manifest accepts only these fields. Kinds are `screenshot`, `app-preview`, `header-image`, `header-video`, `search-image`, and `search-video`. `order` is a positive integer. Keys and kind/locale/group/order slots must be unique. Each asset requires at least one source file. The `group` uses the selected upload route's exact display or placement identifier. Do not equate `APP_IPHONE_61`, upload aliases, and Asset Library group strings without current evidence.

`sourceFiles` includes every input that could change the output or its interpretation, including localized copy, template export, capture provenance, fixtures, and video timeline. Copy the necessary nonsecret inputs into the bundle instead of referencing external paths. Never copy credentials, private user data, signed upload URLs, or local config. This is a byte identity check, not proof that the declared inputs are complete or authentic.

The frozen bundle owns the approved input versions. A later edit to a repository template outside that bundle does not change the approved bundle. Incorporating that edit into the bundle, regenerating output, or changing a declared input requires new affected review. Never rebuild an approved export from an unrecorded newer template before upload.

Run helpers from the installed skill directory:

```text
node scripts/bundle.mjs snapshot --manifest /absolute/bundle/manifest.json > /absolute/review/snapshot.json
node scripts/bundle.mjs verify --manifest /absolute/bundle/manifest.json --snapshot /absolute/review/snapshot.json
```

The helper writes nothing itself. Keep the snapshot outside referenced files. It rejects unsafe paths and checks the exact manifest bytes plus referenced file bytes. The snapshot is not approval, file-format validation, or remote proof. Never recreate it silently to bypass a mismatch. Revalidate changed assets, regenerate review output, and obtain affected approval again.

Keep `run.json` in ignored `.app-store-assets/runs/<bundle-key>/`. It records app/profile identity, exact remote version and localization IDs, source commit/build, capture device/runtime/locale/orientation and fixture, template revision, measured media properties, specification source/date, snapshot location/hash, review evidence, remote diff, per-stage allowed effects, resource IDs, checksums, processing states, and readback evidence. Authority comes from the current user request, never from a previous run record. Readbacks must omit secrets and upload operations containing signed URLs.

Record each effect as `planned`, `remote-unknown`, `observed`, `verified`, or `failed`. Resume through reconciliation, not a stored boolean. Portable config stays free of run state.
