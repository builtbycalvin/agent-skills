# Implementation and verification record

## Scope and decisions

This skill was implemented on 2026-10-29 against repository base `b70a1f7ac4305c140ab1a2dfafc4a0cf5a9c8ca1`. The initial worktree was clean. Setup authorized reusable local implementation and research only. No installation, account mutation, upload, review submission, publishing, commit, or push was performed.

The supplied App Store Connect screenshot showed the Header and Search Results tab, no header asset, a Duo notice, and a waiting-for-review notice. It prompted investigation. Current Apple documentation and installed CLI help establish the capability baseline. The screenshot is not stored in this reusable skill.

Existing rule map before editing:

| Owner | Responsibility | Treatment |
| --- | --- | --- |
| Repository and installed `ios-release/SKILL.md` | Portable release config, local auth profile, explicit effects, asset preservation in routine releases | Existing behavior preserved. No shared business rule changed. |
| `asc-shots-pipeline` | Experimental capture, framing, screenshot review and upload plan/apply | Reused. Defaults are examples, not current Apple requirements. |
| `asc-screenshot-resize` | Screenshot inspection, size catalog and validation | Reused with current Apple requirement cross-check. |
| `asc-metadata-sync/references/asset-library.md` | Asset Library media, placement, review mechanics | Reused. No parallel API client added. |
| New bundle helper | Exact local manifest and referenced byte identity | New single owner. Does not validate media, authenticity, approval, or remote state. |

Two implementation shapes were considered. A separate upload engine would duplicate ASC authentication, reservations, retry, and placement rules. A coordinating skill with one local identity helper reuses the existing mechanics and covers the missing review-to-execution identity check. The second shape was selected. The Model the Domain principle shaped the explicit asset manifest and per-effect state model. The Laziness Protocol principle kept ASC mechanics in their existing leaf skills.

Throughput checkpoint:

- Blocking first steps. Inspect repository authority, skill guidance, installed release pattern, Apple requirements, and CLI capabilities before implementation.
- Independent workstreams. A read-only researcher checked CLI capabilities while the main session researched Apple and wrote the coordinating skill. A worker built the isolated byte-identity helper in a temporary directory.
- Shared mutable state. The main session alone wrote repository files. The worker owned only scratch helper files, which the main session inspected and copied.
- Smallest safe decomposition. One documentation owner and one bounded helper owner avoided overlapping edits. Independent review checked the integrated artifact.

## Validation evidence

The helper's Node tests exercise real CLI execution in temporary directories. They cover stable snapshots, changed manifest/media/source bytes, missing files, malformed schemas, duplicate JSON fields, unsafe paths, symlinks, and malformed snapshots. They do not use synthetic media as format-validation proof.

The authoring validator checks skill metadata and structure. Link checks confirm local reference targets exist. Forward evaluation uses fictional app scenarios without live account access. Independent review covers authority, input identity, integration, and provider capability claims.

Verified results:

- `node --test skills/app-store-assets/scripts/bundle.test.mjs` passed all 38 tests against the integrated repository files.
- `node --check` passed for both helper files.
- `skill-creator/scripts/quick_validate.py skills/app-store-assets` passed. The default Python lacked PyYAML. The successful run used an already cached PyYAML package through `PYTHONPATH`, without installation.
- Ruby YAML parsing passed for frontmatter and UI metadata. The default prompt and description-length checks passed.
- All seven local Markdown links resolve. All three JSON examples parse. `git diff --check` passed.
- A read-only forward evaluation exercised ambiguous multi-app setup, changed bundle inputs with a pending-review version, browser-only publication with no browser login, and an append exceeding the group limit. It led to clearer frozen-input semantics, a complete status vocabulary, explicit waiting-review guidance, and a stop before over-limit writes.
- An independent reviewer checked the integrated files, installed leaf skills, CLI help, and Apple documentation. It found no P1 or P2 issue. Its P3 correction clarified that screenshot replacement deletes media within a target set, not the set itself. The correction was applied.

