# Discover skills

Discovery lets a user inspect the skills and descriptions available from this repository before installing anything.

## Sub-features

- `discover-count` reports exactly two packaged skills.
- `discover-names` exposes `ios-release` and `verify-agent-skills`.
- `discover-descriptions` presents each skill's frontmatter description.
- `discover-no-install` leaves the disposable project without an installed skill.

## How to get to it (user POV)

- Run `npx skills@latest add builtbycalvin/agent-skills --list` for the published repository.
- During local verification, run the same command shape with the worktree path as the package source.

## Driving it with skills CLI

Preconditions:

- `<run-id>` is freshly launched and doctor reports `HEALTHY`.
- The source repository contains the two expected skill directories.

- **List the catalog.** Run `scripts/verify-agent-skills drive <run-id> discover-skills`. The transcript reports `Found 2 skills` and names both expected skills.
- **Confirm no install.** Inspect `.verification/verify-agent-skills/<run-id>/after.txt`. It contains no `.agents/skills/<name>/SKILL.md` in the disposable project.
- **Proof.** Retain `action.txt`, `transcript.txt`, `before.txt`, `after.txt`, `doctor.txt`, and `proof.txt`.

## Gotchas

- The local path proves the current checkout, not GitHub's published default branch.
- ANSI formatting may appear in the human transcript; assert stable names and count rather than full lines.
- `--list` still resolves and reads the package but must not be reported as installation proof.
- A newly added skill requires updating both the expected count in the harness and this map.
