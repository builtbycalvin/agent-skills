# Capability evidence and current discovery

This is a discovery baseline checked on 2026-10-29 with ASC CLI 5.17.1. CLI build commit and date were unavailable. Help inspection proves exposed commands, not successful operations against an account. No live upload, asset review, or publishing was tested while creating this skill.

## Recheck at use time

Load `asc-cli-usage` and inspect the relevant leaf help. Retain version and help evidence for operations selected in the run.

```text
asc version
asc capabilities --area metadata --output json
asc screenshots --help
asc screenshots sizes --all --output json
asc screenshots validate --help
asc screenshots plan --help
asc screenshots apply --help
asc video-previews --help
asc video-previews upload --help
asc asset-library --help
asc asset-library specs --help
asc localizations placements --help
asc localizations placements create --help
asc localizations placements swap --help
asc review --help
```

`asc --profile <resolved-profile> asset-library specs --output json` reads Apple's current reference data. Retain the applicable specifications, accepted categories, placement types, groups, limits, and source date. This is a read, not permission for an upload. Do not invent a `reference-data` or `assets` command. Check native commands before `asc api`. Use bundled API schema only where a native command is missing, through the owning leaf.

| Operation | Verified path class | Limitation and fallback |
| --- | --- | --- |
| Simulator capture and framing | Local tooling through `asc-shots-pipeline` | Experimental capture. Requires the selected app and tools. Use supplied authentic captures when unavailable. |
| Screenshot sizes and local validation | Local CLI catalog and validation | Catalog can lag Apple. Resolve requirement conflicts before writing remote assets. |
| Screenshot and app preview sets | Public API through `screenshots` and `video-previews` | Use exact localization IDs and display types. Replacement deletes existing media within the target set. Preview upload requires suitable existing media. |
| Asset Library image/video upload and reads | Public API 4.5.1 core resources | Current CLI supports both. Confirm processing and matched specification. |
| Header/search placement create/list/reorder/delete | Public API through `localizations placements` | Creative type names are `PRODUCT_PAGE_HEADER_ASSET` and `APP_STORE_SEARCH_RESULTS_ASSET`. Creative group is currently `DEFAULT_PROFILE`. |
| Placement swap | CLI-supported provider extension | CLI describes a live-verified extension outside the official create schema. Prefer documented core operations where suitable. Do not improvise destructive fallback after failure. |
| Asset review items and submissions | CLI-supported with provider verification limits | Installed guide says live review-item acceptance and final approval remain unverified. Inspect provider results and never promise unattended completion. |
| Publish approved creative to an already live version | Browser or manual flow documented by Apple | CLI has no separate publication command. Browser Publish is a real publishing effect. |
| Apple placement Preview tool | Authenticated browser or manual UI | Local HTML cannot prove Apple's cropping or storefront state. |
| CLI web-session asset publication | Not exposed in inspected help | Do not invent `asc web` asset commands or assume an API profile authenticates the website. |
| Unsupported hardware capture or absent rendering tool | Unsupported in the current environment | Produce a specification and exact handoff package. Do not synthesize evidence of capture or install dependencies silently. |

App Clip header images are a different resource from product page header creative. Paid Apple Ads assets, event artwork, custom product pages, and optimization experiments require separately scoped requests.

## Current Apple requirements to verify

[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) currently require a Dynamic Island medium iPhone screenshot and a 13-inch iPad screenshot when iPadOS is supported. PNG/JPEG screenshots must have no alpha. There can be 1 to 10 screenshots per device size. Duo outer sizes are 1398 x 2034 and the reverse. Inner sizes are 2007 x 2853 and the reverse. The current page states an April 2027 requirement for apps using iOS 27.1 SDK or later. Recheck its wording and effective date. Never promote that future requirement into a current universal blocker. The installed catalog includes Duo and `APP_IPHONE_61`, including 1206 x 2622. Legacy leaf examples that default to `IPHONE_65` do not establish today's minimum coverage. Use Apple's current family table, scaling rules, the app's actual UI differences, and live reference data together.

[App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) currently allow up to three videos per device size and language. They require 15 to 30 seconds, at most 500 MB, and at most 30 fps. Accepted video resolutions differ from screenshot resolutions. Current large/medium iPhone and Duo video examples use 886 x 1920 or the reverse. The 13-inch iPad uses 1200 x 1600 or the reverse. Check the chosen display row, H.264 or ProRes 422 HQ codec/container, progressive video, and audio requirements. Processing can take up to 24 hours. Do not use creative-video specifications for app previews.

[Creative asset specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications) currently list header images at 3840 x 1646 and search images at 3:2, between 1920 x 1280 and 3840 x 2560. The page also lists 5244 x 2950 PNG images for both placements. Inspect the current universal template and reference-data compatibility before using that route. Images cannot have alpha. Header videos use 3840 x 1646. Search videos use the stated 3:2 range. Both allow 5 to 30 seconds at 30 or 60 fps in MOV, M4V, or MP4. Do not infer universal video support from the universal image row. Do not reject Apple's exact pixel dimensions because a rounded aspect-ratio calculation differs.

## Owning sources

- [Apple asset management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets) distinguishes upload, placement, review, and live publishing. Creative assets are optional and appear on iOS/iPadOS 27 or later. Upload eligibility depends on version state. Approved assets can be published on an already live version through the website.
- [Apple Asset Library API concepts](https://developer.apple.com/documentation/appstoreconnectapi/understanding-the-app-asset-library) separates reusable media, placements, ordering, and reference data. Specification IDs come from processing. Group identifiers and limits come from reference data.
- [Discovering asset specifications](https://developer.apple.com/documentation/appstoreconnectapi/discovering-asset-specifications) is the public reference-data workflow.
- [Placing assets](https://developer.apple.com/documentation/appstoreconnectapi/placing-assets-on-your-app-store-surfaces) documents localization-scoped placements and per-group limits.
- [Apple asset design resources](https://developer.apple.com/app-store/asset-best-practices/) supplies downloadable universal and dedicated templates with safe-area guidance. Use these templates for crop review. Do not invent universal safe-area percentages.
- [Apple's October 5, 2026 announcement](https://developer.apple.com/news/?id=ljpl7kyn) confirms the new placements and preview tool.
- [ASC CLI Asset Library guide](https://github.com/rorkai/App-Store-Connect-CLI/blob/main/guides/asset-library.mdx) documents CLI mechanics and provider verification limits. Prefer the installed `asc-metadata-sync/references/asset-library.md` for recipes, then reconcile current help.

If sources disagree, record the exact conflict and date. Reconcile through current official specifications and read-only reference data. Do not mutate an app to test a guessed requirement.
