# Git Hosting: Azure DevOps

Commands for managing PRs, merges, and work items on Azure DevOps using the `az` CLI. Use `az` commands (not `gh`) when the repo is hosted on Azure DevOps.

**Related:**

- [WORKFLOW.md](WORKFLOW.md) — The plan-to-implementation flow (references this file for platform-specific commands)

---

## Prerequisites

The `az` CLI and `azure-devops` extension must be installed. The easiest way is via the devcontainer toolbox:

```bash
dev-setup    # → Cloud Tools → Azure DevOps CLI
```

Or verify manually:

```bash
az --version
az extension show --name azure-devops
```

---

## Authentication

The recommended way to set up authentication is the config script:

```bash
bash /opt/devcontainer-toolbox/additions/config-azure-devops.sh
```

This interactively configures your PAT, organization, and project defaults. It stores everything in `.devcontainer.secrets/` so it survives container rebuilds — the toolbox entrypoint automatically restores it on startup.

The same PAT works for both `az devops` commands and `git clone`/`git push`.

Check your current configuration:

```bash
bash /opt/devcontainer-toolbox/additions/config-azure-devops.sh --show
```

### Manual setup (alternative)

If you prefer to configure manually, authentication uses a Personal Access Token (PAT) via the `AZURE_DEVOPS_EXT_PAT` environment variable.

Check if it's set:

```bash
echo "$AZURE_DEVOPS_EXT_PAT" | head -c 10
```

If not set:

1. Create a PAT at `https://dev.azure.com/YOUR_ORG/_usersSettings/tokens`
2. Store it in a file (recommended: `.devcontainer.secrets/env-vars/azure-devops-pat`):

   ```bash
   echo 'YOUR_PAT' > .devcontainer.secrets/env-vars/azure-devops-pat
   chmod 600 .devcontainer.secrets/env-vars/azure-devops-pat
   ```

3. Export it (or add to `~/.bashrc` for persistence):

   ```bash
   export AZURE_DEVOPS_EXT_PAT=$(cat .devcontainer.secrets/env-vars/azure-devops-pat)
   ```

Set organization and project defaults:

```bash
az devops configure --defaults \
  organization=https://dev.azure.com/YOUR_ORG \
  project=YOUR_PROJECT
```

---

## Pull Requests

### Create a PR

```bash
az repos pr create \
  --repository REPO_NAME \
  --source-branch feature/my-feature \
  --target-branch main \
  --title "Short title under 70 chars" \
  --description "$(cat <<'EOF'
## Summary
- What changed and why

## Test plan
- [x] How it was tested
EOF
)"
```

### Check PR status

```bash
az repos pr show --id <PR_ID> \
  --query "{status: status, mergeStatus: mergeStatus, closedDate: closedDate}" \
  -o table
```

### List open PRs

```bash
az repos pr list --repository REPO_NAME --status active -o table
```

---

## Merging

### Squash merge with auto-complete

```bash
az repos pr update --id <PR_ID> \
  --auto-complete true \
  --squash true \
  --delete-source-branch true
```

This sets the PR to auto-complete — it merges as soon as all policies pass. The source branch is deleted on the remote after merge.

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
az repos pr create \
  --repository REPO_NAME \
  --source-branch feature/my-feature \
  --target-branch main \
  --title "Add my feature" \
  --description "Summary of changes"

# 3. Squash merge (use PR ID from step 2 output)
az repos pr update --id <PR_ID> \
  --auto-complete true \
  --squash true \
  --delete-source-branch true

# 4. Verify merge completed
az repos pr show --id <PR_ID> \
  --query "{status: status, mergeStatus: mergeStatus}" \
  -o table

# 5. Switch to main and clean up
git checkout main
git pull
git branch -d feature/my-feature
```

---

## Other Useful Commands

### Repos

```bash
az repos list -o table
az repos show --repository REPO_NAME
```

### Work Items (Issues)

See [WORKFLOW.md — Working with Issues](WORKFLOW.md#working-with-issues) for the full triage and workflow process. This section covers the Azure DevOps-specific commands.

#### List open work items

```bash
az boards query --wiql "$(cat <<'EOF'
SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
FROM workitems
WHERE [System.State] <> 'Closed'
  AND [System.State] <> 'Done'
  AND [System.State] <> 'Removed'
ORDER BY [System.CreatedDate] DESC
EOF
)" -o table
```

#### View a work item

```bash
az boards work-item show --id <ITEM_ID>
```

#### Create a work item

```bash
az boards work-item create --type Task --title "Task title"
az boards work-item create --type Bug --title "Bug title"
```

#### Update work item state

```bash
az boards work-item update --id <ITEM_ID> --state Active
az boards work-item update --id <ITEM_ID> --state Resolved
az boards work-item update --id <ITEM_ID> --state Closed
```

**State flow:** New → Active → Resolved → Closed

#### Auto-link commits to work items

Include `AB#<ID>` in commit messages. Azure DevOps automatically links the commit to the work item:

