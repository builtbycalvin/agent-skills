# Repository reconciliation

Read this reference for a release lane that can change tracked files.

## Start from one source commit

Resolve the release base from repository policy and verify its remote tip with a fetch. Record the repository, remote, base branch, and fetched commit as the PR destination and `sourceCommit`. If policy requires a clean synchronized local base checkout, verify it first.

For a new release from the base branch, use a dedicated release branch at `sourceCommit`. If the current checkout is detached, dirty, or on another branch, use a clean isolated worktree at `sourceCommit` when repository policy permits. Preserve the original checkout and index. If the user asked to release changes outside the verified base, resolve that source explicitly before proceeding.

Before writing a tracked release note, record `sourceCommit` and approve the copy. Keep release credentials and local configuration outside tracked state.

## Bind the archive to one release commit

Read the repository's release policy and canonical generator. Resolve the exact tracked paths that a version change or generator may modify.

After changing the version or build:

1. Run the canonical generator, including a configured `xcode.generator`.
2. Reject tracked changes outside the allowed release-state paths.
3. Stage the complete changed path set.
4. Run the repository's drift check.
5. Record the staged Git tree ID.
6. Archive and export that exact staged tree.
7. Commit the release state once on the release branch before upload.
8. Require a clean worktree.

Record the new `HEAD` as `releaseCommit`. Verify that its sole parent is `sourceCommit`, that its tree ID equals the archived tree ID, and that its changed paths are within the allowed set.

If generation, archive, or export fails, restore the exact changed paths to `sourceCommit`. Do not create `releaseCommit`.

A wrapper that commits only the manifest while leaving canonical generated output dirty is not release-safe.

When the lane reuses an existing build and changes no tracked state, use the synchronized `HEAD` as both `sourceCommit` and `releaseCommit`. Skip the release PR when there is no tracked change. Local-only lanes do not publish a release PR.

When resuming, recover the recorded `sourceCommit`, `releaseCommit`, release branch, and PR destination. If the commits differ, verify the release commit's parent, tree, and changed paths against the archive and allowlist. If the release has a committed note, preserve its original source commit and verify the committed note matches the archive. Read the exact remote build state and look up the existing release PR by head and destination. If it already merged, verify the merge and tree before checking for destination drift. Resume the unfinished step without repeating an observed upload or creating a duplicate PR.

## Verify the release PR before upload

For a tracked release, verify authenticated forge access, destination rules, merge method, and review capability before archiving. Read-only preflight cannot establish permission for a later write.

Once the release commit matches the archived tree, confirm the base still equals `sourceCommit`. Use `finish-pr` with the release authority, an explicit stop before merge, and review-only scope for the fixed archive commit. Push only the release branch and open or reuse one PR. Require independent review, passing checks, required approvals, and a mergeable verdict for that head and base. Keep the PR unarmed and verify the repository can hold it open until App Store Connect readback. If a write, check, approval, or hold is blocked, stop before upload. If review requires a change to the archived tree, stop this attempt before upload. Any replacement must pass archive and PR verification again. Recheck the verified head, base, and unarmed PR state before upload.

Include the authorized effects, exact head and destination in any tool approval request. If the host denies a required write, preserve the release state and report the denied action and reason. Use the host's supported approval flow for any outstanding permission.

## Finish the PR after remote readback

Once App Store Connect confirms the exact build and requested lane, continue `finish-pr` through merge. Reuse existing authorization and review evidence that still applies. If the base advances or a fix would change the archived tree, preserve the commit and report the remaining reconciliation.

Confirm the PR head is `releaseCommit` and the base still points at `sourceCommit` immediately before merge. Use the repository's merge method and a server-enforced head condition. Use auto-merge or a queue only if the rules enforce the verified head and base at landing. Read back the merged PR and verify the destination contains its merge commit. Verify the merge tree matches the archived tree. If a concurrent base update changes that tree, report `partial` with both trees.

After an uncertain write, read back the exact remote ref, PR, or build before retrying. Report both the App Store Connect and repository outcomes. If either side succeeded while the other is blocked, report `partial` and identify the unfinished step.

## Keep adjacent publishing separate

Repository reconciliation covers only deterministic tracked release state.

The release request does not authorize:

- a Git tag;
- a tag push;
- a GitHub Release;
- unrelated commits;
- an unrelated pull request or merge;
- a force-push.

Perform an adjacent effect only when the current request names it or the repository policy makes it an explicit part of the selected release lane.
