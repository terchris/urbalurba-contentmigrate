# Devcontainer Toolbox Issues

This folder contains issue and feature request drafts for the [devcontainer-toolbox](https://github.com/terchris/devcontainer-toolbox) project.

The devcontainer-toolbox is open source and contributions are welcome -- bug reports, feature requests, and pull requests.

## How to use these files

The markdown files here are **examples** of how to write clear, actionable issues for the devcontainer-toolbox maintainers. Use them as templates when you need to report a bug or request a new feature:

1. Copy an existing file as a starting point
2. Follow the naming convention: `ISSUE-<short-name>.md`
3. Include the sections described below
4. Submit the issue (see "How to submit" below)

## What to include

- **Problem** -- what is missing or broken
- **What is needed** -- specific changes, packages, commands, or behavior
- **Use case** -- why this matters and who it affects
- **Suggested metadata** -- `SCRIPT_ID`, `SCRIPT_NAME`, etc. (if requesting a new tool)
- **Related** -- links to existing issues, scripts, or documentation

## How to submit

**AI assistants (Claude Code) should submit issues directly** when `gh` is authenticated. Write the issue file first, then submit it:

```bash
gh issue create --repo terchris/devcontainer-toolbox \
  --title "Short description of the issue" \
  --body-file docs/ai-developer/devcontainer-toolbox-issues/ISSUE-my-issue.md
```

Check authentication with `gh auth status`. If not authenticated, ask the user to run `gh auth login` first.

**Manually:** Open [github.com/terchris/devcontainer-toolbox/issues](https://github.com/terchris/devcontainer-toolbox/issues) and paste the markdown content.

## Example issues

These files show the expected format and level of detail:

| File | Type | What it demonstrates |
|------|------|---------------------|
| `ISSUE-azure-devops-cli.md` | Feature request | Requesting a new tool — includes problem, what's needed, use case, suggested metadata |
| `ISSUE-vscode-devcontainers-extension.md` | Bug / improvement | Fixing a bootstrap problem — includes problem, three cases to handle, who's affected |

## Where to submit

Open issues and pull requests at: **<https://github.com/terchris/devcontainer-toolbox>**
