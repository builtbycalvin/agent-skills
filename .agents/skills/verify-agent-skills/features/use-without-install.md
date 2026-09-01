# Use a skill without installing

Use-without-install lets a user generate an execution prompt for one skill while its supporting files live in temporary state rather than the project skill directory.

## Sub-features

- `use-select` chooses one named skill.
- `use-prompt` emits the selected `SKILL.md` as agent instructions.
- `use-supporting-files` reports where temporary references and scripts were downloaded.
- `use-no-install` leaves the disposable project's `.agents/skills` unchanged.

## How to get to it (user POV)

- Run `npx skills@latest use builtbycalvin/agent-skills --skill <skill-name>` and pass the generated prompt to a supported agent.
- During local verification, use the worktree path so the prompt covers the exact checkout.

## Driving it with skills CLI

Preconditions:

- `<run-id>` is freshly launched and doctor reports `HEALTHY`.
- `<skill-name>` is one of the two mapped repository skills.

- **Generate the prompt.** Run `scripts/verify-agent-skills drive <run-id> use-without-install <skill-name>`. `prompt.txt` begins with the skills CLI execution preamble, and its complete `<SKILL.md>` payload matches the selected source with only the CLI's one delimiter newline added.
- **Locate supporting files.** In `prompt.txt`, require `Supporting files for this skill were downloaded to:` and a scratch-scoped temporary path. `use-package-diff.txt` is empty because the complete supporting package matches the selected source; cleanup removes the bundle with the owned scratch directory after preserving evidence.
- **Confirm no project install.** Inspect `after.txt`; it contains no `.agents/skills/<skill-name>/SKILL.md` in the disposable project.
- **Proof.** Retain `action.txt`, `prompt.txt`, `use-package-diff.txt`, `transcript.txt`, `before.txt`, `after.txt`, `source-before.txt`, `source-after.txt`, `source-diff.txt`, `doctor.txt`, and `proof.txt`.

## Gotchas

- Prompt generation proves packaging and handoff text, not that a downstream agent followed the skill correctly.
- Supporting files are temporary; capture the prompt during the drive instead of depending on their later lifetime.
- Omitting `--skill` can introduce interactive selection and invalidates the scripted proof.
- Do not confuse temporary supporting files with a registered project installation.
