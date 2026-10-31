---
name: app-store-listing
description: "Diagnose and improve an App Store product page from App Store Connect analytics: find the weak funnel stage (impressions, product page views, downloads) by source and territory, propose evidence-backed changes to name, subtitle, keywords, description, promotional text, and creative, and measure the result. Also runs an app-agnostic weekly monitor for scheduled tasks. Use for ASO, listing optimization, conversion or impression questions, and listing monitoring. Not for routine release copy (ios-release) or producing media (app-store-assets)."
---

# App Store listing

Decide what on the product page to change, why, and whether it worked. Every proposal names the funnel stage it targets, the evidence, and the metric it should move.

```text
analytics -> snapshot -> compare -> weak stage -> fields -> proposal -> approval
                                                                 |
                    measure (+14d, +28d) <- shipped by the owner <-+
```

## Ownership

| Work | Owner |
| --- | --- |
| Funnel diagnosis, listing proposals, measurement, monitoring | this skill |
| What's New and promotional text for a release; version staging and submission | `ios-release` |
| Screenshots, previews, header and search creative production | `app-store-assets` |
| Keyword research and competitor gaps | `asc-aso-audit` |
| Validating and writing listing fields | `asc-metadata-sync` |

Hand a proposal to its owner instead of performing the write here. Load an owner only when the proposal needs it.

## Authority

| Request | Allowed effect |
| --- | --- |
| Monitor, diagnose, inspect, propose | Read analytics and listing; write local snapshots and reports. |
| Set up analytics | Create one ONGOING analytics report request, only when the user asks for it. |
| Apply an approved proposal | Route to the owner above, which applies its own write and readback rules. |

Analytics requests, listing writes, and creative uploads are separate effects. A monitor never writes to App Store Connect, never opens an issue in a tracker the user did not name, and never applies a proposal.

## Set up an app

1. Resolve the App Store app ID and the local `asc` profile. Reuse `.ios-release` identity when the repository has it.
2. Find the app's ONGOING request with `asc --profile <profile> analytics requests --app <appId> --access-type ONGOING`. If none exists, tell the user the next step is creating one, and create it only on their request: `asc --profile <profile> analytics request --app <appId> --access-type ONGOING --reuse-existing`. Apple backfills from January 1, 2024 on request and needs a day or two before the first reports appear.
3. Run `node scripts/listing.mjs monitor --app-id <appId> --profile <profile> --request-id <requestId>` once by hand and read the report before scheduling it.

## Diagnose

1. `fetch` the App Store Discovery and Engagement Standard and App Downloads Standard reports with `--granularity DAILY`, so any whole-day window works. Each daily instance repeats the previous few days; `snapshot` counts each date once, from the last file given, so pass files oldest-processed first. Weekly instances date every row by its week start.
2. Build a `snapshot` for the window in question and one for a comparable baseline. Use whole weeks, and match seasonality when the user knows it matters.
3. `compare` them. Findings already pass a minimum volume and a significance test, and carry the fields from the script's funnel table. The impressions test assumes Poisson noise, and real traffic swings more than that, so treat an impressions finding near the threshold as weak. Read `skipped` too: a small app can be too small to conclude anything for a segment, and saying so is a valid result.
4. Find the weakest stage in absolute terms as well as in change. Low impressions points at discoverability; a low view rate at what shows in search and browse; a low download rate at the product page itself.
5. Explain each number before acting on it. A release, a featuring, a seasonal swing, a pricing change, or a reporting lag can move a metric without any listing change.

## Propose

For each proposal, give the stage, the evidence (snapshot window, values, significance), the field, the current text or asset, the proposed change, and the metric expected to move. Check every field against Apple's current guidance and limits before proposing it ([Creating your product page](https://developer.apple.com/app-store/product-page/); read it at use time). Write for every visitor the stage reaches, not for one device or one feature's users. Use `asc-aso-audit` for keyword evidence; never place keywords in fields Apple does not index.

Change one stage at a time when the user wants to attribute the result. Offer Apple's product page optimization test when traffic supports it and attribution matters.

## Measure

Record each shipped change with its date and fields in `<state-dir>/changes.jsonl`. Compare the 14 and 28 days after it with the same span before. Report the result plainly, including no detectable change.

## Monitor

`node scripts/listing.mjs monitor` compares the last complete week with the average of the previous weeks for one app. It exits 0 when quiet, 3 when it has findings, and 1 on error, so a scheduled task can stay silent unless something changed. State lives in `~/.local/state/app-store-listing/<appId>` unless `--state-dir` says otherwise.

Schedule one task per app, weekly after Apple's Friday weekly reports, running the same command with that app's ID, profile, and request ID. Run it where the `asc` profile already works, and set `ASC_TIMEOUT=120s` because report listings can be slow; do not copy App Store Connect keys into a cloud environment to make a schedule possible. Before setting alert thresholds, review a few weeks of reports to learn the app's normal week-to-week swing.
