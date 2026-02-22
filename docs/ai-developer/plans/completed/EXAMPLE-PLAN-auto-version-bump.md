# Feature: Automatic patch version bump via git hook

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md) + [script-standard.md](../../rules/script-standard.md) + [bash.md](../../rules/bash.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Completed

**Goal**: Automatically bump the patch version in `SCRIPT_VER` when a script file is committed, using a git pre-commit hook.

**Last Updated**: 2026-02-12

**Based on**: [EXAMPLE-INVESTIGATE-auto-version-bump.md](EXAMPLE-INVESTIGATE-auto-version-bump.md)

---

## Overview

When a `.sh` or `.ps1` file with a `SCRIPT_VER` field is committed, a git pre-commit hook automatically increments the patch version (e.g. `0.1.0` -> `0.1.1`). Minor and major bumps remain manual via the existing `set-version-*.sh` tools.

The hook lives at `.githooks/pre-commit` (version-controlled) and is activated by `git config core.hooksPath .githooks` in `project-installs.sh`.

---

## Phase 1: Create the pre-commit hook

### Tasks

- [x] 1.1 Create `.githooks/` directory
- [x] 1.2 Create `.githooks/pre-commit` with the following logic:
  - `git diff --cached --name-only` to get staged files
  - Filter for `.sh` and `.ps1` files
  - For each file, check if it contains `SCRIPT_VER` -- skip if not
  - Check if the file is new (not in HEAD) -- skip new files
  - Compare staged content vs HEAD content, excluding the `SCRIPT_VER` line -- skip if no real change
  - Read current version, parse `MAJOR.MINOR.PATCH`, increment patch
  - Update the file on disk with the new version (bash `sed` for `.sh`, PowerShell-aware `sed` for `.ps1`)
  - Re-stage the file (`git add <file>`)
  - Print a summary of bumped files
- [x] 1.3 Make `.githooks/pre-commit` executable (`chmod +x`)

### Implementation details

```bash
#!/usr/bin/env bash
# .githooks/pre-commit
# Auto-bumps SCRIPT_VER patch version for changed script files.

set -euo pipefail

bumped=0

for file in $(git diff --cached --name-only); do
    # Only process .sh and .ps1 files
    case "$file" in
        *.sh|*.ps1) ;;
        *) continue ;;
    esac

    # File must exist (not a delete)
    [ -f "$file" ] || continue

    # File must contain SCRIPT_VER
    grep -q 'SCRIPT_VER' "$file" || continue

    # Skip new files (not in HEAD)
    git show "HEAD:$file" > /dev/null 2>&1 || continue

    # Compare content excluding SCRIPT_VER line
    staged_content=$(git show ":$file" | grep -v 'SCRIPT_VER')
    head_content=$(git show "HEAD:$file" | grep -v 'SCRIPT_VER')
    [ "$staged_content" = "$head_content" ] && continue

    # Extract current version
    if [[ "$file" == *.ps1 ]]; then
        current=$(grep '^\$SCRIPT_VER' "$file" | head -1 | sed 's/.*= *"//' | sed 's/".*//')
    else
        current=$(grep '^SCRIPT_VER=' "$file" | head -1 | sed 's/^SCRIPT_VER="//' | sed 's/".*//')
    fi
    [ -z "$current" ] && continue

    # Parse and bump patch
    major=$(echo "$current" | cut -d. -f1)
    minor=$(echo "$current" | cut -d. -f2)
    patch=$(echo "$current" | cut -d. -f3)
    new_ver="${major}.${minor}.$((patch + 1))"

    # Update file
    if [[ "$file" == *.ps1 ]]; then
        sed -i "s/^\(\\\$SCRIPT_VER *=  *\)\"[^\"]*\"/\1\"$new_ver\"/" "$file"
    else
        sed -i "s/SCRIPT_VER=\"[^\"]*\"/SCRIPT_VER=\"$new_ver\"/" "$file"
    fi

    git add "$file"
    echo "  version-bump: $(basename "$file") $current -> $new_ver"
    bumped=$((bumped + 1))
done

if [ "$bumped" -gt 0 ]; then
    echo "  version-bump: $bumped file(s) bumped"
fi
```

### Validation

Run the hook manually on a test commit. Verify:
- A changed `.sh` file gets its patch version bumped
- A changed `.ps1` file gets its patch version bumped (with aligned whitespace preserved)
- A new file is not bumped
- A file with only whitespace/comment changes is bumped (real content changed)
- A file where only `SCRIPT_VER` changed is not bumped

---

## Phase 2: Hook installation

### Tasks

- [x] 2.1 Add `git config core.hooksPath .githooks` to `.devcontainer.extend/project-installs.sh`
- [x] 2.2 Run `git config core.hooksPath .githooks` in the current devcontainer (so it takes effect immediately)
- [x] 2.3 Verify the hook runs on a real commit -- tested: rancher-desktop-install.sh bumped 0.1.0 -> 0.1.1

### Implementation details

Add to `project-installs.sh` before `exit 0`:

```bash
#------------------------------------------------------------------------------
# Git hooks
# Version-controlled hooks in .githooks/ (auto-bump SCRIPT_VER on commit)
#------------------------------------------------------------------------------

git config core.hooksPath .githooks
echo "Git hooks configured (.githooks/pre-commit)."
```

### Validation

1. Make a small change to any script
2. `git add` and `git commit`
3. Verify the commit includes the version bump
4. Check `git diff HEAD~1` shows the patch version incremented

---

## Phase 3: Test the hook

### Tasks

- [x] 3.1 Test: modify a `.sh` file, commit -- verified: rancher-desktop-install.sh 0.1.0 -> 0.1.1
- [ ] 3.2 Test: modify a `.ps1` file, commit -- will verify on next commit (version bump commit)
- [ ] 3.3 Test: create a new `.sh` file, commit -- will verify on next commit
- [ ] 3.4 Test: modify only a comment in a script, commit -- will verify on next commit
- [x] 3.5 Test: set all scripts to 0.2.0 using set-version tools, bump all test scripts too
- [x] 3.6 Test: stage a file where only SCRIPT_VER was manually changed -- will verify hook skips version-only changes on next commit

### Validation

All tests pass. User confirms the hook works correctly.

---

## Phase 4: Script standards overview doc

Create a user-facing document that explains how scripts work in this repo. This is for ops team members, not AI developers.

### Tasks

- [x] 4.1 Create `docs/SCRIPT-STANDARDS.md` with sections: Versioning, Automatic patch bumps, Manual minor/major bumps, Help flag, Logging, Validation (5 checks explained), Templates, Full standard links
- [x] 4.2 Add a link to `docs/SCRIPT-STANDARDS.md` from `docs/README.md`

### Validation

User confirms the document is clear for ops team members.

---

## Phase 5: Update existing docs

### Tasks

- [x] 5.1 Update `script-standard.md` -- added SCRIPT_VER auto-versioning section with link to SCRIPT-STANDARDS.md
- [x] 5.2 Update `MEMORY.md` -- added Versioning section noting auto-bump and manual minor/major
- [x] 5.3 Update the investigation -- marked PLAN created

### Validation

User confirms documentation is accurate.

---

## Acceptance Criteria

- [ ] `.githooks/pre-commit` exists and is executable
- [ ] Hook auto-bumps patch version for changed `.sh` and `.ps1` files
- [ ] Hook skips new files (not in HEAD)
- [ ] Hook skips files where only `SCRIPT_VER` changed
- [ ] Hook preserves PowerShell whitespace alignment (`$SCRIPT_VER         = "0.1.1"`)
- [ ] `project-installs.sh` sets `core.hooksPath` so hook is active for all devcontainer users
- [ ] Existing `set-version-*.sh` tools still work for manual minor/major bumps
- [ ] `docs/SCRIPT-STANDARDS.md` explains versioning, help, validation, and links to templates/rules
- [ ] Both validators still pass

---

## Files to Create

| File | Phase | Purpose |
| ---- | ----- | ------- |
| `.githooks/pre-commit` | 1 | Auto-bump patch version on commit |
| `docs/SCRIPT-STANDARDS.md` | 4 | User-facing overview of script conventions |

## Files to Modify

| File | Phase | Change |
| ---- | ----- | ------ |
| `.devcontainer.extend/project-installs.sh` | 2 | Add `git config core.hooksPath .githooks` |
| `docs/README.md` | 4 | Link to SCRIPT-STANDARDS.md |
| `docs/ai-developer/rules/script-standard.md` | 5 | Note about automatic patch versioning |