Remote processing, upload, asset review acceptance, browser publishing, and app-specific visual output remain unverified until an explicitly authorized app run. Capture and rendering remain dependent on the app and its installed tools. The snapshot helper does not protect against concurrent filesystem mutation or prove that source-file declarations are complete.

## Initializer and doctor extension

The follow-up request authorized offline commands to make repository configuration consistent with `ios-release`.

The release config command owns release namespace creation and Git checks. Its portable validator owns release policy, and its strict JSON parser rejects duplicate object keys. The asset bundle previously owned its own duplicate-key parser. The asset parser was mechanically extracted into `scripts/strict-json.mjs` without changing its behavior or test assertions. All 38 existing bundle tests passed after extraction. New config commands reuse that module. Release files remain unchanged, so the asset skill can be installed independently.

The smallest implementation is one asset config command with `init` and `doctor`. A shared cross-skill config framework would expand this request and introduce installation coupling. No such framework was added. Linked release data is read for identity, selectors, locales, source roots, and profiles only. Locale differences are warnings, not a new forced-equality policy.

Implementation and test ownership stayed in an isolated temporary directory. The main session owns repository integration and documentation. Local JSON, Git ownership, visibility, file modes, path boundaries, and linked bindings are command checks. Device support, authenticated ASC identity, and current listing eligibility remain separate evidence checks.

Final validation for the extension:

- `node --test skills/app-store-assets/scripts/config.test.mjs skills/app-store-assets/scripts/bundle.test.mjs` passed all 59 tests. This includes 21 config CLI/Git fixture tests and the 38 unchanged bundle tests.
- A separate integrated CLI smoke check initialized a temporary Git repository, reported the empty scaffold as `incomplete`, validated a complete standalone config as `ready`, and proved repeated init preserved all existing configuration bytes.
- Independent review found four boundary defects in the first implementation. The correction added fatal UTF-8 validation, object-root validation, complete credential filename checks, and a canonical CLI entrypoint for symlinked installations. Regression tests and the independent correction review passed, with no remaining findings.
- The linked release source-root default was corrected to match `ios-release`. The bundle ID validator does not impose an unsupported mandatory reverse-DNS format.
- Skill metadata validation, local reference/JSON-example checks, and whitespace checks passed after documentation updates. Release files remained unchanged. No app repository was configured outside temporary verification fixtures.

The commands remain offline. `ready` does not prove authentication, device support, current Apple requirement coverage, or remote editability. Existing file modes are preserved by init; doctor reports unsafe permissions without repair.

## Product choices before the first app run

These are per-app choices, not global defaults or blockers for this reusable setup:

1. Choose the app, source revision/build, and target listing/version. Preserve a pending review unless a separate request authorizes changes.
2. Choose the asset kinds. A useful first bundle is screenshots plus a static header draft. Keep search creative and app preview production optional.
3. Choose the message, claims, order, and visual direction. Recommend real UI-led screenshots and a restrained brand header first.
4. Choose source locale, translated locales, and fallback policy. Discover required device coverage. Decide additional device/orientation variants based on real UI differences.
5. Choose existing template/rendering tools and whether generated artwork is allowed. Recommend editable repository templates and authentic UI captures.
6. Choose whether one universal creative serves header/search or dedicated assets serve each placement. Recommend dedicated composition when the search message needs more product detail.
7. Authorize remote effects separately when desired. Recommend local review first, then an exact upload/assignment plan. Standalone review and live publishing remain explicit decisions.

## Full skill review before publication

The full review found that bundle input checks had lagged behind config checks. `scripts/asset-paths.mjs` now owns the shared local-state and credential-path policy. Both helpers reject sensitive files at every directory depth, including nested local configuration and App Store private-key files. The shared strict JSON parser now rejects malformed UTF-8 in manifests, snapshots, and configuration. New bundle regression tests cover both findings.

The complete repository command `node --test skills/*/scripts/*.test.mjs` passed all 164 tests after these corrections. This includes 40 bundle tests, 21 asset config tests, and the existing release tests. The new GitHub Actions workflow runs the same command on Node 22 with read-only repository permissions and pinned official actions. Its provider result is separate from this local evidence.
