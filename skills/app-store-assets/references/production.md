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

Decide the audience of each placement before its message. Product page header and search creative reach every visitor, most of whom have not chosen the app, so they sell the app's core promise. A feature that only some visitors can use, such as support for one device family, a new platform, or a niche workflow, belongs where those users already look: that device's screenshot set, the release notes, or a clause in promotional text. Do not lead header or search creative with it, even when it is the release's headline, unless most visitors can use it. A release's newest feature is often not the store's best pitch.

Before app-specific production, show a small set of materially different directions when the direction is open. A direct UI-led story, an editorial brand story, and a restrained universal creative can be useful alternatives. Recommend one based on the app's strongest proven benefit. Ask about product claims, asset scope, locales, and visual direction only when existing artifacts cannot settle them.

Keep optional previews, headers, and search creative undecided until selected. Their absence is not a pipeline failure. Search creative changes what users first see. Do not replace an existing screenshot-led search story automatically.

When header or search creative is selected, propose video first and a still image second. Both placements accept video, and motion carries a feature that changes state, such as a posture, a status, or a layout, far better than a still. Produce the still as the fallback and poster, not as the default. Choose still-only when the user asks for it, when no rendering workflow exists and adding one is not approved, or when the story has no motion to show. Say which applies.

A creative video is a brand piece, not a screen recording. Concept it before capturing:

- Dramatize one idea the product actually does: a device unfolding, a status cycling, content lifting out of the screen. A plain recording of someone using the app reads as an app preview and belongs in that placement instead.
- Build it from authentic captures composited in official device art. Animated transitions between real captures, such as a fold, are acceptable when they are not presented as filmed hardware. Never invent UI.
- Design for silent, looping, centered viewing: no reliance on audio or long text, the focal point inside the template's safe area, and a final frame that matches the first.
- Hold each state long enough to read, and keep motion eased and slow enough to follow.

Use official device art when it exists. Apple publishes product bezels, including foldable postures, on [Apple Design Resources](https://developer.apple.com/design/resources/). Its license forbids redistributing them on their own, so keep bezel files in an ignored local path, commit only the composed outputs, and record where to fetch them. Downloading needs approval, and the disk image's license must be accepted by the user. Check Apple's [marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines/) before using a bezel. Draw a neutral frame only when no official art exists, and say so.

Prefer native, repository-visible template sources. Reuse approved design tokens and existing composition tools before adding tools. Use Apple's current template links from capabilities.md for header/search safe areas. Record the template URL, retrieval date, editable source revision, and licensed dependencies. Do not embed Apple template files into this skill without redistribution authority.

A reusable template defines output variants, text slots, font rules, colors, screenshots/video insertion, safe-area guides, localized line fitting, and export settings. Keep app branding outside the reusable skill. Keep generated layers, licensed device art, and copies of fonts the app already ships out of git; the generator recreates them. Outputs that do not need a licensed input must still build without it, so missing device art disables only the assets that use it. Derive per-display layouts from one template when possible. Do not stretch a phone UI into an iPad or Duo UI.

## Capture authentic UI

1. Resolve the exact source revision, build, bundle ID, intended app experience, and capture device/runtime. Record whether the build is a prototype, simulator, or shipping-equivalent build.
2. Inspect existing capture fixtures and flows. Use sanitized deterministic data and real supported features. Do not use personal accounts or private content in marketing exports.
3. Reuse `asc-shots-pipeline` for plan-driven screenshot capture. Resolve the scheme and any generator through `ios-release` discovery or canonical project files. Keep pipeline upload disabled.
4. Use an explicit simulator UDID for each independent capture. Keep UDIDs in local bindings. Shared simulator state requires serialized work. Do not change or erase a user's device to obtain clean captures.
5. Confirm the app's rendered language, region, layout direction, orientation, and loaded content. A launch flag or successful screenshot command does not prove the selected language rendered.
6. Capture all chosen phone/tablet/Duo variants whose UI differs. Review Duo inner and outer layouts rather than cropping a conventional iPhone capture. Inspect both supported orientations when selected.
7. Treat every frame of one story as a set. Keep the same fixture data across them, change only the state the story is about, and inspect each frame for leftovers: tutorial overlays, discovery hints, toasts, badges, keyboards, and stale status. Fixture state such as dismissed tutorials can differ per locale, so verify each locale separately. Layouts can move an item between locales, so record tap targets and animated anchors per locale rather than reusing one locale's coordinates.
8. Retain raw media and provenance. Record the navigation flow, runtime, fixture revision, device target, capture time, locale, source commit/build, and raw-file hash.

The setup request alone does not authorize builds or app installation. If the target app is absent, finish the plan and request the specific missing build/install authority. If capture tools or hardware are unavailable, accept supplied authentic captures with declared provenance. Label provenance that cannot be verified. Do not claim automated capture from supplied files.

For video, inspect current `simctl io` help or use authorized device recording. Record the real UI flow before editing. Remove accidental taps, load failures, personal notifications, and capture artifacts. Retain originals. App previews must show the actual app experience. Generated illustrations can support header/search creative where permitted, but cannot substitute for captured product functionality.

## Compose screenshots and videos

Reuse `asc screenshots frame` when installed tooling supports the chosen layout. The current leaf pins Koubou. Do not follow its installation recipe automatically. If a tool or device frame is unavailable, use an existing renderer, unframed authentic captures, or a reviewed editable handoff. Report which production stage remains manual.

Choose crop, letterbox, or recapture deliberately. Preserve the UI aspect ratio and readable UI. Localized headlines must fit naturally, including longer translations and right-to-left text. A screenshot's text and an app's UI must use the selected locale or an explicitly approved fallback. Keep screenshot order intentional within each locale/device set.

Use a selected existing video editor or rendering workflow, such as a repository Remotion project. Adding a video stack needs approval, but a selected creative video is reason enough to propose one. Save the editable timeline, deterministic export settings, source footage, audio/font licenses, and poster timecode. Validate app previews and creative videos against their separate specifications. When two fields of Apple's live reference data disagree, such as a spec's duration field and its encoded short name, produce a file that satisfies both and record the conflict. Render the still fallback and poster from the same composition as the video, so the two never drift. Preview the beginning, ending, loop seam, and silent playback. Check poster frames as still images.

Gate creative video quality before final export:

1. Render stills at every stage boundary and a contact sheet of the whole timeline, and review them before the full render.
2. Look for 3D and compositing artifacts: panels that vanish edge-on (offset the camera from the pivot), layers that leave the frame at peak perspective, and sub-pixel seams where split layers meet (show one uncut layer while static).
3. Measure the loop: compare the first and last frames, for example with ffmpeg SSIM, and expect a near-identical result.
4. Confirm the exported file against the placement's live specification, not only the editor's settings.
5. Ask the user to watch full-speed playback. Stills cannot prove motion quality, so get explicit approval of the motion before finalizing the still fallback or uploading. Never use the downloaded HLS playlist as the uploadable source original.

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
