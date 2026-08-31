---
name: local-review-until-clean
description: "Use Poteto to review and fix local code changes repeatedly until no validated actionable findings remain and checks pass. Use when asked to keep reviewing and fixing the current local snapshot until clean, including on a branch that already has a PR. Do not use to manage GitHub PR feedback, CI, or merge-ready state. Review-only requests remain review-only."
---

# Local review until clean

Let Poteto drive the work through its own playbooks, using Interrogate for review. This skill adds only the outer repetition and stopping conditions. Do not introduce a separate review framework, ledger schema, reviewer roster, or PR-management workflow.

Use this skill whenever the requested review surface is the local snapshot, even if its branch already has a PR. Route requests about the published PR head, GitHub feedback, CI, or merge-ready state to `pr-until-ready`.

## Start

Invoking this skill triggers Poteto Mode for the current task. Treat this explicit wrapper invocation as satisfying Poteto's activation requirement: do not require the user to invoke `$poteto-mode` separately or place it first in the prompt.

Use the `pstack-for-codex:poteto-mode` skill to lead this task and the `pstack-for-codex:interrogate` skill for review. Load their full instructions and follow their referenced playbooks and applicable skills. Resolve their current paths from the skill catalog or installed-plugin metadata, not a hardcoded cache version. If a dependency is missing, report it rather than silently substituting another workflow.

Load and follow Poteto as a current-task dependency, including its complete activation-turn behavior except for its literal leading-token check, which this wrapper satisfies. This does not activate Poteto's session hooks, so do not claim session activation or depend on sticky behavior. Let Poteto select the matching playbook, load its applicable skills, delegate, and verify. Use its delegate instructions so subagents explicitly read the skills their roles require. The user should not need to invoke Poteto, Interrogate, each component, or approve routine transitions between passes.

## Repeat

For every Interrogate pass, include the committed branch diff against its base, the staged index, the unstaged working tree, and all in-scope untracked files. Resolve the base before review. The final independent review must cover that same complete snapshot.

1. Have Poteto run Interrogate on the requested changes.
2. Let Poteto apply Interrogate's lead judgment, validate findings, and distinguish actionable issues from suggestions, duplicates, and false positives.
3. If actionable findings remain, have Poteto fix them through the appropriate playbook and run focused checks relevant to each repair.
4. Have Poteto obtain an independent re-review of the resulting changes. Repeat while validated actionable findings remain.

Interrogate itself stays review-only. Poteto owns fixes and the decision to continue. Keep the original scope and preserve unrelated work. Do not reopen dismissed findings without new evidence or chase stylistic preferences to manufacture another pass.

## Apple verification

Classify the actual in-scope changed surface before selecting final checks. Do not run Apple tests merely because the repository contains Swift files. When the repository has an Apple target or the changed paths may be Apple build inputs, read and follow [the shared Apple local verification contract](references/apple-local-verification.md). It defines the build-affecting surface, command selection, content-tree identity, receipt, isolation, reuse, and failure rules.

After the complete final snapshot has no unresolved actionable findings, stabilize it and run every applicable final check. An Xcode iOS app requires its applicable `xcodebuild` and XCTest checks. Use `swift test` only for a genuinely affected Swift Package with `Package.swift`. Repository-documented verification commands take precedence when they cover the affected target.

This workflow owns changed-surface classification, target selection, and the ordered required-check names and commands. Map review-only mode to `check-only`; map repair-authorized mode to `repair-authorized`; then call `route_verification(authority, receipt_state)`. Do not pass changed roles, target kinds, or workflow mode to the helper.

A bounded read-only verification subagent may run these final checks after the snapshot is stable. It must not edit code and must report the contract's exact commands, results, artifacts, toolchain identity, times, and `tree_before` and `tree_after` for every check. Use isolated build and test state where practical. If delegation is unavailable, the lead runs equivalent verification.

## Verification outcomes

Classify every candidate final check under [the shared required-check outcome contract](references/verification-outcomes.md). Follow its recovery rule for each blocked check. Do not collapse a clean review and blocked verification into one successful verdict.

## Stop

Finish when an independent review of the complete final in-scope changes has no unresolved actionable findings and every applicable required check is `PASS` on that exact content tree. Reuse a completed review or valid verification receipt only when it covers the unchanged final tree. A later commit with the same tree does not invalidate content-bound evidence. Any content change does. Reviewer silence alone is insufficient. A `BLOCKED` check or missing required verification is not success.

Three passes are an automatic progress checkpoint, not a minimum or hard cap. Continue beyond three while making verified progress. Stop and report unfinished work after two consecutive passes without verified progress, repeated reversals, a genuine blocker, or a user-specified budget limit. Do not silently expand scope or lower the completion bar to make the loop end.

Follow the user's actual authority. Questions and review-only requests do not authorize repairs. This loop does not authorize commits, pushes, PR actions, merges, deployment, Production changes, or scheduled automation without a separate explicit request.

Use Poteto's normal report. Include how many passes ran, what was fixed, the final content tree, each check's outcome and evidence, the verification receipt or non-Apple classification, and any remaining finding or `BLOCKED_<KIND>` state.
