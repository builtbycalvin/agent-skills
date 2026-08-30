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

Install all skills from this repository:

```bash
npx skills@latest add builtbycalvin/agent-skills -g
```

## Use

Review and fix local changes until clean:

```text
$local-review-until-clean review and fix the current changes until no actionable findings remain.
```

For review without changes:

```text
$local-review-until-clean review the current changes only. Do not edit files.
```

Local Review Until Clean triggers Poteto Mode and Interrogate for the task. You
do not need to invoke either dependency separately. A review-only request stays
review-only.

To address pull-request feedback until merge-ready:

```text
$poteto-mode $pr-until-ready address review findings and CI on the current pull request until it is merge-ready.
```

To merge after the PR reaches ready state, say so explicitly:

```text
$poteto-mode $pr-until-ready address review findings and CI, then auto-merge the current pull request if it is ready.
```

PR Until Ready stops at merge-ready unless you explicitly request merging.

## Update

Update installed skills:

```bash
npx skills@latest update
```

Update pstack separately using its [maintenance instructions](https://github.com/Aqua-123/pstack-for-codex#update-or-remove).

## Attribution and license

Local Review Until Clean and PR Until Ready are MIT licensed. See [LICENSE](LICENSE).

Poteto's playbooks and Interrogate come from
[pstack-for-codex](https://github.com/Aqua-123/pstack-for-codex), a Codex adaptation
of [pstack by Lauren Tan](https://github.com/cursor/plugins/tree/main/pstack).
They remain separate dependencies under their own license and notices; their
implementation is not bundled here. This is an independent project, not an
official OpenAI, Cursor, or pstack release.
