# Investigate: Automatic version bump on file change

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Automatically bump the patch version in `SCRIPT_VER` when a script file changes, so developers and AI agents don't need to track version numbers manually.

**Last Updated**: 2026-02-12

---

## Problem

Every script has a `SCRIPT_VER` field (e.g. `"0.1.0"`) that follows semantic versioning. Today this version is updated manually using `set-version-bash.sh` or `set-version-powershell.sh`. In practice, versions rarely get bumped because:

1. **AI agents edit files** -- Claude Code edits many scripts in a single session and doesn't track which ones need a version bump
2. **Developers forget** -- it's easy to edit a script and commit without bumping the version
3. **Bulk edits** -- changes like adding `log_start` touch 40+ files at once; nobody runs set-version for each one
4. **The version becomes meaningless** -- if it's always `"0.1.0"`, it provides no useful information

The `log_start` function prints the version at runtime (`Starting: Install Rancher Desktop Ver: 0.1.0`), so accurate versions would help with debugging and knowing which version of a script is deployed.

---

## Decision

**Patch bumps are automatic. Minor and major bumps are manual.**

- When a script file changes, the patch version bumps automatically (0.1.0 -> 0.1.1 -> 0.1.2)
- A human decides when to bump minor or major (0.1.x -> 0.2.0 or 1.0.0) using the existing `set-version-*.sh` tools
- Versioning is per-file -- only files that actually changed get bumped

---

## Current State

### Version metadata

Every script has this in its metadata block:

```bash
# Bash
SCRIPT_VER="0.1.0"

# PowerShell
$SCRIPT_VER         = "0.1.0"
```

### Existing tools

- `docs/ai-developer/tools/set-version-bash.sh` -- interactive, sets same version for all `.sh` files in a package
- `docs/ai-developer/tools/set-version-powershell.sh` -- same for `.ps1` files

These tools are kept for manual minor/major bumps.

### Version format

Semantic versioning: `MAJOR.MINOR.PATCH` (e.g. `0.1.0`, `1.2.3`). Defined in [script-standard.md](../../rules/script-standard.md).

---

## Approach: Git pre-commit hook

A git `pre-commit` hook that detects staged script files and bumps the patch version automatically.

### How it works

1. `pre-commit` hook runs `git diff --cached --name-only`
2. Filters for staged `.sh` and `.ps1` files
3. For each file, checks if it contains a `SCRIPT_VER` field -- if not, skip it
4. Checks if the content actually changed (ignoring the `SCRIPT_VER` line itself)
5. Reads current `SCRIPT_VER`, increments patch (e.g. `0.1.0` -> `0.1.1`)
6. Updates the file in-place and re-stages it (`git add <file>`)

### What gets bumped

Any staged `.sh` or `.ps1` file that contains a `SCRIPT_VER` field. No path filtering -- every script follows the same standard, so every script gets the same auto-bump rule. This covers:

- `scripts-mac/` (including `tests/` subdirectories)
- `scripts-win/` (including `tests/` subdirectories)
- `docs/ai-developer/tools/`
- Any future script locations

### Change detection

The hook must avoid bumping files where the only change is the version line itself. To detect real changes:

```bash
# Strip the SCRIPT_VER line from both staged and HEAD versions, then compare
staged_content=$(git show ":$file" | grep -v 'SCRIPT_VER')
head_content=$(git show "HEAD:$file" 2>/dev/null | grep -v 'SCRIPT_VER')
if [ "$staged_content" = "$head_content" ]; then
    # Only the version changed -- skip
fi
```

### Patch increment logic

```bash
# Parse "0.1.0" -> bump patch -> "0.1.1"
current="0.1.0"
major=$(echo "$current" | cut -d. -f1)
minor=$(echo "$current" | cut -d. -f2)
patch=$(echo "$current" | cut -d. -f3)
new_ver="${major}.${minor}.$((patch + 1))"
```

For PowerShell files, the sed pattern must handle aligned whitespace:

