# Agent skills

Reusable coding-agent workflows by [Calvin](https://github.com/builtbycalvin).

## Local Review Until Clean

[local-review-until-clean](skills/local-review-until-clean/SKILL.md) reviews and
fixes local changes through Poteto's engineering playbooks. Poteto leads the
work, Interrogate reviews it, and the workflow continues until an independent
final review has no unresolved actionable findings and required checks pass.

It is a thin orchestration skill, not a new reviewer or a guarantee of bug-free
code. It reports blockers and stalled progress instead of claiming success.

## PR Until Ready

[pr-until-ready](skills/pr-until-ready/SKILL.md) routes an existing pull request
through Poteto's Babysit playbook. For until-ready work, it validates and
addresses review findings, handles CI, and repeats until GitHub reports the
current head merge-ready. Babysit may select a one-pass check for a small or
docs-only PR. In that case, the skill reports the result and stops.

It does not request new reviews or wait for generic reviewer silence. It stops
at merge-ready unless the user explicitly requests merging. An authorized merge
runs Poteto's independent Shipping verification before it arms merge-when-ready.

## Prerequisites

- Node.js 22.20.0 or newer and npm for `npx`.
- Bun for pstack's PR watcher.
- Codex with skill support and independent subagent review available.
- Authenticated GitHub CLI for PR status, review, and repair work.
- The complete [pstack-for-codex plugin](https://github.com/Aqua-123/pstack-for-codex),
  including Poteto Mode, Interrogate, their playbooks, and supporting skills.
- Graphite CLI with current branch tracking for merge or auto-merge requests.
  Reaching merge-ready does not require Graphite.
- A matching installed live-control skill, the real control surface, isolated
  reviewer worktrees, and authority for Shipping's required verdict posts when
  merging.

**Installing these skills does not install pstack.** If you do not already have it,
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

These commands are for fresh global installations. Before each command, inspect
that command's target skill. If that name already exists or its state is
uncertain, stop and preserve it. Do not approve a replacement prompt. Follow the
Skills CLI documentation before an upgrade, replacement, or project-local
installation.

Install globally for Codex:

```bash
npx skills@1.5.23 add builtbycalvin/agent-skills --skill local-review-until-clean --agent codex --global
```

Install PR Until Ready globally for Codex:

```bash
npx skills@1.5.23 add builtbycalvin/agent-skills --skill pr-until-ready --agent codex --global
```

The Skills CLI stores Codex skills in a shared universal-agent directory. Other
compatible agents may discover the same global installation even with
`--agent codex`; the flag scopes managed links but does not create private
storage.

Confirm that Codex discovers both global skills:

```bash
npx skills@1.5.23 list --global --agent codex --json
```

Require global records for both `local-review-until-clean` and `pr-until-ready`,
each with `agents` containing `Codex`.

`review-loop` was renamed to `local-review-until-clean`. Do not automate removal
of the old installation. Its directory may be shared with other agents. Stop
invoking the old name.

To list available skills without installing:

```bash
npx skills@1.5.23 add builtbycalvin/agent-skills --list
```

## Use

In Codex, invoke Local Review Until Clean directly. It loads Poteto and
Interrogate as task-local dependencies; the user does not need to invoke them
separately:

```text
$local-review-until-clean review and fix the current changes until no actionable findings remain.
```

For review without changes:

```text
$local-review-until-clean review the current changes only. Do not edit files.
```

A review-only request stays review-only. Local Review Until Clean does not grant
permission to commit, push, open or merge pull requests, deploy, or change
production.

Three passes are a progress checkpoint, not a mandatory count or hard cap.
Local Review Until Clean stops unfinished after two consecutive passes without
verified progress, repeated reversals, a genuine blocker, or a user-specified
budget limit.

To address pull-request feedback until merge-ready:

```text
$poteto-mode $pr-until-ready address review findings and CI on the current pull request until it is merge-ready.
```

An explicit request to address pull-request feedback until merge-ready with PR
Until Ready authorizes bounded repair commits, non-force pushes to the current
pull-request branch, replies, and eligible automated-thread resolution. A
check-only or review-only request remains read-only. The skill does not authorize
force-pushing, deploying, or resolving human threads.

To merge after the PR reaches ready state, say so explicitly:

```text
$poteto-mode $pr-until-ready address review findings and CI, then auto-merge the current pull request if it is ready.
```

The phrase `merge-ready` alone does not authorize merging. A question,
hypothetical, quoted example, or documentation sentence does not authorize it
either. An imperative to merge, auto-merge, land, or ship an exact PR or frozen
stack hands the ready state to Poteto's Shipping playbook for independent
verification.

## Update

Preserve any local edits before updating. Use `npx skills@1.5.23 --help` and the
[Skills CLI documentation](https://github.com/vercel-labs/skills#readme) for
update and project-local options. Update pstack separately using its
[maintenance instructions](https://github.com/Aqua-123/pstack-for-codex#update-or-remove).

## Attribution and license

Local Review Until Clean and PR Until Ready are MIT licensed. See [LICENSE](LICENSE).

Poteto's playbooks and Interrogate come from
[pstack-for-codex](https://github.com/Aqua-123/pstack-for-codex), a Codex adaptation
of [pstack by Lauren Tan](https://github.com/cursor/plugins/tree/main/pstack).
They remain separate dependencies under their own license and notices; their
implementation is not bundled here. This is an independent project, not an
official OpenAI, Cursor, or pstack release.
