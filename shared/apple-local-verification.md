# Apple local verification contract

Use this contract only after classifying the actual changed surface. The presence of Swift files elsewhere in a repository is not evidence that the current change affects an Apple build.

## Classify the changed surface

Compare the complete in-scope snapshot with its resolved base. Include committed changes, the index, the working tree, and in-scope untracked files. Classify the change as `apple-build-affecting` when it changes an input to an Apple build or test, including:

- relevant Swift production or test code;
- Xcode projects, workspaces, project generators, build settings, schemes, or build scripts;
- Apple package or dependency manifests and lockfiles;
- Core Data models;
- entitlements or build-relevant property lists;
- asset catalogs, storyboards, XIBs, localized strings, string catalogs, or related Apple UI resources.

Treat a relevant generated input or repository-specific configuration as build-affecting even when its extension is not listed. A mixed change is build-affecting. A docs-only change or a change confined to a non-Apple service is not build-affecting. Record the paths and the reason for the classification.

## Select checks

The owning workflow selects the target and exact required checks using the target repository's documented verification commands. Do not infer commands, targets, or schemes from paths. If documented coverage is absent, the workflow must report the missing judgment rather than inventing a command.

- For an Xcode iOS app, use `xcodebuild` and XCTest. Do not substitute `swift test`.
- Use `swift test` only for a genuinely affected Swift Package rooted at a relevant `Package.swift` that builds for an Apple target. A server-only Swift package is not Apple-build-affecting.
- Include every build or test required by the affected target. Run focused checks during repair passes, then the complete applicable checks once the final snapshot is stable.
- GitHub or Linux CI does not replace local Apple verification when no macOS CI job covers the same content and checks.

Keep build state isolated where practical. Use a disposable DerivedData directory and a result bundle path for Xcode invocations when the repository's documented command permits it. Do not modify code, project files, dependency state, or tracked fixtures as a side effect of read-only verification.

## Bind the snapshot

Use a Git tree object ID for content identity. It covers file content and executable or symlink modes without depending on the commit message or commit SHA.

For a committed PR head, resolve the expected tree with `git rev-parse <head>^{tree}`. For a local snapshot, compute an equivalent tree from a temporary index containing the complete reviewed working content, including relevant untracked files, without changing the real index. Exclude ignored build products and the receipt itself. If an in-scope build input is ignored, pass its path with one `--include` option per file. The packaged receipt helper force-adds only those explicit paths. Record its exact invocation as the identity command.

Compute `tree_before` immediately before each check and `tree_after` immediately after it. A successful run is invalid when any per-check observation differs from its pair, from `content_tree`, or, for PR verification, from the current PR head tree. Recompute the current identity immediately before reusing a receipt.

The helper rejects dirty, divergent, conflicted, or uninitialized recursive submodules because the superproject Git tree cannot represent their working content. Treat that state as a hard blocker. Verification may resume only after the submodule content is committed or checked out and the superproject gitlink records the intended commit.

Store the receipt outside the verified tracked content or in an ignored artifact location. Adding or editing a tracked receipt would change the tree it claims to verify.

## Receipt

Emit UTF-8 JSON with this exact field model. `repository` is an absolute path. `classification.paths` and `identity.included_paths` are normalized repository-relative paths. `checks[].artifacts` and `reused_from` may be absolute or repository-relative evidence locations. Commands must be complete enough to rerun.

```json
{
  "schema": "apple-local-verification/v1",
  "repository": "/absolute/repository/path",
  "content_tree": "<git-tree-object-id>",
  "head_oid": "<commit-object-id-or-null>",
  "head_tree": "<git-tree-object-id-or-null>",
  "reused_from": "<prior-receipt-path-or-null>",
  "bound_at": "<RFC-3339-timestamp>",
  "classification": {
    "result": "apple-build-affecting",
    "paths": ["<changed-path>"],
    "rationale": "<why-local-Apple-verification-applies>"
  },
  "identity": {
    "command": "python3 \"<installed-skill-directory>/scripts/apple_verification_receipt.py\" tree --repository \"<repository>\" [--include \"<ignored-build-input>\"]",
    "included_paths": ["<explicit-ignored-build-input-if-any>"]
  },
  "checks": [
    {
      "name": "<stable-check-name>",
      "command": "<exact-command>",
      "result": "passed",
      "exit_code": 0,
      "tree_before": "<git-tree-object-id>",
      "tree_after": "<git-tree-object-id>",
      "artifacts": ["<xcresult-or-log-path>"]
    }
  ],
  "toolchain": {
    "xcode": "<xcodebuild-version>",
    "swift": "<swift-version>",
    "macos": "<sw-vers-product-version>"
  },
  "started_at": "<RFC-3339-timestamp>",
  "completed_at": "<RFC-3339-timestamp>",
  "verdict": "passed"
}
```

