# Repository reconciliation

Read this reference for a release lane that can change tracked files.

## Start from one source commit

Resolve the current branch and its configured upstream. Fetch that upstream without tags.

A fresh release that changes tracked state requires all of these facts:

- `HEAD` is attached to the repository's release branch.
- The worktree and index are clean.
- The branch has one configured upstream.
- Local `HEAD`, the local upstream ref, and the fetched remote ref have the same commit.

Record that commit as `sourceCommit`. Stop before version changes or remote effects when the branch is ahead, behind, or diverged.

Complete this gate before writing a tracked release-note archive. Draft and approve the note without changing tracked files, then write it after `sourceCommit` is recorded.

Do not pull, merge, rebase, switch branches, or discard changes to satisfy this gate.

## Bind the archive to one release commit

Read the repository's release policy and canonical generator. Resolve the exact tracked paths that a version change or generator may modify.

After changing the version or build:

1. Run the canonical generator.
2. Reject tracked changes outside the allowed release-state paths.
3. Stage the complete changed path set.
4. Run the repository's drift check.
5. Record the staged Git tree ID.
6. Archive and export that exact staged tree.
7. Commit the release state once before upload.
8. Require a clean worktree.

Record the new `HEAD` as `releaseCommit`. Verify that its sole parent is `sourceCommit`, that its tree ID equals the archived tree ID, and that its changed paths are within the allowed set.

If generation, archive, or export fails, restore the exact changed paths to `sourceCommit`. Do not create `releaseCommit`.

A wrapper that commits only the manifest while leaving canonical generated output dirty is not release-safe.

When the lane reuses an existing build and changes no tracked state, use the synchronized `HEAD` as both `sourceCommit` and `releaseCommit`.

When resuming a release that already has a committed note archive, preserve the
archive's original `sourceCommit`. Treat the synchronized current `HEAD` as the
`releaseCommit` only after proving it has that source as its sole parent and its
committed note file exactly matches the archive being checked. Never rewrite the
archive identity to the newer release commit.

## Push only after remote readback

After App Store Connect exposes the exact successful state, fetch the original upstream again.

If the upstream still equals `sourceCommit`, push this exact refspec without force:

```bash
git push --porcelain <remote> <releaseCommit>:<branch-ref>
```

Read the remote branch after the push. Treat the repository as reconciled only when the remote branch equals `releaseCommit`.

If the push command fails, read the remote ref before classifying the result. The command can fail after the server accepted the update.

If the upstream moved or still points to `sourceCommit`, preserve `releaseCommit` and return `partial`. Do not merge, rebase, force-push, open a pull request, or repeat an upload. Report the exact remote release state, both commit IDs, the observed upstream commit, and one repository-policy-safe next action.

## Keep adjacent publishing separate

Repository reconciliation covers only deterministic tracked release state.

The release request does not authorize:

- a Git tag;
- a tag push;
- a GitHub Release;
- unrelated commits;
- a pull request;
- a merge or force-push.

Perform an adjacent effect only when the current request names it or the repository policy makes it an explicit part of the selected release lane.
