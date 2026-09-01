---
name: verify-agent-skills
description: "Verify the agent-skills repository through the real skills CLI: discover, install, list, and use its packaged coding-agent skills in an isolated project. Use after changing a skill package, installation docs, or distributable supporting files."
---

# Verify agent-skills

Drive the repository as a consumer does through the `skills` CLI. The primary surface is the installable skill package. `ios-release` later drives Codex and App Store Connect, but those external systems are outside this package-control harness.

Read [features/README.md](features/README.md), then the feature file for the path being verified. Do not claim an individual agent workflow or external side effect works merely because its package installs.

## Launch

This is a short-lived CLI package, so there is no server. Launch creates a uniquely named disposable Git project and home directory, resolves the current `skills@latest` once, and records the exact resolved version for offline drive commands.

From the repository root:

```bash
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-install-selected"
.agents/skills/verify-agent-skills/scripts/verify-agent-skills launch "$RUN_ID"
```

Ready means the command prints `READY`, the exact CLI version, scratch project, and evidence directory. Each run ID owns its scratch directory. Never reuse a run ID or drive a project not created by this command.

Teardown is explicit:

```bash
.agents/skills/verify-agent-skills/scripts/verify-agent-skills cleanup "$RUN_ID"
```

## Doctor

Run this before every drive and whenever the CLI, paths, or install state look wrong:

```bash
.agents/skills/verify-agent-skills/scripts/verify-agent-skills doctor "$RUN_ID"
```

Doctor is read-only with respect to the source and disposable project. It requires the same repository root, an owned scratch marker, an initialized disposable Git project, the recorded isolated home, both expected source skills, and the exact cached CLI version working offline. A failed doctor means the instance is not worth driving; clean it up and launch a fresh run.

## Drive

The helper accepts these mapped feature IDs:

```bash
.agents/skills/verify-agent-skills/scripts/verify-agent-skills drive "$RUN_ID" discover-skills
.agents/skills/verify-agent-skills/scripts/verify-agent-skills drive "$RUN_ID" install-selected ios-release
.agents/skills/verify-agent-skills/scripts/verify-agent-skills drive "$RUN_ID" install-all
.agents/skills/verify-agent-skills/scripts/verify-agent-skills drive "$RUN_ID" use-without-install ios-release
```

Use a fresh run ID for each recipe. `install-selected` and `use-without-install` accept `ios-release` or `verify-agent-skills`. The harness uses the real local repository as the package source, the real `skills` CLI, `--copy` for inspectable installed state, and `skills list --json` for stable assertions. It never installs globally and never writes to the operator's home directory.

## Evidence

Proof survives under `.verification/verify-agent-skills/<run-id>/`. Every drive records:

- `action.txt`: the consumer command and source used;
- `before.txt`: the disposable project before the action;
- `transcript.txt`: stdout and stderr from the real CLI action;
- `after.txt`: the resulting consumer-visible project state;
- `source-before.txt`, `source-after.txt`, and `source-diff.txt`: content-bound source manifests and proof that the CLI action did not change tracked, staged, unstaged, or untracked package inputs;
- `doctor.txt`: repository, runtime, ownership, and exact CLI identity;
- `proof.txt`: the feature ID and assertions that passed;
- `list.json`, `global-list.json`, or `prompt.txt` when the feature produces that user-facing result.

Exercise the real CLI path, not a copied fixture or an internal helper. Capture both the action and resulting state. Installation proof requires the CLI's JSON listing, an empty isolated global listing, and byte-for-byte comparison of the installed package with its source directory. Discovery proof requires all expected names and descriptions in CLI output. Use-without-install proof requires the generated `SKILL.md` payload to match the source exactly except for the CLI's one delimiter newline, plus a byte-identical supporting package. The isolated mode prevents global installation; verify that fact from the disposable project and `HOME`, not from the word `--copy` alone.

Passing this harness proves local package behavior for the current checkout and recorded CLI version. It does not prove the remote GitHub package, a future `skills@latest`, an LLM's interpretation, or external release/review effects.

## Cleanup

Cleanup validates the run's ownership marker and removes only the scratch directory recorded by launch. The harness forces CLI temporary files—including `skills-use-*` supporting bundles—inside that owned scratch directory, so the same cleanup is complete even after a failed drive. There is no long-lived process to stop. It never removes `.verification`, so proof artifacts survive teardown.

After cleanup following a successful drive, require both conditions:

```bash
EVIDENCE_ROOT="${VERIFY_AGENT_SKILLS_EVIDENCE_ROOT:-.verification/verify-agent-skills}"
test ! -e "$(sed -n 's/^scratch=//p' "$EVIDENCE_ROOT/$RUN_ID/state")"
test -f "$EVIDENCE_ROOT/$RUN_ID/proof.txt"
```

If launch creates run state and then fails, or if drive fails, run the same cleanup command before retrying. Require the recorded scratch path to be absent and `cleanup.txt` to be preserved, but do not require `proof.txt` for a failed run. A launch rejected before state creation has no owned scratch directory to clean. Do not kill by process name and do not manually delete an unverified path.

## Helpers

`scripts/verify-agent-skills` is the executable harness. Invoke it only from this repository:

```text
scripts/verify-agent-skills launch <run-id>
scripts/verify-agent-skills doctor <run-id>
scripts/verify-agent-skills drive <run-id> <feature-id> [skill-name]
scripts/verify-agent-skills cleanup <run-id>
```

Set `VERIFY_AGENT_SKILLS_EVIDENCE_ROOT` only when evidence must live elsewhere. It must remain stable for the entire run. Separate run IDs isolate parallel instances; a shared run ID is refused.
