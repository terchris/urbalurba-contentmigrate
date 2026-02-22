# AI Developer Guide

Read this first when starting a new session. This folder contains everything an AI coding assistant needs to work on this repo.

## Quick Actions

| I want to... | Go to... |
|--------------|----------|
| **New here?** | [QUICKSTART.md](QUICKSTART.md) (30 seconds) |
| Add a bash script | [Copy template](templates/bash/script-template.sh) → [Read rules](rules/bash.md) → [Validate](tools/validate-bash.sh) |
| Add a PowerShell script | [Copy template](templates/powershell/script-template.ps1) → [Read rules](rules/powershell.md) → [Validate](tools/validate-powershell.sh) |
| Create a plan | [Read PLANS.md](PLANS.md) → Copy from `plans/completed/EXAMPLE-*.md` |
| Understand the workflow | [WORKFLOW.md](WORKFLOW.md) |
| See all rules | [rules/](rules/) |

**TL;DR**: Copy template → Fill metadata → Implement → Validate → Commit

---

## Framework

This folder provides a plan-based development workflow and language-specific coding rules.

### Workflow (all projects)

How to plan, implement, and ship work. These files are language-agnostic:

- [WORKFLOW.md](WORKFLOW.md) — Plan-to-implementation flow
- [PLANS.md](PLANS.md) — Plan structure and templates
- [GIT-HOSTING-GITHUB.md](GIT-HOSTING-GITHUB.md) / [GIT-HOSTING-AZURE-DEVOPS.md](GIT-HOSTING-AZURE-DEVOPS.md) — PRs, merge, issues

### Language rules

Each language has its own rules file in `rules/`, its own templates in `templates/`, and its own validation tools in `tools/`.

**Scripts (bash, PowerShell)** use a two-layer pattern:

1. [rules/script-standard.md](rules/script-standard.md) — **Script Standard**: shared rules for all script languages (metadata fields, help format, logging, error codes). Only applies to bash and PowerShell scripts.
2. [rules/bash.md](rules/bash.md) / [rules/powershell.md](rules/powershell.md) — Language-specific syntax, platform gotchas, and validation commands. These reference `script-standard.md`.

**Application languages** (TypeScript, Python, C#, etc.) — when added — will have self-contained rule files that do NOT reference `script-standard.md`. Application languages have their own ecosystems for metadata (`package.json`, `pyproject.toml`, `.csproj`), linting, testing, and versioning.

### Adding a new language

1. Create `rules/<language>.md` — coding conventions, project structure, tooling, error handling
2. Create `templates/<language>/` — starter files to copy when beginning new work
3. Create `tools/validate-<language>.sh` — automated checks (optional but recommended)
4. Add an implementation rules block to this README (see below)
5. Add the language to the "Detailed Docs" table below

For scripts: reference `rules/script-standard.md` from the new language file.
For application languages: make the rule file self-contained.

### Devcontainer toolbox

This repo's devcontainer has installable tools, runtimes, and services. See [DEVCONTAINER-TOOLBOX.md](DEVCONTAINER-TOOLBOX.md) for how to discover, examine, and install tools.

---

## Key Rules

1. **Always ask before starting** — ask whether to create a `PLAN-*.md` or `INVESTIGATE-*.md` before doing anything. Never jump straight into implementation.
2. **Ask before git commands** — always confirm before git add, commit, push, branch, or merge.
3. **Every script must follow the standard** — no exceptions. This includes test scripts, helpers, and library scripts. See [rules/script-standard.md](rules/script-standard.md) and the language rules file.
4. **Validate before committing** — run the language-specific validation tool (see language rules).

---

## IMPLEMENTATION RULES

Copy the appropriate block into the top of every plan or investigation file. This prevents drift — Claude reads the right rules files before starting work.

### For bash work

```markdown
> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md) + [script-standard.md](../../rules/script-standard.md) + [bash.md](../../rules/bash.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.
```

### For PowerShell work

```markdown
> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md) + [script-standard.md](../../rules/script-standard.md) + [powershell.md](../../rules/powershell.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.
```

### For non-script work (docs, plans, config)

```markdown
> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.
```

---

## Detailed Docs

| Document | Read when |
|----------|-----------|
| [WORKFLOW.md](WORKFLOW.md) | You need to understand the plan-based workflow |
| [PLANS.md](PLANS.md) | You need to create or manage plans |
| [rules/script-standard.md](rules/script-standard.md) | You need to understand the shared script standard |
| [rules/bash.md](rules/bash.md) | You need to create or modify bash scripts |
| [rules/powershell.md](rules/powershell.md) | You need to create or modify PowerShell scripts |
| [GIT-HOSTING-GITHUB.md](GIT-HOSTING-GITHUB.md) | You need to create PRs, merge, or manage issues (GitHub) |
| [GIT-HOSTING-AZURE-DEVOPS.md](GIT-HOSTING-AZURE-DEVOPS.md) | You need to create PRs, merge, or manage work items (Azure DevOps) |
| [DEVCONTAINER-TOOLBOX.md](DEVCONTAINER-TOOLBOX.md) | You need to install tools in the devcontainer |

---

## Folder Structure

```
docs/ai-developer/
  README.md                    <- you are here
  WORKFLOW.md                  <- plan-to-implementation flow (all languages)
  PLANS.md                     <- plan structure and templates (all languages)
  GIT-HOSTING-GITHUB.md        <- PRs, merge, issues (GitHub)
  GIT-HOSTING-AZURE-DEVOPS.md  <- PRs, merge, work items (Azure DevOps)
  DEVCONTAINER-TOOLBOX.md      <- devcontainer tool discovery and install
  rules/
    script-standard.md         <- shared standard for scripts only (bash + PowerShell)
    bash.md                    <- bash rules (references script-standard.md)
    powershell.md              <- PowerShell rules (references script-standard.md)
                               <- future: typescript.md, python.md, etc. (self-contained)
  tools/
    validate-bash.sh           <- bash validation (syntax, help, metadata, shellcheck)
    validate-powershell.sh     <- PowerShell validation
    set-version-bash.sh        <- bump SCRIPT_VER in bash packages
    set-version-powershell.sh  <- bump SCRIPT_VER in PowerShell packages
  templates/
    bash/
      script-template.sh      <- copy to start any new bash script
    powershell/
      script-template.ps1     <- copy to start any new PowerShell script
    README-template.md         <- copy to start a new package README
  plans/
    active/                    <- plans currently being worked on
    backlog/                   <- plans waiting for implementation
    completed/                 <- done, kept for reference (includes EXAMPLE-* files)
  devcontainer-toolbox-issues/
    README.md                  <- how to write and submit toolbox issues
    ISSUE-*.md                 <- example issue files
```
