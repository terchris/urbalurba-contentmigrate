# Investigate: Making docs/ai-developer Generic and Portable

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Complete

**Goal**: Determine what changes are needed so the `docs/ai-developer/` folder can be copied into any project as a ready-to-use AI developer framework.

**Last Updated**: 2026-02-18

---

## Questions to Answer

1. ~~Which files are generic (work in any project) and which are project-specific (tied to the Jamf/macOS deployment project)?~~ — **Answered.** See file-by-file analysis below.
2. ~~What should happen to the completed plans — keep as examples, strip out, or move?~~ — **Done.** Kept 2 as `EXAMPLE-*` files, deleted the rest.
3. ~~Should the "This Project" section in README.md become a template the user fills in, or be removed entirely?~~ — **Answered.** Make it generic — no user-editable sections in the ai-developer folder. Remove project-specific content entirely.
4. ~~Is the Azure DevOps git hosting doc generic enough, or does it need a GitHub equivalent?~~ — **Answered.** Keep Azure DevOps doc. Create a `GIT-HOSTING-GITHUB.md` equivalent.
5. ~~Should project-installs.sh be stripped to a clean skeleton?~~ — **Answered.** Yes, strip to skeleton.
6. ~~What about the devcontainer-toolbox-issues folder — are those examples or project-specific baggage?~~ — **Done.** Kept 2 example issues, deleted the rest, updated README.

---

## Current State

The `docs/ai-developer/` folder was built for a specific project (Jamf macOS deployment scripts in a devcontainer-toolbox environment). It has been copied into this repo (urbalurba-contentmigrate). Project-specific content is being cleaned up.

### File-by-file analysis

#### Generic (work in any project as-is)

| File | Why it's generic |
|------|-----------------|
| `WORKFLOW.md` | Plan-to-implementation flow, no project references |
| `PLANS.md` | Plan structure, templates, status tracking — fully generic |
| `rules/script-standard.md` | Universal script metadata, logging, help, error codes |
| `rules/bash.md` | Bash-specific rules — generic for any bash project |
| `rules/powershell.md` | PowerShell-specific rules — generic for any PS project |
| `templates/bash/script-template.sh` | Clean starting point, no project references |
| `templates/powershell/script-template.ps1` | Clean starting point, no project references |
| `templates/README-template.md` | Generic package README template |
| `tools/validate-bash.sh` | `SCRIPTS_DIR` configurable via env var, defaults to `<repo-root>/scripts/` |
| `tools/validate-powershell.sh` | `SCRIPTS_DIR` configurable via env var, defaults to `<repo-root>/scripts/` |
| `tools/set-version-bash.sh` | `SCRIPTS_DIR` configurable via env var, defaults to `<repo-root>/scripts/` |
| `tools/set-version-powershell.sh` | `SCRIPTS_DIR` configurable via env var, defaults to `<repo-root>/scripts/` |
| `DEVCONTAINER-TOOLBOX.md` | Documents devcontainer-toolbox commands — generic for any toolbox user |
| `GIT-HOSTING-AZURE-DEVOPS.md` | Azure DevOps PR/merge commands — generic for any Azure DevOps repo |

#### Project-specific (need changes)

| File | What's project-specific | Status |
|------|------------------------|--------|
| `README.md` | "This Project" section describes Jamf/macOS scripts, lists `scripts-mac/` packages | **DONE** — removed project-specific section, made fully generic |
| `.order` | Azure DevOps wiki page ordering — may not apply to all projects | Keep as-is |
| `plans/completed/*` | Was 20+ completed plans from the Jamf project | **DONE** — kept 2 as `EXAMPLE-*` |
| `devcontainer-toolbox-issues/*` | Was 11 issue files from the Jamf project | **DONE** — kept 2 examples |

#### Supporting files (copied alongside)

| File | Notes | Status |
|------|-------|--------|
| `.devcontainer/devcontainer.json` | Devcontainer-toolbox image config — generic for toolbox users | Keep as-is |
| `.devcontainer.extend/enabled-tools.conf` | Lists `dev-bash`, `dev-ai-claudecode` | **DONE** — removed `tool-azure-devops` |
| `.devcontainer.extend/enabled-services.conf` | Empty — generic skeleton | Keep as-is |
| `.devcontainer.extend/project-installs.sh` | Clean skeleton with comments | **DONE** — stripped to skeleton |
| `.vscode/extensions.json` | Recommends Dev Containers extension — generic | Keep as-is |

---

## Decisions Made

### Approach: Option C — Clean in place + mark extensibility points

Strip project-specific content, add clear customization markers so anyone copying the folder knows exactly what to change. Can extract to a separate repo later if needed.

### Completed plans → examples

Kept 2 files in `plans/completed/` with `EXAMPLE-` prefix. They form a pair showing the investigate → plan lifecycle:
- `EXAMPLE-INVESTIGATE-auto-version-bump.md`
- `EXAMPLE-PLAN-auto-version-bump.md`

Cross-references between them updated to use the new filenames.

### Devcontainer-toolbox-issues → examples

Kept 2 files showing different issue types:
- `ISSUE-azure-devops-cli.md` — feature request
- `ISSUE-vscode-devcontainers-extension.md` — bug/improvement

Updated README to frame them as examples with a table explaining what each demonstrates.

---

## Remaining Changes — DONE

1. ~~**README.md** — Remove "This Project" section entirely.~~ — **DONE.** Removed project-specific content, made fully generic.
2. ~~**Create `GIT-HOSTING-GITHUB.md`** — GitHub equivalent of the Azure DevOps hosting doc.~~ — **DONE.** Created with full `gh` CLI commands (PRs, merge, releases, issues, actions).
3. ~~**Tools** (`validate-bash.sh`, `set-version-bash.sh`, etc.) — Make `SCRIPTS_DIR` configurable.~~ — **DONE.** All 4 tools now accept `SCRIPTS_DIR` env var, default changed from `scripts-mac/`/`scripts-win/` to `scripts/`.
4. ~~**`.devcontainer.extend/project-installs.sh`** — Strip to skeleton.~~ — **DONE.** Stripped to clean skeleton with comments.
5. ~~**`.devcontainer.extend/enabled-tools.conf`** — Remove `tool-azure-devops`.~~ — **DONE.** Kept `dev-bash` and `dev-ai-claudecode` as defaults.

---

## Outcome

All questions answered, all changes implemented. The `docs/ai-developer/` folder is now generic and portable — it can be copied into any project as a ready-to-use AI developer framework without editing any files inside the folder.

### What was done

- Removed all Jamf/macOS project-specific content from README.md
- Created `GIT-HOSTING-GITHUB.md` alongside the existing Azure DevOps doc
- Made all 4 tool scripts configurable via `SCRIPTS_DIR` environment variable
- Stripped `project-installs.sh` to a clean skeleton
- Removed `tool-azure-devops` from default enabled-tools
- Kept 2 example completed plans showing the investigate → plan lifecycle
- Kept 2 example devcontainer-toolbox issues showing different issue types
- Updated `.order` to include GitHub hosting doc
