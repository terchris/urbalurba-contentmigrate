# Need lightweight Azure DevOps tool for git PR and merge from CLI

## Problem

The existing Azure toolbox scripts (`tool-azure-dev` and `tool-azure-ops`) both install the Azure CLI, but they come bundled with heavy extras that are not needed for basic git workflow:

- **tool-azure-dev**: Functions Core Tools, Azurite, 8 VS Code extensions
- **tool-azure-ops**: PowerShell, Az/Graph/Exchange modules, 7 VS Code extensions

When working with Azure DevOps repos (not GitHub), there is no way to create pull requests or merge from the CLI without `az`. The `gh` CLI only works with GitHub. Right now the only option is to use the Azure DevOps web UI, which breaks the flow.

## What is needed

A lightweight install script (e.g. `install-tool-azure-devops.sh`) that installs **only**:

1. **Azure CLI** (`az`) — from the Microsoft APT repository
2. **azure-devops extension** (`az extension add --name azure-devops`)

This enables:

- `az repos pr create` — create pull requests
- `az repos pr update --auto-complete` — set auto-complete (merge when checks pass)
- `az repos pr list` — list PRs
- `az repos pr show` — show PR details

No VS Code extensions, no PowerShell modules, no Functions Core Tools, no Azurite.

## Authentication

The `az` CLI requires authentication. The install script should probably just print a note after install telling the user to run `az login` or configure a PAT with `az devops login`. This is similar to how `install-dev-ai-claudecode.sh` handles API key setup — the install script installs the tool, the user configures credentials separately.

## Use case

The `client-provisioning` repo (Azure DevOps, not GitHub) uses the devcontainer-toolbox. Claude Code can push branches but cannot create PRs or merge because there is no `az` CLI available. Installing either of the existing Azure tools would pull in a lot of unnecessary packages.

## Suggested metadata

```bash
SCRIPT_ID="tool-azure-devops"
SCRIPT_NAME="Azure DevOps CLI"
SCRIPT_DESCRIPTION="Installs Azure CLI with azure-devops extension for git PR, merge, and repo management"
SCRIPT_CATEGORY="CLOUD_TOOLS"
SCRIPT_TAGS="azure devops git pr merge repos"
SCRIPT_RELATED="tool-azure-dev tool-azure-ops"
```
