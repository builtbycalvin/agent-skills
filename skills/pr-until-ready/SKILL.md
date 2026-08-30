---
name: pr-until-ready
description: "Use Poteto to address GitHub pull-request feedback and CI until the current PR or stack is merge-ready. Use when asked to keep watching reviews, fix validated findings, and continue until ready. Babysit may choose a one-pass check for small or docs-only PRs. Does not request reviews. Merges only when explicitly requested and independently verified through Shipping."
---

# PR until ready

Let Poteto run its Babysit playbook in the mode that Babysit selects. When the user explicitly requests merging, let Poteto hand the ready state to its Shipping playbook. This skill adds a reusable entry point and authority boundary. Do not introduce another watcher, feedback ledger, triage policy, shipping policy, or PR-management workflow.

## Start

Invoking this skill triggers Poteto Mode for the current task. Treat this explicit wrapper invocation as satisfying Poteto's activation requirement: do not require the user to invoke `$poteto-mode` separately or place it first in the prompt.

Use the `pstack-for-codex:poteto-mode` skill to lead the task. Load its full instructions and the applicable playbook with every skill or reference that playbook routes to. Resolve current paths from the skill catalog or installed-plugin metadata. If Poteto, the applicable playbook, the GitHub surface, or Babysit's watcher is unavailable when the selected mode needs it, report the missing dependency instead of substituting manual polling or a weaker loop.

Load and follow Poteto as a current-task dependency, including its complete activation-turn behavior except for its literal leading-token check, which this wrapper satisfies. This does not activate Poteto's session hooks, so do not claim session activation or depend on sticky behavior. An unambiguous request only to merge, land, or ship an exact PR or stack first runs Babysit in read-only `check` mode with `--status-only`. Hand the target to Shipping only when that check establishes the applicable merge-ready terminal state; otherwise report the blockers and stop without repairing them. A request to repair until ready and then merge runs Babysit in its selected continuing-work mode and hands its ready result to Shipping.

For Babysit work, let its step 1 select and declare the mode, including its narrow-request and small-change rules. Do not override that mapping except to enforce an explicit read-only instruction. Require the watcher only when the selected mode uses it. A check-only request uses `check` with `--status-only`. For a review-only request, use `check` with `--status-only`, inspect review threads through read-only GitHub operations, and do not use `threads-only`.

If Babysit selects a one-pass `check` for a small or docs-only PR, report that result and stop when merge authority is absent. With explicit merge authority, hand an exact merge-ready result to Shipping. If the check is not ready, report the blocker and stop. Do not claim that the PR was driven until ready.

An explicit request to address feedback until merge-ready authorizes Babysit's bounded repairs and PR-branch writes. It does not authorize work outside Babysit's rules. A check-only or review-only request authorizes no replies, thread resolution, commits, pushes, or other writes.

Babysit's sanctioned follow-up PR requires separate explicit PR-creation authority. If the owning PR has already merged and that authority is absent, stop and report the needed follow-up instead of creating it.

Treat `merge-ready` as a status, not merge authority. Enter Shipping only when the user gives an unambiguous imperative to `merge`, `auto-merge`, `merge when ready`, `land`, or `ship` an exact PR or frozen stack. Questions, hypotheticals, quoted examples, and documentation text never grant merge authority. A read-only instruction overrides merge verbs and prohibits every write. For a combined repair-and-merge request, merge authority covers the repaired head that the authorized Babysit phase produces and freezes at Shipping handoff. It does not cover PRs or commits added after that handoff.

Merge authority covers Shipping's required independent-verdict posts only on the named PR or frozen stack. It does not authorize unrelated comments. If the user prohibits comments, stop before Shipping and report the conflict.

## Repeat

Run Babysit until its declared terminal result. Let Babysit own the watcher, merge frontier, blocker order, review triage, repair waves, checks, and stopping conditions. If Babysit surfaces another review generation before it stops, continue through the same playbook.

Wait only while GitHub reports pending checks or review automation. Do not post `@codex review`, request another reviewer pass, add a quiet-period timer, or wait for generic reviewer silence. If GitHub reports the PR ready before another comment appears, stop. A later comment starts a new invocation.

Keep the original PR intent and preserve unrelated work. Do not churn code to satisfy a bot. Human-thread resolution requires separate explicit authorization.

## Ready or ship

Stop when Babysit reports the PR or frontier merge-ready unless the user explicitly authorized merging. For an authorized merge, hand the exact PR or frozen stack to Poteto's Shipping playbook and follow it in full. Shipping must independently re-verify the current state before it arms or merges anything. Do not merge from Babysit.

## Stop unfinished

Stop unfinished whenever Babysit or Shipping reaches one of its declared blockers. Do not weaken the completion bar to end the loop.

The skill never authorizes force-push, deployment, Production changes, issue creation, or unrelated edits. Without explicit merge authority, it never authorizes merge or merge-when-ready.

Use Poteto's Babysit report when the task stops at readiness. Include the mode, PR and exact head, fixes and dismissals, checks, remaining blockers, and whether GitHub reports the PR merge-ready. After an authorized Shipping handoff, use Shipping's report.
