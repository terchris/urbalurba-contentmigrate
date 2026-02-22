# Devcontainer Toolbox

This repo's devcontainer is built on the **devcontainer-toolbox** — a modular devcontainer with installable tools, runtimes, and services.

---

## Quick Commands

| Command | What it does |
|---------|-------------|
| `dev-env` | Show installed tools, runtimes, services, and environment info |
| `dev-tools` | Output the complete tool inventory as JSON (machine-readable) |
| `dev-setup` | Interactive menu to install/uninstall tools and manage services |
| `dev-help` | List all available `dev-*` commands |
| `dev-services` | Manage background services (start, stop, status, logs) |
| `dev-log` | Display the container startup log |
| `dev-update` | Update devcontainer-toolbox to latest version |

Run any command with `--help` for more details.

---

## Discovering What's Installed

Run `dev-env` to see everything currently available in the container — runtimes, tools, services, and configurations.

---

## Tool Inventory (machine-readable)

`dev-tools` outputs the complete tool inventory as JSON. This is the primary way for AI assistants and scripts to discover available tools.

```bash
# Full JSON inventory
dev-tools

# Pretty-printed (requires jq)
dev-tools --pretty

# Count available tools
dev-tools | jq '.tools | length'

# List all tool IDs
dev-tools | jq '.tools[] | .id'

# Find tools by type (install, config, service)
dev-tools | jq '.tools[] | select(.type == "install")'

# Find tools by category
dev-tools | jq '.tools[] | select(.category == "CLOUD_TOOLS") | .name'

# Find tools by tag
dev-tools | jq '.tools[] | select(.tags[]? == "kubernetes") | {id, name}'

# Check what packages a tool installs
dev-tools | jq '.tools[] | select(.id == "dev-ai-claudecode") | .packages'
```

Each tool entry in the JSON contains:

| Field | Description |
|-------|-------------|
| `id` | Tool identifier (matches `install-<id>.sh`) |
| `type` | `install`, `config`, or `service` |
| `name` | Human-readable name |
| `description` | One-line description |
| `category` | e.g. `AI_TOOLS`, `LANGUAGE_DEV`, `CLOUD_TOOLS` |
| `tags` | Searchable keywords |
| `summary` | Longer description of what the tool provides |
| `checkCommand` | Command to verify if the tool is installed |
| `packages` | What gets installed (system, node, python, etc.) |
| `extensions` | VS Code extensions included |

Use `dev-tools --generate` to regenerate the inventory after installing new tools.

---

## Tool Registry (tools.json)

The file `/opt/devcontainer-toolbox/manage/tools.json` contains the complete registry of all tools, config scripts, and services available in the devcontainer-toolbox. Read this file to discover what can be installed and configured, including tool IDs, descriptions, package lists, and install commands.

This is the same data returned by `dev-tools`, but reading the file directly is faster and works without running a command.

---

## Examining a Tool Before Installing

Install scripts live at `/opt/devcontainer-toolbox/additions/`. Each tool has an install script named `install-<tool-id>.sh`.

To see what a tool installs without actually installing it:

```bash
bash /opt/devcontainer-toolbox/additions/install-<tool-id>.sh --help
```

To list all available install scripts:

```bash
ls /opt/devcontainer-toolbox/additions/install-*.sh
```

---

## Installing a Tool

**Interactively:** Run `dev-setup` and select from the menu.

**Directly:** Run the install script:

```bash
bash /opt/devcontainer-toolbox/additions/install-<tool-id>.sh
```

---

## Configuration Scripts

Config scripts set up credentials and identity inside the devcontainer. They all support the same interface:

- `(no args)` — interactive setup
- `--show` — display current configuration
- `--verify` — non-interactive restore from `.devcontainer.secrets/`

| Script | What it configures | Persistence |
|--------|-------------------|-------------|
| `config-git.sh` | Git `user.name` and `user.email` | `.devcontainer.secrets/env-vars/.git-identity` |
| `config-azure-devops.sh` | Azure DevOps PAT, organization, project | `.devcontainer.secrets/env-vars/azure-devops-pat` |

Run a config script:

```bash
bash /opt/devcontainer-toolbox/additions/config-git.sh
bash /opt/devcontainer-toolbox/additions/config-azure-devops.sh
```

**Auto-restore on startup:** The toolbox entrypoint automatically runs `--verify` on all config scripts when the container starts. If your credentials are saved in `.devcontainer.secrets/`, they are restored seamlessly after every rebuild.

---

## Auto-Enabled Tools

Tools listed in `.devcontainer.extend/enabled-tools.conf` are automatically installed when the container is created or rebuilt.

```
# Format: one tool identifier per line (matches the tool-id in install-<tool-id>.sh)
dev-bash
dev-ai-claudecode
```

To auto-enable a new tool, add its identifier to this file. The `dev-setup` menu also updates this file when you install tools.

---

## Reporting Bugs and Requesting New Tools

The devcontainer-toolbox is open source at [github.com/terchris/devcontainer-toolbox](https://github.com/terchris/devcontainer-toolbox). Bug reports and feature requests are welcome.

When you find a bug or need a new tool:

1. Write up the issue as a markdown file in [`devcontainer-toolbox-issues/`](devcontainer-toolbox-issues/). See the [README](devcontainer-toolbox-issues/README.md) in that folder for the format and naming convention.
2. Submit it to GitHub using `gh`:

```bash
gh issue create --repo terchris/devcontainer-toolbox \
  --title "Short description" \
  --body-file docs/ai-developer/devcontainer-toolbox-issues/ISSUE-my-issue.md
```

AI assistants should do both steps — write the issue file and submit it — when `gh` is authenticated.

---

## Temporary Project Installs

Tools that are not yet available in the toolbox can be installed via `.devcontainer.extend/project-installs.sh`. This script runs after standard tools and persists across container rebuilds.

Currently no temporary installs — all tools are available via the toolbox and listed in `enabled-tools.conf`.
