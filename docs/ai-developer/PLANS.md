# Implementation Plans

How we plan, track, and implement features and fixes.

**Related:** [WORKFLOW.md](WORKFLOW.md) - End-to-end flow from idea to implementation

---

## Folder Structure

```
docs/ai-developer/plans/
├── backlog/      # Approved plans waiting for implementation
├── active/       # Currently being worked on (max 1-2 at a time)
└── completed/    # Done - kept for reference (includes EXAMPLE-* files)
```

### Flow

```
Idea/Problem → PLAN file in backlog/ → active/ → completed/
                       ↓
              (or INVESTIGATE file first if unclear)
```

---

## File Types

### PLAN-*.md

For work that is **ready to implement**. The scope is clear, the approach is known.

**When to create:**
- Bug fix with known solution
- Feature request with clear requirements
- Refactoring with defined scope

**Naming Conventions:**

| Format | Use Case | Example |
|--------|----------|---------|
| `PLAN-<short-name>.md` | Standalone plan, no specific order | `PLAN-fix-homebrew-check.md` |
| `PLAN-<nnn>-<short-name>.md` | Ordered sequence, indicates execution order | `PLAN-001-rancher-desktop-install.md` |

#### Ordered Plans (PLAN-nnn-*)

When an investigation produces multiple related plans that should be executed in a specific order, use **three-digit numbering** to indicate the sequence:

```
PLAN-001-rancher-desktop-install.md   # Must be done first
PLAN-002-rancher-desktop-config.md    # Depends on 001
PLAN-003-rancher-desktop-testing.md   # Depends on 002
```

**Benefits of ordered numbering:**
- Clear execution sequence at a glance
- Dependencies are implicit in the number order
- Easy to track progress through a large initiative
- Files sort naturally in file explorers

**When to use ordered numbering:**
- Investigation produces 3+ related plans
- Plans have sequential dependencies
- Work is part of a larger initiative

**When NOT to use ordered numbering:**
- Standalone bug fix or small feature
- Plans can be executed in any order
- Single plan from an investigation

### INVESTIGATE-*.md

For work that **needs research first**. The problem exists but the solution is unclear.

**When to create:**
- Complex refactoring where options need evaluation
- Bug with unknown root cause
- Feature requiring design decisions

**Naming:** `INVESTIGATE-<topic>.md`

Examples:
- `INVESTIGATE-homebrew-detection.md`
- `INVESTIGATE-jamf-parameter-passing.md`

**After investigation:** Create one or more PLAN files with the chosen approach.

---

## Plan Structure

Every plan has these sections:

### 1. Header (Required)

```markdown
# Plan Title

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog | Active | Blocked | Completed

**Goal**: One sentence describing what this achieves.

**Last Updated**: YYYY-MM-DD

**Issue**: #XX (GitHub) or AB#XXXX (Azure DevOps) — optional

```

The **RULES** blockquote ensures Claude Code reads the workflow and plan guidelines before starting work. The **UPDATE** reminder prevents drift — without it, Claude tends to implement without tracking progress in the plan file.

The **Issue** field links the plan back to the originating issue/work item. Use the format matching your git hosting platform.

### 2. Dependencies (If applicable)

```markdown
**Prerequisites**: PLAN-001 must be complete first
**Blocks**: PLAN-003 cannot start until this is done
**Priority**: High | Medium | Low
```

For ordered plans (PLAN-nnn-*), dependencies are often implicit in the number order. Only add explicit dependency notes when the relationship is non-obvious.

### 3. Problem Summary (Required)

What's wrong or what's needed. Be specific.

### 4. Phases with Tasks (Required)

Break work into phases. Each phase has:
- Numbered tasks
- A validation step at the end (usually user confirmation)

```markdown
## Phase 1: Setup

### Tasks

- [ ] 1.1 Copy template to new script folder
- [ ] 1.2 Fill in metadata fields
- [ ] 1.3 Run tests to confirm template passes

### Validation

User confirms phase is complete.

---

## Phase 2: Implementation

### Tasks

- [ ] 2.1 Implement main() logic
- [ ] 2.2 Add custom flags if needed
- [ ] 2.3 Run validation (see language rules for the specific command)

### Validation

User confirms script works correctly.
```

### 5. Acceptance Criteria (Required)

```markdown
## Acceptance Criteria

- [ ] Validation passes (see language rules)
- [ ] Code follows [script standard](../rules/script-standard.md) and language rules
- [ ] No lint errors
```

### 6. Implementation Notes (Optional)

Technical details, gotchas, code patterns to follow.

### 7. Files to Modify (Optional but helpful)

