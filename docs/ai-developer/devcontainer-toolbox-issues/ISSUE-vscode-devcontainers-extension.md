# Entrypoint should create .vscode/extensions.json for Dev Containers extension

## Problem

When a user opens a devcontainer-toolbox project in VS Code on a fresh machine, VS Code does not detect the `.devcontainer` folder because the **Dev Containers** extension (`ms-vscode-remote.remote-containers`) is not installed.

Without the extension:

- VS Code opens the repo as a normal local folder
- No "Reopen in Container" prompt appears
- The user has no idea the project is meant to run in a container

The extensions listed in `devcontainer.json` under `customizations.vscode.extensions` are installed **inside** the container. They do not help with this bootstrap problem. The Dev Containers extension must be on the **host** VS Code before `devcontainer.json` is even recognized.

## What is needed

The devcontainer-toolbox entrypoint should ensure `.vscode/extensions.json` in the workspace contains `ms-vscode-remote.remote-containers` in its `recommendations` array.

The logic must handle three cases:

1. **`.vscode/extensions.json` does not exist** -- create it with the recommendation
2. **File exists but does not include `ms-vscode-remote.remote-containers`** -- add it to the existing `recommendations` array
3. **File exists and already includes it** -- do nothing

Example for case 1 (create new):

```json
{
  "recommendations": [
    "ms-vscode-remote.remote-containers"
  ]
}
```

Example for case 2 (add to existing):

```json
{
  "recommendations": [
    "some-other.extension",
    "ms-vscode-remote.remote-containers"
  ]
}
```

This ensures existing recommendations are preserved and the Dev Containers extension is always present.

### Why the entrypoint?

- The entrypoint already runs on every container start
- It already manages workspace-level files (e.g. `.devcontainer.secrets/`)
- The `.vscode/` directory may not exist yet -- create it if needed
- JSON manipulation can be done with `jq` (available in the toolbox image)

## Who this affects

Every project that uses devcontainer-toolbox but was set up before this fix. New projects will be handled by `devcontainer-init` (which we are also updating to create this file). But existing projects need the entrypoint to backfill it.

## Use case

The `client-provisioning` repo (Azure DevOps) uses the devcontainer-toolbox. When a new team member cloned the repo on a fresh Windows PC with only VS Code installed, the devcontainer did not start. They had to manually search for and install the Dev Containers extension before anything worked.

## Related

- Investigation: `docs/ai-developer/plans/backlog/INVESTIGATE-devcontainer-first-open.md` in the `client-provisioning` repo
- VS Code docs: [Workspace Recommended Extensions](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
