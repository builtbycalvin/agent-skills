# Release context reference

`.ios-release/context.json` is ignored local state for stable app selectors. It is not an ASC configuration file, credential store, release receipt, or workflow definition.

## Shape

The machine-readable schema lives in [context.schema.json](context.schema.json). A complete context can contain several apps:

```json
{
  "schemaVersion": 1,
  "defaultApp": "cubby",
  "apps": {
    "cubby": {
      "displayName": "cubby",
      "aliases": ["cubby ios"],
      "sourceRoot": ".",
      "bundleId": "com.example.cubby",
      "appId": "1234567890",
      "platform": "IOS",
      "ascProfile": "example-team",
      "xcode": {
        "project": "Cubby.xcodeproj",
        "scheme": "Cubby",
        "configuration": "Release"
      },
      "testflight": {
        "internalGroups": [
          {
            "id": "00000000-0000-0000-0000-000000000000",
            "name": "Internal"
          }
        ],
        "externalGroups": []
      },
      "metadataDirectory": "metadata",
      "defaultIntent": "internal-testflight"
    }
  }
}
```

Use `defaultIntent` only when the user explicitly states that preference. The value selects the meaning of a later bare release request. It does not persist authority for a remote effect.

## Evidence order

Prefer evidence in this order:

1. The user's explicit app or destination in the current request.
2. Canonical repository files, including project generators, manifests, and release policy.
3. Tracked Xcode projects and workspaces when they are canonical.
4. Read-only Xcode build settings for the exact scheme and configuration.
5. Read-only ASC results under an explicit named profile.
6. Existing local context when current evidence does not conflict.

Do not infer the shipping app from the first Xcode target, the default ASC profile, or the newest remote build.

## Setup

Run the helper relative to the installed skill:

```bash
node scripts/context.mjs init --repo /absolute/path/to/repository
```

`init` adds `/.ios-release/` to the repository's local Git exclude file. It does not edit the tracked `.gitignore`. It creates a minimal context only when the file does not exist.

Populate fields from repository and read-only ASC evidence. Leave a field absent when evidence has no single answer. Do not use empty placeholders for unknown identifiers.

Validate local structure after each update:

```bash
node scripts/context.mjs doctor --repo /absolute/path/to/repository
node scripts/context.mjs doctor --repo /absolute/path/to/repository --app cubby
```

The doctor returns one state:

- `ready` means the selected local app has every stable selector required for live release checks.
- `incomplete` lists missing local selectors or an unresolved multi-app default.
- `conflict` reports malformed, unsafe, ambiguous, tracked, or escaping data.

`ready` does not mean the app is ready to release. The skill must still verify repository gates and live ASC identity before remote effects.

## Bootstrap during a release

A release request may initialize missing context without a separate configuration request. Run `init`, gather repository and read-only App Store Connect evidence, then write only stable selectors that have one answer.

Continue the release when `doctor` reports `ready`. Missing context alone is not a release blocker.

Stop before remote effects when the app, profile, destination, or another stable selector remains ambiguous. Do not install a missing skill or command as part of context bootstrap.

## Maintenance

Refresh context when the user requests it, the doctor reports a problem, a profile or app identity changes, a project moves, or live pre-effect evidence conflicts with local selectors.

Update a stable field only when the evidence has one answer. If the configured value and current evidence differ, preserve both in the report and stop release effects. Do not silently repair an identity conflict.

Do not store observations such as `lastVerifiedAt`, a current version, a build ID, a submission ID, or readiness. Those values become stale and must be resolved per run.

## Multiple apps

Use one entry in `apps` for each shipping app. Give each app a unique key, source root, display name, and aliases. Set `defaultApp` only when the user or repository structure establishes one default.

When several apps share one repository, resolve by the explicit app name first and the current path second. Stop when both methods remain ambiguous.

## No secrets

The context may store a named `ascProfile`. It must not store credential material or a path to credential material.

Keep these values out of the context:

- private keys and `.p8`, `.pem`, or `.key` paths;
- key IDs, issuer IDs, JWTs, passwords, and tokens;
- environment values and credential exports;
- signing identity passwords;
- local Apple-account email addresses.

Use ASC keychain profiles and the owning ASC skill for authentication and signing setup.
