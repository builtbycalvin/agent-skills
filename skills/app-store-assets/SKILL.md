---
name: app-store-assets
description: "Configure, capture, compose, validate, review, and stage App Store screenshots, app preview videos, product page headers, and search creative assets. Use for reusable listing asset pipelines, separate from routine iOS releases. Routes ASC mechanics to installed asc-* skills."
---

# App Store assets

Produce a reviewable asset bundle for any supported app. Preserve authentic app UI and existing remote assets. Report the exact stage reached.

```text
discover -> configure -> capture/compose -> validate -> visual approval
                                                         |
                          remote diff <- frozen bundle <-+
                               |
                    authorized upload -> assign -> review -> publish
```

## Resolve scope and authority

Read repository instructions and [configuration.md](references/configuration.md) before setup. Resolve required installed leaf skills by name, not hardcoded installation paths. Do not install tools, skills, fonts, or simulator runtimes without authority. If a leaf or tool is missing, continue independent work and use the explicit fallback in [production.md](references/production.md).

| Request | Allowed effect |
| --- | --- |
| Configure, discover, doctor, inspect, plan | Local configuration or read-only inspection. No app installation or ASC write. |
| Design, generate, compose | Local drafts using approved inputs. No capture installation or ASC write. |
| Capture or record | Capture the resolved installed app. Building or installing needs stated or existing authority. |
| Validate, preview, approve | Local checks and review. Approval of appearance grants no remote effect. |
| Upload | Upload only the approved exact files to the named destination. Legacy uploads also create their named set associations; disclose this. |
| Assign or replace | Change only the named locale, placement, group, and order. Replacement requires explicit scope. |
| Submit assets for review | Submit only the resolved assets and intended review items. No app submission changes unless explicitly combined. |
| Publish assets | Publish only the named approved placements. Requires an explicit publishing request. |

An exact imperative can authorize its stated effects without redundant confirmation. State the concrete effect plan before the first remote write. A saved config, visual approval, CLI `--confirm`, or leaf example grants no authority. Do not remove a version from review to make assets editable. Return `blocked` for an ineligible target and explain the available next lane.

## Configure and discover

1. Resolve the Git repository and run `node scripts/config.mjs init --repo <root>` from this skill's directory. Resolve the app from explicit selectors, a unique source root, configured default, then the sole app. Stop app-specific work on ambiguity or identity conflict.
2. Reuse `.ios-release` identity, Xcode discovery, locales, and local ASC profile when linked. Keep asset policy separate. Never copy release state or release authority.
3. Inspect current Apple sources and installed command help using [capabilities.md](references/capabilities.md). Record CLI version, date, unsupported stages, and relevant size/specification evidence.
4. Discover app-supported device families, orientations, source locale, listing locales, existing asset source directories, capture fixtures, design tokens, and Xcode generator. Propose missing choices before producing app-specific creative work.
5. Fill the initialized portable config and ignored local bindings from confirmed evidence and choices. Run `node scripts/config.mjs doctor --repo <root> [--app <selector>]`. Complete the remaining evidence checks in configuration.md. Report `configured` or `incomplete`, without claiming remote readiness.

## Produce and approve a bundle

Read [production.md](references/production.md) before generation for current Apple content rules, design guidance, capture, composition, technical validation, safe areas, and visual review. Load only the leaf skills needed for the selected task. For selected header and search creative, propose video first with a still fallback, and pass the creative video quality gate in production.md before export.

| Need | Reuse |
| --- | --- |
| Commands, auth, pagination, API schema, capability discovery | `asc-cli-usage` |
| App, version, localization, and other resource IDs | `asc-id-resolver` |
| Authentic simulator capture, framing, screenshot review and upload planning | `asc-shots-pipeline` |
| Screenshot dimensions, alpha and color inspection, resizing and validation | `asc-screenshot-resize` |
| Asset Library and creative placement mechanics | `asc-metadata-sync`, especially its `references/asset-library.md` |
| Authorized local build or archive | `asc-xcode-build` |
| Explicit asset review combined with a release | `asc-release-flow` |

Keep source media immutable. Store ordered outputs, capture provenance, template version, localized copy, measured properties, and the current specification evidence in the run directory. Use the [bundle contract](references/configuration.md#bundle-and-run-contract) and snapshot helper before approval. Never run bulk approval commands on the user's behalf without evidence that the user approved those files.

Review real rendered files, including video playback and poster frames. Preview every selected locale, device family, and orientation. Mark local mockups as approximations. App Store Connect Preview adds authoritative crop/context evidence when the assets are available there. Do not upload merely to obtain that preview without upload authority.

## Diff, execute, and resume

Read [execution.md](references/execution.md) for effect gates, remote diff, reconciliation, exact readback, and browser fallback. Verify the frozen bundle immediately before every remote stage. Recheck the exact app, version, locale, placement, and profile against live state.

Return `configured`, `incomplete`, `prepared`, `awaiting-approval`, `uploaded`, `assigned`, `submitted`, `published`, `partial`, or `blocked`. Include evidence, resource IDs, unverified stages, and unresolved decisions. Do not claim a live storefront update from an upload, placement state, successful process exit, or local preview.

## Integrate with ios-release

Routine `ios-release` runs preserve assets. This skill does not change release notes, promotional text, marketing versions, builds, testers, or submissions by default. An explicitly combined request passes the frozen asset bundle, exact remote diff, intended version, and authorized stages to the release owner. The release owner retains submission authority and performs its own exact readback. Never make asset refresh a hidden release prerequisite.

See [verification.md](references/verification.md) for implementation evidence, known limits, and product decisions before the first app run.
