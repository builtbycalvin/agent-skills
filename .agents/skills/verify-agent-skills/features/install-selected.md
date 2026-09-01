# Install a selected skill

Selected installation lets a user add one named agent skill and all of its supporting files to a Codex project's local skill directory.

## Sub-features

- `install-select` chooses exactly one of the repository's skill names.
- `install-project-scope` writes only to the disposable project's `.agents/skills` directory.
- `install-copy` creates inspectable files rather than links back to the source.
- `install-list` exposes the installed skill through machine-readable project listing.
- `install-completeness` preserves every packaged supporting file byte for byte.

## How to get to it (user POV)

- Run `npx skills@latest add builtbycalvin/agent-skills --agent codex --skill <skill-name> --copy --yes` from a project.
- The supported names are `ios-release` and `verify-agent-skills`.

## Driving it with skills CLI

Preconditions:

- `<run-id>` is freshly launched and doctor reports `HEALTHY`.
- The disposable project has no existing install of `<skill-name>`.

- **Install one skill.** Run `scripts/verify-agent-skills drive <run-id> install-selected <skill-name>`. The CLI reports one copied project install.
- **Confirm registration.** Inspect `list.json`. It contains exactly one matching name whose path is in the disposable project, scope is `project`, and source type is `local`. `global-list.json` is empty in the isolated home.
- **Confirm complete package.** Require `package-diff.txt` to be empty. The installed directory and the selected source package are byte-for-byte identical.
- **Proof.** Retain `action.txt`, `transcript.txt`, `list.json`, `global-list.json`, `package-diff.txt`, `before.txt`, `after.txt`, `source-before.txt`, `source-after.txt`, `source-diff.txt`, `doctor.txt`, and `proof.txt`.

## Gotchas

- The CLI installs relative to its working directory; changing only `HOME` does not isolate the project install.
- `--copy` is required for deterministic package comparison.
- A successful install line alone does not prove supporting references, scripts, or agent metadata were copied.
- Do not reuse the run for another install recipe; start from a new disposable project.