Use `null` only where the model explicitly permits it. `checks` must name all applicable final checks. At validation time, the workflow must pass a nonempty, duplicate-free ordered `required_check_names` sequence, and it must exactly match `checks[].name` in order. Keep failed attempts in the task report or separate receipts; never rewrite them as passed.

A receipt is reusable only when all of these are true:

1. `schema` is `apple-local-verification/v1` and every required field is present.
2. `classification.result` is `apple-build-affecting` and its paths still describe the current in-scope change.
3. `verdict` is `passed`; every applicable check is present, has `result: passed`, and has exit code `0`.
4. Every check has `tree_before` and `tree_after`, and both equal `content_tree` and the freshly computed working-content tree.
5. For PR verification, `head_oid` is the current PR head and `head_tree`, `content_tree`, every per-check tree, and the current PR head tree are identical.
6. Toolchain identity, completion time, exact commands, and available artifacts are recorded. Artifact existence and hashes are not receipt validation requirements.

Resolve `<installed-skill-directory>` from the loaded skill's `SKILL.md`. Do not assume that the helper exists in the target repository. Validate a local receipt without `--head-oid`. For PR evidence, pass the current PR head OID. The helper resolves that commit's tree in the target repository.

```bash
python3 "<installed-skill-directory>/scripts/apple_verification_receipt.py" validate "<receipt.json>" --repository "<repository>" --required-check ios-build --required-check ios-tests
python3 "<installed-skill-directory>/scripts/apple_verification_receipt.py" validate "<receipt.json>" --repository "<repository>" --head-oid "<current-head-oid>" --required-check ios-build --required-check ios-tests
python3 "<installed-skill-directory>/scripts/apple_verification_receipt.py" route --authority check-only --receipt-state failed
```

The `route` command emits the stable JSON object returned by `route_verification(authority, receipt_state)`. Both options are required, and unknown values fail.

Absent, incomplete, failed, or mismatched evidence is invalid. A repair that changes build-affecting content invalidates the prior receipt. A commit that preserves the identical content tree does not.

To bind unchanged local evidence to a new PR head, freshly prove that the working-content tree and the current PR head tree both equal the prior `content_tree`. Emit a new receipt. Copy the original classification, identity observations, checks, artifacts, toolchain, `started_at`, and `completed_at` without changing them. Set `reused_from` to the prior receipt, set `head_oid` and `head_tree` to the current PR head, and set `bound_at` to the rebinding time. Do not rebind evidence across a content-tree change.

## Authority and failures

A bounded read-only verifier may run the final checks after the snapshot is stable. It must not edit code, must isolate build and test state where practical, and must return the exact commands, results, artifacts, toolchain identity, times, and a `tree_before` and `tree_after` for every check. If independent delegation is unavailable, the lead runs the same verification.

The workflow classifies the changed surface, selects the target and applicable checks, and maps its own mode to `check-only` or `repair-authorized` before calling `route_verification(authority, receipt_state)`. Check-only authority permits read-only classification and tests. It does not permit a repair, commit, push, comment, thread resolution, or merge.

`route_verification` accepts only the authorities `check-only` and `repair-authorized`, and only the receipt states `absent`, `incomplete`, `stale-content-tree`, `valid-current-tree`, `snapshot-changed-during-run`, `failed`, `failed-validated-in-scope`, and `valid-before-apple-repair`. Unknown values fail. A failed check blocks under `check-only`; under `repair-authorized`, an unvalidated failure is diagnosed and a validated in-scope failure may be repaired before final verification. No route infers authority from another mode vocabulary.

When repair is authorized and a required check fails, diagnose the failure. Fix only a validated in-scope cause, run focused checks, stabilize the content, then rerun every applicable final check and issue a new receipt. Never delete, skip, or weaken a test to obtain a pass. Report pre-existing failures, flaky tests, environment failures, and no-progress conditions honestly under the owning workflow's blocker rules.
