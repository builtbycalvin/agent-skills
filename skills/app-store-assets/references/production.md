# Produce and review assets

## Check current Apple guidance before generation

Use official links as maintained references. Record the source date and applicable rules in the run. Recheck them before production and remote execution. A stored summary cannot guarantee App Review acceptance.

| Reference | What it governs |
| --- | --- |
| [App Review Guidelines, accurate metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata) | Content requirements, especially sections 2.3.2 through 2.3.4, 2.3.8 through 2.3.10, and 2.3.14 |
| [Asset best practices and resources](https://developer.apple.com/app-store/asset-best-practices/) | Composition, messaging, safe areas, localization, poster frames, and downloadable templates |
| [Current technical specifications](capabilities.md#current-apple-requirements-to-verify) | Separate screenshot, app preview, and creative image/video requirements |

Apply these content checks before approving a bundle:

- Screenshots depict the app in use. App previews use screen captures of the app, with explanatory overlays or narration where appropriate.
- Header/search creative relates to the app's content, functionality, or brand. It does not invent capabilities or make unverifiable claims.
- Featured paid content clearly indicates an additional purchase when required. Creative assets exclude specific or discounted pricing.
- Metadata is suitable for all audiences. Use fictional account information and secure rights to images, fonts, music, and other materials.
- Avoid misleading references to other apps and disallowed imagery of other platforms or marketplaces.

Generated artwork still needs content, rights, and accuracy checks. It cannot replace authentic screenshot or app-preview capture. Retain evidence for factual claims and rights in the bundle's provenance.

Keep requirements distinct from recommendations. Centered focal points, concise headlines, readable type, silent-first video, and coherent visual style are design guidance. Use Apple's actual template safe areas rather than invented margins. Follow the selected file's technical specification independently of visual approval.

## Set the creative brief

Before app-specific production, show a small set of materially different directions when the direction is open. A direct UI-led story, an editorial brand story, and a restrained universal creative can be useful alternatives. Recommend one based on the app's strongest proven benefit. Ask about product claims, asset scope, locales, and visual direction only when existing artifacts cannot settle them.

Keep optional previews, headers, and search creative undecided until selected. Their absence is not a pipeline failure. Search creative changes what users first see. Do not replace an existing screenshot-led search story automatically.

Prefer native, repository-visible template sources. Reuse approved design tokens and existing composition tools before adding tools. Use Apple's current template links from capabilities.md for header/search safe areas. Record the template URL, retrieval date, editable source revision, and licensed dependencies. Do not embed Apple template files into this skill without redistribution authority.

A reusable template defines output variants, text slots, font rules, colors, screenshots/video insertion, safe-area guides, localized line fitting, and export settings. Keep app branding outside the reusable skill. Derive per-display layouts from one template when possible. Do not stretch a phone UI into an iPad or Duo UI.

## Capture authentic UI

1. Resolve the exact source revision, build, bundle ID, intended app experience, and capture device/runtime. Record whether the build is a prototype, simulator, or shipping-equivalent build.
2. Inspect existing capture fixtures and flows. Use sanitized deterministic data and real supported features. Do not use personal accounts or private content in marketing exports.
3. Reuse `asc-shots-pipeline` for plan-driven screenshot capture. Resolve the scheme and any generator through `ios-release` discovery or canonical project files. Keep pipeline upload disabled.
4. Use an explicit simulator UDID for each independent capture. Keep UDIDs in local bindings. Shared simulator state requires serialized work. Do not change or erase a user's device to obtain clean captures.
5. Confirm the app's rendered language, region, layout direction, orientation, and loaded content. A launch flag or successful screenshot command does not prove the selected language rendered.
6. Capture all chosen phone/tablet/Duo variants whose UI differs. Review Duo inner and outer layouts rather than cropping a conventional iPhone capture. Inspect both supported orientations when selected.
7. Retain raw media and provenance. Record the navigation flow, runtime, fixture revision, device target, capture time, locale, source commit/build, and raw-file hash.

The setup request alone does not authorize builds or app installation. If the target app is absent, finish the plan and request the specific missing build/install authority. If capture tools or hardware are unavailable, accept supplied authentic captures with declared provenance. Label provenance that cannot be verified. Do not claim automated capture from supplied files.

For video, inspect current `simctl io` help or use authorized device recording. Record the real UI flow before editing. Remove accidental taps, load failures, personal notifications, and capture artifacts. Retain originals. App previews must show the actual app experience. Generated illustrations can support header/search creative where permitted, but cannot substitute for captured product functionality.

## Compose screenshots and videos

Reuse `asc screenshots frame` when installed tooling supports the chosen layout. The current leaf pins Koubou. Do not follow its installation recipe automatically. If a tool or device frame is unavailable, use an existing renderer, unframed authentic captures, or a reviewed editable handoff. Report which production stage remains manual.

Choose crop, letterbox, or recapture deliberately. Preserve the UI aspect ratio and readable UI. Localized headlines must fit naturally, including longer translations and right-to-left text. A screenshot's text and an app's UI must use the selected locale or an explicitly approved fallback. Keep screenshot order intentional within each locale/device set.

Use a selected existing video editor or rendering workflow. Do not add a video stack merely because preview support exists. Save the editable timeline, deterministic export settings, source footage, audio/font licenses, and poster timecode. Validate app previews and creative videos against their separate specifications. Preview the beginning, ending, loop seam, and silent playback. Check poster frames as still images. Never use the downloaded HLS playlist as the uploadable source original.

## Validate the actual exported files

Use current Apple specifications and discovered CLI data, not copied constants. Preserve originals during fixes.

| File or concern | Evidence |
| --- | --- |
| Screenshot dimensions and file acceptance | `asc screenshots validate` for the selected current display type, plus `sips` width/height/alpha/color inspection through `asc-screenshot-resize` |
| Creative image compatibility | `sips` file type, dimensions, alpha/color metadata and current Asset Library spec/category/placement rules. Do not run the screenshot validator as creative-image proof. |
| All video files | Existing `ffprobe` JSON or the editor's media report for container, video codec/profile, dimensions, duration, fps, scan mode, audio tracks/codec/channels/sample rate, and byte size |
| Video playback | Play the exported file, inspect poster timecode, audio and silent comprehension, loop seam for creative, text legibility, and real UI continuity |
| Coverage | Matrix of app device support, display groups, orientations, locales, required minimums, optional variants, and permitted scaling/fallback |
| Provenance and byte identity | Capture metadata, source/template revision, `bundle.mjs snapshot`, and successful verify before each remote stage |

If `ffprobe` or a suitable inspector is missing, report video technical validation as incomplete. A desktop player alone does not prove codec or upload compatibility. Do not install it silently. Distinguish an sRGB export recommendation from a claimed Apple-wide hard requirement. Strip alpha into a new export with a deliberate background and review the result.

## Preview and approve

Use the existing screenshot review HTML through `asc-shots-pipeline`. For videos and creative images, produce a local review page or use an existing design review document. Show each output at realistic phone/tablet size, with its locale, group, order, measured properties, and raw-versus-composed comparison. Include playable exported video and its poster. Clearly label local placement simulations as approximate.

Inspect the page in a browser or the actual review tool. Review real output for clipping, line wrapping, font substitution, UI authenticity, consistency, contrast, and readability at search-result size. Inspect relevant light/dark presentation and selected device orientations. Use the Apple template safe areas and App Store Connect Preview when available. A browser unable to decode the video is a blocker, not a visual pass.

Present the exact ordered bundle and recommendations for approval. Bind approval evidence to the snapshot hash and the reviewed variant list. Local approval is not ASC submission authority. Any change to the manifest or its inputs invalidates the frozen review identity. Recheck affected validation and review before proceeding.

At handoff, list incomplete coverage explicitly. A screenshot CLI pass cannot establish video validity, correct crop, complete localization, or publication.