```markdown
## Files to Modify

- [List files to modify]
```

---

## Status Values

| Status | Meaning | Location |
|--------|---------|----------|
| `Backlog` | Approved, waiting to start | `backlog/` |
| `Active` | Currently being worked on | `active/` |
| `Blocked` | Waiting on something else | `backlog/` or `active/` |
| `Completed` | Done | `completed/` |

---

## Updating Plans During Implementation

**Critical:** Plans are living documents. Update them as you work.

### When starting a phase:

```markdown
## Phase 2: Implementation — IN PROGRESS
```

### When completing a task:

```markdown
- [x] 2.1 Update the template
- [ ] 2.2 Add custom flags
```

### When a phase is done:

```markdown
## Phase 2: Implementation — DONE
```

### When blocked:

```markdown
## Status: Blocked

**Blocked by**: Waiting for decision on approach
```

### When complete:

1. Update status: `## Status: Completed`
2. Add completion date: `**Completed**: YYYY-MM-DD`
3. Move file: `mv docs/ai-developer/plans/active/PLAN-xyz.md docs/ai-developer/plans/completed/`
4. (Optional) Close related issue if using issue tracking

---

## Validation

Every phase ends with validation. The simplest form is asking the user to confirm.

### Default: User Confirmation

Claude asks: "Phase 1 complete. Does this look good to continue?"

In the plan, this can be written as:

```markdown
### Validation

User confirms phase is complete.
```

### Optional: Automated Check

When a command can verify the work, include it:

```markdown
### Validation

```
# Run the language-specific validation command (see language rules)
# All checks should pass
```

User confirms output is correct.
```

### Key Point

Don't force automated validation when it's impractical. User confirmation is valid and often the best approach.

---

## Plan Templates

### Simple Bug Fix

```markdown
# Fix: [Bug Description]

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: [One sentence]

**Last Updated**: YYYY-MM-DD

**Issue**: #XX (GitHub) or AB#XXXX (Azure DevOps)

---

## Problem

[What's broken]

## Solution

[How to fix it]

---

## Phase 1: Fix

### Tasks

- [ ] 1.1 [Specific change]
- [ ] 1.2 [Another change]

### Validation

User confirms fix is correct.

---

## Acceptance Criteria

- [ ] Bug is fixed
- [ ] Validation passes
- [ ] No lint errors
```

### Feature Implementation

```markdown
# Feature: [Feature Name]

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: [One sentence]

**Last Updated**: YYYY-MM-DD

**Issue**: #XX (GitHub) or AB#XXXX (Azure DevOps)

---

## Overview

[What this feature does and why]

---

## Phase 1: [Setup/Preparation]

### Tasks

- [ ] 1.1 [Task]
- [ ] 1.2 [Task]

### Validation

User confirms phase is complete.

---

## Phase 2: [Core Implementation]

### Tasks

- [ ] 2.1 [Task]
- [ ] 2.2 [Task]

### Validation

User confirms phase is complete.

---

## Acceptance Criteria

- [ ] [Criterion]
- [ ] Validation passes
- [ ] Code follows script standard and language rules

---

## Files to Modify

- [List files to modify]
```

### Investigation

```markdown
# Investigate: [Topic]

> **RULES**: [WORKFLOW.md](../../WORKFLOW.md) + [PLANS.md](../../PLANS.md)
> **UPDATE AS YOU WORK**: Mark tasks `[x]`, add `— DONE` to phase headers, update status.

## Status: Backlog

**Goal**: Determine the best approach for [topic]

**Last Updated**: YYYY-MM-DD

**Issue**: #XX (GitHub) or AB#XXXX (Azure DevOps)

---

## Questions to Answer

1. [Question 1]
2. [Question 2]

---

## Current State

[What exists now]

---

## Options

### Option A: [Name]

**Pros:**
-

**Cons:**
-

### Option B: [Name]

**Pros:**
-

**Cons:**
-

---

## Recommendation

[After investigation, what do we do?]

---

## Next Steps

- [ ] Create PLAN-xyz.md with chosen approach
  - For multiple related plans, use ordered naming: PLAN-001-*, PLAN-002-*, etc.
```

---

## Working with Claude Code

See [WORKFLOW.md](WORKFLOW.md) for the complete flow from idea to implementation.

---

## Best Practices

1. **One active plan at a time** - finish before starting another
2. **Small phases** - easier to validate and recover from errors
3. **Specific tasks** - "Update line 42 in file.sh" not "Fix the thing"
4. **Runnable validation** - commands, not descriptions
5. **Update as you go** - the plan is the source of truth
6. **Keep completed plans** - they're documentation
