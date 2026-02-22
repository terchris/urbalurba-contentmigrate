# Git Hosting: GitHub

Commands for managing PRs, merges, and issues on GitHub using the `gh` CLI. Use `gh` commands (not `az`) when the repo is hosted on GitHub.

**Related:**

- [WORKFLOW.md](WORKFLOW.md) — The plan-to-implementation flow (references this file for platform-specific commands)

---

## Prerequisites

The `gh` CLI must be installed and authenticated.

```bash
gh --version
gh auth status
```

If not authenticated:

```bash
gh auth login
```

---

## Authentication

The `gh` CLI supports multiple authentication methods:

- **Interactive login**: `gh auth login` — opens a browser for OAuth
- **Token**: `gh auth login --with-token < token-file`
- **Environment variable**: `export GH_TOKEN=your-token`

Check your current status:

```bash
gh auth status
```

---

## Pull Requests

### Create a PR

```bash
gh pr create \
  --title "Short title under 70 chars" \
  --body "$(cat <<'EOF'
## Summary
- What changed and why

## Test plan
- [x] How it was tested
EOF
)"
```

The `gh` CLI automatically uses the current branch as the source and the default branch (usually `main`) as the target.

### Check PR status

```bash
gh pr view
gh pr checks
```

### List open PRs

```bash
gh pr list
```

### View a specific PR

```bash
gh pr view <PR_NUMBER>
```

---

## Merging

### Squash merge

```bash
gh pr merge --squash --delete-branch
```

This squash merges the PR and deletes the source branch on the remote.

### After merge: switch to main and clean up

```bash
git checkout main
git pull
git branch -d feature/my-feature
```

---

## Full Workflow Example

```bash
# 1. Create and push feature branch
git checkout -b feature/my-feature
# ... make changes, commit ...
git push -u origin feature/my-feature

# 2. Create PR
gh pr create \
  --title "Add my feature" \
  --body "Summary of changes"

# 3. Squash merge (deletes remote branch)
gh pr merge --squash --delete-branch

# 4. Switch to main and clean up
git checkout main
git pull
git branch -d feature/my-feature
```

---

## Issues

See [WORKFLOW.md — Working with Issues](WORKFLOW.md#working-with-issues) for the full triage and workflow process. This section covers the GitHub-specific commands.

### List open issues

```bash
gh issue list --state open
```

### View an issue

```bash
gh issue view <ISSUE_NUMBER>
```

### Create an issue

```bash
gh issue create --title "Short description" --body "Details of the issue"
```

### Create an issue from a file

```bash
gh issue create --title "Short description" --body-file path/to/issue.md
```

### Close an issue

```bash
gh issue close <ISSUE_NUMBER>
```

### Auto-close issues from PRs

Include one of these keywords followed by the issue number in the PR body. GitHub automatically closes the issue when the PR is merged:

```
Fixes #42
Closes #42
Resolves #42
```

Multiple issues can be closed in one PR:

```
Fixes #42, fixes #43
```

### Link in plan files

When creating a plan for an issue, add this to the plan header:

```markdown
**GitHub Issue**: #42
```

### Verify after merge

```bash
gh issue view 42
# State should show "CLOSED"
```

---

## Releases

### Create a release

```bash
gh release create v1.0.0 --title "v1.0.0" --notes "Release notes here"
```

### List releases

```bash
gh release list
```

---

## Other Useful Commands

### Repository info

```bash
gh repo view
gh repo view --web    # opens in browser
```

### Actions / CI

```bash
gh run list           # list recent workflow runs
gh run view <RUN_ID>  # view details of a run
gh run watch          # watch a running workflow
```

---

## Key Differences from Azure DevOps

| Action    | GitHub (`gh`)                        | Azure DevOps (`az`)                                              |
|-----------|--------------------------------------|------------------------------------------------------------------|
| Create PR | `gh pr create`                       | `az repos pr create --repository REPO_NAME`                      |
| List PRs  | `gh pr list`                         | `az repos pr list --repository REPO_NAME`                        |
| Merge PR  | `gh pr merge --squash`               | `az repos pr update --id <ID> --auto-complete true --squash true`|
| View PR   | `gh pr view`                         | `az repos pr show --id <ID>`                                     |
| Auth      | `gh auth login`                      | `AZURE_DEVOPS_EXT_PAT` env var                                   |
| List issues | `gh issue list --state open`       | `az boards query --wiql "..."` |
| View issue  | `gh issue view 42`                 | `az boards work-item show --id 1234` |
| Auto-close  | `Fixes #42` in PR body             | `AB#1234` in commits + PR auto-complete |