```bash
git commit -m "Fix login timeout AB#1234"
```

When a PR with linked commits is completed with `--auto-complete true`, linked work items can be set to resolve automatically (configured in PR completion options).

#### Link in plan files

When creating a plan for a work item, add this to the plan header:

```markdown
**Azure DevOps Work Item**: AB#1234
```

#### Verify after merge

```bash
az boards work-item show --id <ITEM_ID> \
  --query "{state: fields.\"System.State\", title: fields.\"System.Title\"}" \
  -o table
# State should show "Resolved" or "Closed"
```

### Pipelines

#### Create a pipeline from YAML

```bash
az pipelines create \
  --name "Build Intune Packages" \
  --repository client-provisioning \
  --repository-type tfsgit \
  --branch main \
  --yml-path azure-pipelines.yml \
  --skip-first-run true
```

#### List pipelines

```bash
az pipelines list -o table
```

#### Show recent runs

```bash
# List recent runs for a pipeline
az pipelines run list --pipeline-id <ID> -o table

# Show details of a specific run
az pipelines run show --id <RUN_ID> -o table
```

#### Check build status

```bash
# Show result and status of a run
az pipelines run show --id <RUN_ID> \
  --query "{status: status, result: result, startTime: startTime, finishTime: finishTime}" \
  -o table
```

#### View build logs

```bash
# List log entries for a run
az pipelines runs artifact list --run-id <RUN_ID> -o table

# Download logs for a run
az pipelines runs artifact download --run-id <RUN_ID> --artifact-name drop --path ./logs
```

#### Manually trigger a run

```bash
az pipelines run --id <PIPELINE_ID> --branch main
```

#### Download artifacts

```bash
# List artifacts from a run
az pipelines runs artifact list --run-id <RUN_ID> -o table

# Download a specific artifact
az pipelines runs artifact download \
  --run-id <RUN_ID> \
  --artifact-name rancher-desktop \
  --path ./downloads
```

---

## Wiki (Publish Code as Wiki)

Azure DevOps can publish a folder from a repo directly as a wiki. No copying or syncing — when you push changes to the docs folder, the wiki updates automatically.

### Multi-repo setup

Each repo in the project publishes its own `docs/` folder as a separate code wiki. All wikis appear in the wiki dropdown, giving one place to browse documentation across all repos.

```text
Project wiki dropdown:
  ├── Repo A Docs        ← /docs from repo-a
  ├── Repo B Docs        ← /docs from repo-b
  └── Repo C Docs        ← /docs from repo-c
```

### Publish a repo's docs folder

```bash
az devops wiki create \
  --name "WIKI_NAME" \
  --type codewiki \
  --repository REPO_NAME \
  --mapped-path /docs \
  --version main
```

Repeat for each repo in the project, using a descriptive wiki name.

### List existing wikis

```bash
az devops wiki list -o table
```

### Delete a wiki

```bash
az devops wiki delete --wiki WIKI_NAME
```

### How the wiki maps to the repo

- **Folder structure = wiki structure** — subfolders become sections, markdown files become pages
- **`README.md`** in a folder becomes the landing page for that section
- **`.order` file** — controls page order within a folder (one filename per line, without `.md` extension)
- **One folder per wiki** — each `az devops wiki create` publishes one path from one repo

### Convention for new repos

When adding a new repo to the project, publish its docs as a wiki:

1. Put documentation in a `docs/` folder in the repo
2. Run `az devops wiki create` with `--mapped-path /docs`
3. Add a `.order` file in `docs/` to control page order

---

## Key Differences from GitHub

| Action    | GitHub (`gh`)      | Azure DevOps (`az`)                                              |
|-----------|--------------------|------------------------------------------------------------------|
| Create PR | `gh pr create`     | `az repos pr create --repository REPO_NAME`                      |
| List PRs  | `gh pr list`       | `az repos pr list --repository REPO_NAME`                        |
| Merge PR  | `gh pr merge`      | `az repos pr update --id <ID> --auto-complete true --squash true`|
| View PR   | `gh pr view <ID>`  | `az repos pr show --id <ID>`                                     |
| Auth      | `gh auth login`    | `AZURE_DEVOPS_EXT_PAT` env var                                   |
| List issues | `gh issue list --state open` | `az boards query --wiql "..."` |
| View issue  | `gh issue view 42` | `az boards work-item show --id 1234` |
| Auto-close  | `Fixes #42` in PR body | `AB#1234` in commits + PR auto-complete |
