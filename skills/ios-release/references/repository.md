# Repository reconciliation

Read this reference for a release lane that can change tracked files.

## Start from one source commit

Resolve the current branch and its configured upstream. Fetch that upstream without tags.

A fresh release that changes tracked state requires all of these facts:

- `HEAD` is attached to the repository's release branch.
- The worktree and index are clean.
- The branch has one configured upstream.
- Local `HEAD`, the local upstream ref, and the fetched remote ref have the same commit.

Record that commit as `sourceCommit`. Record the repository, remote, and upstream branch as the PR destination. Stop before version changes or remote effects when the branch is ahead, behind, or diverged.

Complete this gate before writing a tracked release-note archive. Draft and approve the note without changing tracked files, then write it after `sourceCommit` is recorded.

Do not pull, merge, rebase, switch branches, or discard changes to satisfy this gate. If the lane will publish a release commit, create a dedicated release branch at `sourceCommit` before changing tracked release files. Keep the original branch and its upstream intact.

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

## Merge through a PR after remote readback

After App Store Connect exposes the exact successful state for the requested lane, fetch the PR destination again. If the destination advanced, keep the archived release commit and report `partial` with the exact remote release state. Do not rewrite or replace the release commit to make the PR mergeable.

If the destination still equals `sourceCommit`, publish only the release branch. Open or reuse one PR from the release branch to the recorded destination. Never commit on or push directly to the destination branch.

Run `finish-pr` with the existing release authority and the exact head and base. Require independent review, passing required checks, required approvals, and no unresolved blockers. Keep the archived release tree fixed. If review requires changes to that tree, stop and report `partial` rather than changing the release PR or uploading again.

Before merge, confirm the PR still targets the recorded destination at `sourceCommit` and its head is `releaseCommit`. Use the repository's required merge method with a server-enforced head condition. Use a merge queue or auto-merge only if repository rules enforce the verified head and base at landing. Read back the merged PR and fetch the destination. Confirm its history contains the PR's merge commit and that the merge commit's tree matches the archived release tree. The final base read cannot prevent a concurrent base update. If the merge tree differs, report `partial` with both trees.

If a Git or PR operation fails or times out, read back the exact remote ref or PR before retrying. Return `partial` if the release succeeded but the PR cannot merge or the merge cannot be verified. Include the release commit, PR, observed destination, and the exact missing gate. Do not bypass a protection or force-push.

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
