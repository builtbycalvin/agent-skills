# Install all skills

All-skills installation lets a user add the repository's complete catalog to one Codex project in a single command.

## Sub-features

- `install-all-select` selects every discovered skill.
- `install-all-project-scope` keeps all writes inside the disposable project.
- `install-all-list` lists both installed names in machine-readable state.
- `install-all-completeness` preserves every source package byte for byte.

## How to get to it (user POV)

- The README's published path is `npx skills@latest add builtbycalvin/agent-skills -g`.
- Safe local verification substitutes a disposable project install: `npx skills@latest add <worktree> --agent codex --skill '*' --copy --yes`.

## Driving it with skills CLI

Preconditions:

- `<run-id>` is freshly launched and doctor reports `HEALTHY`.
- The disposable project has no `.agents/skills` directory.

- **Install the catalog.** Run `scripts/verify-agent-skills drive <run-id> install-all`. The CLI selects and copies both skills.
- **Confirm registration.** Inspect `list.json`. It names `ios-release` and `verify-agent-skills` under project scope. `global-list.json` is empty in the isolated home.
- **Confirm complete packages.** Require `package-diff.txt` to be empty. Every installed package matches its source directory.
- **Proof.** Retain `action.txt`, `transcript.txt`, `list.json`, `global-list.json`, `package-diff.txt`, `before.txt`, `after.txt`, `source-before.txt`, `source-after.txt`, `source-diff.txt`, `doctor.txt`, and `proof.txt`.

## Gotchas

- Verification intentionally does not use `-g`; mutating the operator's real global skills is outside the proof boundary.
- Quote `'*'` so the shell does not expand it before the CLI receives it.
- Both selected names are required; a partially successful install is not complete catalog proof.
- Local installation does not prove the current checkout has been committed or published to GitHub.