```bash
# Bash: SCRIPT_VER="0.1.0"
sed -i "s/SCRIPT_VER=\"[^\"]*\"/SCRIPT_VER=\"$new_ver\"/" "$file"

# PowerShell: $SCRIPT_VER         = "0.1.0"
sed -i "s/^\(\\\$SCRIPT_VER *=  *\)\"[^\"]*\"/\1\"$new_ver\"/" "$file"
```

### Hook installation

The hook must be installed automatically in the devcontainer. Options:

1. **project-installs.sh** -- add a line that copies/symlinks the hook into `.git/hooks/`
2. **git config core.hooksPath** -- point to a `.githooks/` directory in the repo
3. **entrypoint.sh** -- devcontainer-toolbox upstream could support this

Option 2 (`core.hooksPath`) is cleanest -- the hook file lives in the repo and git uses it automatically:

```bash
# In project-installs.sh or entrypoint
git config core.hooksPath .githooks
```

Then the hook lives at `.githooks/pre-commit` and is version-controlled.

### Edge cases

- **New files** (no HEAD version): skip -- new files haven't changed, they were created. First bump happens on the next commit that modifies the file.
- **Amend commits**: version bumps again -- acceptable for patch versions
- **`--no-verify`**: bypasses the hook -- our CLAUDE.md already says not to skip hooks

---

## Answers to Open Questions

### New files

Only bump files that already exist in the previous commit (HEAD). A brand-new file hasn't "changed" -- it was created. It keeps whatever version the developer or template set (e.g. `0.1.0`). The hook only bumps on the second and subsequent commits that modify the file.

### Hook installation method

Git hooks are scripts that run automatically at certain points (before commit, before push, etc.). The problem is that `.git/hooks/` is local and not tracked by git -- so every developer must install hooks manually.

There are two ways to solve this:

**Option 1: `core.hooksPath` (recommended)**

Git has a config setting that tells it to look for hooks in a different directory. We create a `.githooks/` folder in the repo with our `pre-commit` script. Then we tell git to use it:

```bash
git config core.hooksPath .githooks
```

This one command (run once per clone, e.g. in `project-installs.sh`) makes git use our version-controlled hooks. The hook file at `.githooks/pre-commit` is tracked in the repo, so everyone gets the same hook. No manual copying needed.

**Option 2: Copy into `.git/hooks/`**

Copy the hook script into `.git/hooks/pre-commit` during container setup. Works, but the hook is not version-controlled in its installed location -- updates require re-copying.

**Decision**: Use `core.hooksPath`. Add `git config core.hooksPath .githooks` to `project-installs.sh`.

### Interaction with set-version tools

Keep it simple: the hook always bumps the patch version if the file content changed. If someone manually set the version to `0.2.0` using `set-version-*.sh`, the hook will bump it to `0.2.1` on the next commit that changes the file. This is correct -- the manual set established the new minor version, and the hook tracks patches from there.

---

## Additional: Script standards overview doc

As part of this work, create a user-facing document (e.g. `docs/SCRIPT-STANDARDS.md`) that explains:

- Every script has a version number (`SCRIPT_VER`) and prints it at startup
- Every script supports `-Help` / `--help` to show usage
- Patch versions are bumped automatically on every commit via a git pre-commit hook
- Minor and major versions are bumped manually by a human
- Links to the templates (`docs/ai-developer/templates/bash/`, `docs/ai-developer/templates/powershell/`)
- Links to the rules (`docs/ai-developer/rules/script-standard.md`, `rules/bash.md`)
- Links to the validation tools (`docs/ai-developer/tools/validate-bash.sh`, `validate-powershell.sh`)

This document is for ops team members who want to understand the conventions, not for AI developers (who read the rules directly).

---

## Next Steps

- [x] All questions answered
- [x] Create PLAN for implementation -- see [EXAMPLE-PLAN-auto-version-bump.md](EXAMPLE-PLAN-auto-version-bump.md)
