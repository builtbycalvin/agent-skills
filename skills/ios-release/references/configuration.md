# iOS release configuration

V2 separates shareable release policy from the machine's ASC profile binding.
The tracked candidate is `.ios-release/config.json`. The ignored local file is
`.ios-release/local.json`. Neither file is a release receipt or credential store.

## Files

`.ios-release/.gitignore` is tracked and has this strict whitelist:

```gitignore
*
!.gitignore
!config.json
```

`config.json` uses schema version 2 and contains `defaultApp`, an `apps` map,
portable bundle and App Store IDs, source roots, Xcode project or workspace,
scheme, configuration, TestFlight group selectors, `metadataDirectory`,
`releaseNotes`, and an optional `defaultIntent`. `releaseNotes` requires a
repository-relative `archiveDirectory`, `sourceLocale`, non-empty unique
`locales` including that source locale, and `promotionalText` set to `preserve`
or `suggest`. `tagPrefix` and `tone` are optional guidance only.

`local.json` uses schema version 2 and contains only `apps.<key>.ascProfile`.
The profile name selects an ASC authentication profile; it does not prove that
the profile exists or that it can read the configured App Store record.
Credentials, private keys, tokens, versions, builds, submissions, readiness,
approvals, timestamps, and effect authority are forbidden in both files.

## Configuration and doctor

Run the helper from the installed skill directory:

```text
node scripts/config.mjs init --repo /absolute/path/to/repository
node scripts/config.mjs doctor --repo /absolute/path/to/repository [--app app-key]
```

`init` creates only missing files. It never overwrites existing configuration,
does not broad-ignore `.ios-release`, and creates `local.json` with mode 0600.
The portable file may be untracked, but Git must be able to see it. `doctor`
checks both JSON documents, the strict whitelist, Git visibility, tracked local
files, unknown and secret-shaped fields, selector collisions, relative paths,
safe archive locations, complete app selectors, and locale consistency. A
`ready` result means the local shape is complete, not that ASC or release gates
are currently ready.

Archive directories must be inside the repository, visible or trackable by Git,
and outside `.git`, `.asc`, `.ios-release`, credential directories, and generated
output such as `build`, `dist`, or `DerivedData`. Source, Xcode, metadata, and
archive paths must be visible to the parent repository; ignored paths, symlinks,
submodules, and nested Git repositories are invalid because their contents are
not owned by the synchronized parent commit. App keys, display
names, and aliases are case-insensitive selectors and must not collide. Each
configured app must have a unique App Store ID. Group IDs and names must be
explicit selectors. Resolve live identity through the owning ASC skills before
every remote effect.

## Evidence and app resolution

Use the current request first, then canonical repository files and generators,
tracked Xcode configuration, read-only build settings, and finally read-only ASC
evidence under the named local profile. Existing configuration is a consistency
check, not permission to ignore a conflict. Resolve an app by explicit key,
display name, or alias, then by a unique source root containing the current path,
then `defaultApp`, then the sole app. Stop on ambiguity.

## V1 migration

Plan or apply migration with:

```text
node scripts/config.mjs migrate --repo /absolute/path/to/repository --plan
node scripts/config.mjs migrate --repo /absolute/path/to/repository --apply
```

The helper reads V1 `.ios-release/context.json` only for migration. It copies
portable fields into `config.json`, moves only `ascProfile` into `local.json`,
creates the strict whitelist, and preserves the old file as
`context.v1.backup.json`. It removes only the exact `/.ios-release/` line that
the V1 helper added to `.git/info/exclude`. Writes use temporary sibling files
and atomic renames. Plan mode writes nothing and is safe to rerun.

Archive location is selected only from one documented, safe repository
convention, then an existing valid V2 location, then a deterministic
`release-notes/ios/<app-key>` or `release-notes` fallback. If multiple valid
candidates exist, migration returns `incomplete` with the candidates and makes
no changes. It never invents a location from a date or an ignored/generated
directory. A backup or partially completed migration is reconciled by comparing
normalized content; conflicting generations are reported rather than
overwritten.
