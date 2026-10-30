# Execute an approved asset plan

## Plan the remote difference

Read current app and version identity, version state, localization IDs, asset sets, Asset Library media, and placements under the resolved profile. Use pagination. Inspect exactly one intended version rather than an unqualified newest result. Set the platform explicitly when resolving by marketing version. Confirm local bundle app identity agrees with portable config and live data.

For version-scoped screenshot/preview changes, verify Apple's current editable states. `WAITING_FOR_REVIEW` is not in the currently documented upload-eligible list. Do not cancel that review or redirect the request to another version. Offer local preparation, or separately authorized library-only staging when compatible. Library upload and a version placement have different eligibility and authority.

Build a difference table before a write:

| Target | Before | Proposed action | After | Authority |
| --- | --- | --- | --- | --- |
| App/version/locale/group/type/order | Exact resource IDs, checksums, states and order | Reuse, upload, append, reorder, replace, assign, review, publish, or preserve | Exact desired files and IDs where known | Current request and approved bundle reference |

Show counts against both existing and proposed assets. Treat bytes, placement, and order as separate differences. Do not duplicate media merely because it has a different filename. `--skip-existing` uses remote checksum semantics, not a visual similarity test. A byte-identical upload does not prove the intended placement or ordering.

If a proposed set or placement group exceeds its current limit, stop that stage. Do not truncate the approved bundle, choose a subset, replace existing assets, or partially execute an indivisible requested batch without resolving the scope.

Keep `sha256` for the local approval identity. Use the API's required source checksum algorithm for remote comparisons, often MD5 for legacy media. Never compare MD5 directly with SHA-256. Where remote checksum is absent, retain exact upload receipt-to-ID mapping and report the weaker identity evidence.

Recheck the remote snapshot immediately before mutation. If state, order, or membership changed, refresh the diff and resolve conflicting user-visible changes before applying. Avoid one command that implicitly touches unapproved locales or sets.

## Choose the narrowest route

For legacy screenshots, reuse the leaf's reviewed `screenshots plan` and `apply` flow. Use the exact version ID when supported. Keep its generated manifest distinct from this skill's bundle manifest. Its append limits and approval file do not replace this skill's authority and hash checks. `--replace` deletes existing screenshots within each target set before upload, so it needs explicit replacement scope. Never use replacement to reorder files.

For preview video sets, use current `video-previews` commands through `asc-cli-usage`. Inspect upload, poster, and readback help. There is no assumed screenshot-style review/apply workflow for videos. A directory upload must contain only the approved exact files. Reconcile partial upload receipts before retrying.

For reusable images/videos and header/search placement, load `asc-metadata-sync/references/asset-library.md`. Reuse an existing compatible asset where proven. Upload to the resolved app's library using the selected category. Read processing state and matched spec before assignment. Read category/group compatibility from current reference data. Capture exactly one asset ID per completed upload. An upload to the library need not assign the asset.

For placement replacement, inspect all uses of shared media. Changing a poster or archiving media can affect multiple placements. Assignment does not grant those effects. `swap` is a provider extension in the inspected CLI. Do not treat a failed swap as permission to delete the previous placement. Stop with the observed state and supported alternatives.

Standalone asset review and version submission are different lanes. Reuse the intended draft, inspect all its items, and never submit unrelated pending items. Standalone asset review currently requires an approved app version in the CLI flow. The first version uses the explicit combined release lane. If review acceptance is uncertain, record the provider result and stop rather than creating another submission.

## Read back exact resources

These are inspected command examples, not frozen command recipes. Recheck help, profile, selectors, pagination, and output support before use.

```text
asc --profile <profile> localizations screenshot-sets list --localization-id <id> --include appScreenshots --paginate --output json
asc --profile <profile> screenshots list --set-id <id> --paginate --output json
asc --profile <profile> video-previews list --version-localization <id> --output json
asc --profile <profile> asset-library images view --id <id> --output json
asc --profile <profile> asset-library videos view --id <id> --output json
asc --profile <profile> localizations placements list --localization-id <id> --include image,video --paginate --output json
asc --profile <profile> review submissions-get --id <id> --include items --output json
```

Verify the parent app, version, localization, placement type/group, returned media IDs, expected membership/order, source checksum or upload-to-ID mapping, poster timecode, and delivery/processing states. Inspect every page and failed item. For shared media, verify intended uses and no unintended changed uses. Re-read the exact submission and its asset items after authorized review submission.

Save sanitized receipts immediately. A command exit, `ACTIVE` placement, or processed upload does not prove approval. Approval does not prove publication. Name only the stage the readback proves.

## Resume without duplicate effects

```text
planned -> write sent -> observed -> verified
               |
          remote-unknown -> exact readback -> reconcile -> next allowed effect
```

If a write times out, exits with partial data, or returns malformed output, retain every resource ID and mark its effect `remote-unknown`. Do not re-upload, replace, or resubmit while the result is unknown. Inspect the exact resource and current target membership. Follow an existing reservation only through supported leaf mechanics. If no ID survived, list within the exact app/library/set and compare checksum, size, reference name, and target. A matching name alone is insufficient.

Wait for processing with a bounded deadline and reasonable intervals. After the deadline, return `partial` with resource IDs and the next read-only reconciliation. Do not repeat unchanged polls indefinitely. Failed processing needs its provider error before another attempt. Reuse approved compatible media on reruns. Reordering must include the complete intended set and must preserve unapproved assets. No automatic cleanup, deletion, archive, rollback, or app-review cancellation follows a failure.

## Browser and manual fallback

Current Apple Help documents live creative updates by choosing approved media on the already live version, then selecting Publish. It also documents the Preview tool for placement appearance. The inspected CLI has no separate publication command. Do not call undocumented web endpoints or extract session credentials.

With explicit publication authority, use an available supported browser tool and the correct authenticated account. Verify app, live version, locale, media ID where visible, and the concrete publish effect before clicking. If login requires user interaction, pause that dependent stage while completing local work. Do not create a new API key or CLI web login merely to work around a browser limitation.

If browser control or authentication is unavailable, provide an exact manual packet. Include the approved files and hashes, target app/version/locale, intended placement, asset IDs, before/after diff, ordered steps, validation evidence, and required readback. Do not mark a manual action complete until evidence returns. After a claimed publish, re-read the target placement and inspect the authenticated page or device storefront as available. Record storefront/locale/device/OS and observation time. Report propagation or eligibility uncertainty instead of claiming universal live display.

Uploading a draft to obtain Apple's preview still requires upload authority. Selecting Save can create an assignment. Publish and Submit for Review are separate effects. If the current user requested only a local pipeline or design, stop at the prepared local bundle.
