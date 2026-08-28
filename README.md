# Agent skills

Reusable coding-agent workflows by [Calvin](https://github.com/builtbycalvin).

## Review Loop

[review-loop](skills/review-loop/SKILL.md) adds a review-and-fix loop around
Poteto's engineering playbooks. Poteto leads the work, Interrogate reviews it,
and the loop continues until an independent final review has no unresolved
actionable findings and required checks pass.

It is a thin orchestration skill, not a new reviewer or a guarantee of bug-free
code. It reports blockers and stalled progress instead of claiming success.

## Prerequisites

- Node.js and npm for `npx`.
- Codex with skill support and independent subagent review available.
- The complete [pstack-for-codex plugin](https://github.com/Aqua-123/pstack-for-codex),
  including Poteto Mode, Interrogate, their playbooks, and supporting skills.

**Installing Review Loop does not install pstack.** If you do not already have it,
follow [pstack's setup instructions](https://github.com/Aqua-123/pstack-for-codex#install).
Its documented Codex CLI installation is:

```bash
codex plugin marketplace add Aqua-123/pstack-for-codex
codex plugin add pstack-for-codex@pstack-for-codex-local
```

Start a new Codex task after installing the plugin. Custom agent profiles and
cross-turn sticky hooks are not required by this wrapper. Available models and
tools still determine which review lanes can run; missing required capabilities
must be reported.

## Install

Install globally for Codex:

```bash
npx skills@latest add builtbycalvin/agent-skills --skill review-loop --agent codex --global
```

For a project-local installation, run the same command from that project without
`--global`. Review any existing installation before replacing it, especially if
it contains local edits.

To list available skills without installing:

```bash
npx skills@latest add builtbycalvin/agent-skills --list
```

## Use

In Codex, select the skill or include it in your prompt:

```text
$review-loop review and fix the current changes until no actionable findings remain.
```

For review without changes:

```text
$review-loop review the current changes only. Do not edit files.
```

A review-only request stays review-only. The loop does not grant permission to
commit, push, open or merge pull requests, deploy, or change production.

Three passes are a progress checkpoint, not a mandatory count or hard cap.
The loop stops unfinished after two consecutive passes without verified progress,
repeated reversals, a genuine blocker, or a user-specified budget limit.

## Update

Update this globally installed skill:

```bash
npx skills@latest update review-loop --global
```

For a project-local installation, run `npx skills@latest update review-loop --project`
from that project. Update pstack separately using its
[maintenance instructions](https://github.com/Aqua-123/pstack-for-codex#update-or-remove).

See the [Skills CLI documentation](https://github.com/vercel-labs/skills#readme)
for installation and update options.

## Attribution and license

The Review Loop wrapper is MIT licensed. See [LICENSE](LICENSE).

Poteto's playbooks and Interrogate come from
[pstack-for-codex](https://github.com/Aqua-123/pstack-for-codex), a Codex adaptation
of [pstack by Lauren Tan](https://github.com/cursor/plugins/tree/main/pstack).
They remain separate dependencies under their own license and notices; their
implementation is not bundled here. This is an independent project, not an
official OpenAI, Cursor, or pstack release.
