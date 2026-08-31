# Required-check outcomes

Inventory required checks before running them. Use repository instructions, affected-target configuration, and required CI or branch-protection rules. Do not make an optional check required merely because it ran or failed. If the available evidence cannot establish whether a check is required, report `BLOCKED_UNRESOLVED`.

Classify every candidate final check on the exact final content tree. Record the check name, outcome, command or observation, evidence, and reason. For a blocked check, also record the blocker kind and the next action.

Use one outcome:

- `PASS`. The check ran against the exact final content tree and succeeded. A content change invalidates the result.
- `NOT_APPLICABLE`. The check does not apply to the changed scope. Record the concrete reason. Do not use this outcome for a missing tool, an unrun required check, or a failed check.
- `BLOCKED`. The check did not establish success. Record one blocker kind from the list below.

Use one blocker kind for `BLOCKED`:

- `IN_SCOPE`. The changed code caused the failure.
- `OUT_OF_SCOPE`. Current evidence proves that the failure is pre-existing or unrelated to the changed scope.
- `ENVIRONMENT`. The required tool, service, device, credential, or runtime is unavailable or broken.
- `FLAKY`. Repeated observations disagree without a content change, and the repository recognizes the check as flaky or the evidence proves nondeterminism.
- `MISSING_EVIDENCE`. A required check or artifact is absent, incomplete, stale, or bound to a different content tree.
- `UNRESOLVED`. The available evidence does not establish another blocker kind.

Use the most specific proven blocker kind. `MISSING_EVIDENCE` applies only when no known environment failure or other more specific cause explains why the evidence is unavailable.

## Recover from a blocked check

Handle `BLOCKED` by blocker kind:

- `IN_SCOPE`. If repairs are authorized, fix the validated cause. Run focused checks, obtain an independent review of the repaired content tree, then rerun every applicable final check. If repairs are not authorized, stop.
- `OUT_OF_SCOPE`. Prove the classification with a baseline, an unchanged comparison, or equivalent direct evidence. Stop without changing unrelated code.
- `ENVIRONMENT`. Attempt only a bounded recovery that stays within the user's authority. Stop if the dependency remains unavailable.
- `FLAKY`. Follow the repository's documented retry policy. Without one, use at most one controlled retry to diagnose the check. Classify the check as `PASS` only when the policy's acceptance criteria are satisfied on the exact content tree and the report records every attempt. Otherwise stop with `BLOCKED_FLAKY`.
- `MISSING_EVIDENCE`. Obtain fresh evidence for the exact content tree. Stop if the required evidence cannot be produced.
- `UNRESOLVED`. Stop. Do not guess that the failure is unrelated.

Any repair or content change invalidates prior review and verification evidence for the old content tree. Do not skip, weaken, delete, or repeatedly retry a check to create a passing result.

## Compute the final verification state

Verification succeeds only when every applicable required check is `PASS`. `NOT_APPLICABLE` checks do not block success. Any `BLOCKED` check makes the final verification state `BLOCKED_<KIND>`.

Keep review and verification verdicts separate. A clean independent review may be reported as `REVIEW_CLEAN`, but do not report the task as clean, ready, fully verified, or successful while verification is blocked. If `BLOCKED_IN_SCOPE` proves an actionable defect in the reviewed scope, reopen the review verdict. Do not report `REVIEW_CLEAN` until an independent review covers the repaired content tree.
