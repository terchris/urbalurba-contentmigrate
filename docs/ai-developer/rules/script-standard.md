# Script Standard

The universal rules that apply to **all** scripts in this repo, regardless of language. Bash, PowerShell, and any future languages must follow these conventions.

For language-specific syntax (how to implement these in bash, PowerShell, or TypeScript), see the language rules files:
- [bash.md](bash.md) — Bash scripts for macOS
- [powershell.md](powershell.md) — PowerShell scripts for Windows
- [typescript.md](typescript.md) — TypeScript CLI entry-point scripts

---

## Why This Standard Exists

Unlike application code (TypeScript, Python, C#), standalone scripts have no ecosystem for metadata, linting, or testing. Without conventions, every script looks different. This standard requires every script to embed the same metadata fields and follow the same patterns, which gives three concrete benefits:

1. **Scripts become machine-readable** — the 5 required metadata fields are simple `KEY="value"` lines that tools can extract with `grep`. This enables automated documentation generation, interactive menu systems that discover scripts by category, and CI/CD validation via pre-commit hooks.

2. **Every script is self-documenting** — the standard `--help` format and `log_start` startup message mean any script can be explored and its output is traceable in logs.

3. **Version tracking across deployments** — `SCRIPT_VER` in every file tells you exactly which version is deployed. Combined with a pre-commit hook that auto-bumps patch versions, updates are discoverable without manual version management.

---

## Script Types

Not all scripts do the same thing. The type of script determines which patterns apply.

| Type | Naming pattern | Purpose | Examples |
|------|---------------|---------|----------|
| **Install** | `install-*.sh` / `install-*.ps1` | Install tools, runtimes, CLIs, packages | Install kubectl, install Python, install VS Code extensions |
| **Config** | `config-*.sh` / `config-*.ps1` | Configure settings, credentials, environment | Set up git identity, configure Azure DevOps PAT, write config files |
| **Utility** | descriptive name | Run a task and produce output | Validate scripts, bump versions, generate reports |
| **Service** | `service-*.sh` / `service-*.ps1` | Manage background services or daemons | Start/stop a local API, manage a database process |

All types follow the same standard (metadata, help, logging, error codes). The difference is which **optional patterns** apply:

| Pattern | Install | Config | Utility | Service |
|---------|---------|--------|---------|---------|
| Idempotency check (skip if already done) | Yes | Yes | Usually no | Yes |
| `SCRIPT_CHECK_COMMAND` (verify success) | Recommended | Recommended | Usually no | Recommended |
| `--uninstall` flag (reverse the action) | Recommended | Sometimes | No | No |
| `--force` flag (redo even if done) | Optional | Optional | No | No |

### Install scripts

Install scripts should check whether the tool is already installed before doing work (idempotency). They should support `--uninstall` to cleanly remove what they installed. Both install and uninstall should be idempotent — safe to run when the tool is already installed or already removed.

### Config scripts

Config scripts should check whether the configuration is already applied. They may support `--show` to display the current configuration without changing anything. `--uninstall` makes sense when the configuration can be reversed (e.g., removing a credential), but not always.

### Utility scripts

Utility scripts just run and produce output. They typically don't need idempotency checks, `SCRIPT_CHECK_COMMAND`, or `--uninstall` — they don't change system state. Examples: the validation tools (`validate-bash.sh`, `validate-powershell.sh`) and version tools (`set-version-bash.sh`).

### Service scripts

Service scripts manage long-running processes. They typically support subcommands like `start`, `stop`, `restart`, `status` rather than flags like `--uninstall`. They should check whether the service is already running before starting it.

---

## Required Metadata Fields

Every script must define these 5 fields near the top. Validation tools check that all are present.

| Field | Format | Example |
|-------|--------|---------|
| `SCRIPT_ID` | lowercase, hyphenated | `"devcontainer-init"` |
| `SCRIPT_NAME` | Human-readable title | `"Devcontainer Init"` |
| `SCRIPT_VER` | Semantic version (auto-bumped, see below) | `"0.2.0"` |
| `SCRIPT_DESCRIPTION` | One-line description | `"Initialize devcontainer toolbox on a Mac"` |
| `SCRIPT_CATEGORY` | Uppercase category | `"DEVOPS"` |

### SCRIPT_CHECK_COMMAND (recommended)

A command that verifies the script's work was successful. Not required, but recommended for install and config scripts (see [Script Types](#script-types)).

```bash
# Bash
SCRIPT_CHECK_COMMAND="command -v kubectl >/dev/null 2>&1"

# PowerShell
$SCRIPT_CHECK_COMMAND = "Get-Command 'kubectl' -ErrorAction SilentlyContinue"
```

This field enables:
- **Idempotency** — the script can check before doing work: "is this already done?"
- **Post-install verification** — CI or test runners can execute the command after install to confirm success
- **Composite checks** — multiple tools can be checked with `||`:
  ```bash
  SCRIPT_CHECK_COMMAND="command -v kubectl >/dev/null 2>&1 || command -v helm >/dev/null 2>&1"
  ```

The validation tools check that this field is present if found, but do not fail if it is missing (it is recommended, not required).

### SCRIPT_CATEGORY values

Use an uppercase label that describes the script's purpose. Current categories in use:

| Category | Use for |
|----------|---------|
| `DEVOPS` | DevOps tooling, infrastructure setup, container management |

Add new categories as needed (e.g. `NETWORKING`, `SECURITY`, `MONITORING`). Keep them short, uppercase, and use underscores for multi-word names.

### SCRIPT_VER and automatic versioning

Patch versions are bumped automatically by a git pre-commit hook. When you commit a change to a script, the patch number increments (e.g. `0.2.0` -> `0.2.1`). You don't need to bump it manually.

Minor and major bumps are done manually using the set-version tools:

- `bash docs/ai-developer/tools/set-version-bash.sh <package>`
- `bash docs/ai-developer/tools/set-version-powershell.sh <package>`

#### Pre-commit hook

Projects should set up a git pre-commit hook that does two jobs on every commit:

1. **Validates** staged `.sh` and `.ps1` files — syntax, required metadata fields, shellcheck (if installed). Blocks the commit if validation fails.
2. **Auto-bumps** `SCRIPT_VER` patch version when a script has real content changes (not just a version bump). The file is re-staged automatically with the new version.

The hook should be smart about version bumping:
- Only process files staged for commit
- Skip new files (only bump existing files that already have a version)
- Compare content excluding the SCRIPT_VER line to detect real changes — don't bump if only the version changed
- Work on both macOS (BSD sed) and Linux (GNU sed)
- Handle both `.sh` and `.ps1` files
- Re-stage the file after bumping so the commit includes the new version

Setup pattern:

```bash
mkdir -p .githooks
# Create or copy the pre-commit hook into .githooks/pre-commit
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

See the [devcontainer-toolbox `.githooks/pre-commit`](https://github.com/terchris/devcontainer-toolbox/blob/main/.githooks/pre-commit) for a working reference implementation.

---

## Extended Metadata (Optional)

Projects that generate documentation websites or have interactive menu systems can define additional metadata fields. These are **optional** — the validation tools do not check for them. Only add them when the project has tooling that uses them.

```bash
# Bash
SCRIPT_TAGS="kubernetes devops containers"
SCRIPT_ABSTRACT="Install and configure Kubernetes CLI tools."
SCRIPT_LOGO="kubernetes-logo.webp"
SCRIPT_WEBSITE="https://kubernetes.io"
SCRIPT_SUMMARY="Installs kubectl, k9s, and helm. Configures kubeconfig for devcontainer networking with host-to-container forwarding."
SCRIPT_RELATED="install-dev-golang install-tool-docker"
```

```powershell
# PowerShell
$SCRIPT_TAGS         = "kubernetes devops containers"
$SCRIPT_ABSTRACT     = "Install and configure Kubernetes CLI tools."
$SCRIPT_LOGO         = "kubernetes-logo.webp"
$SCRIPT_WEBSITE      = "https://kubernetes.io"
$SCRIPT_SUMMARY      = "Installs kubectl, k9s, and helm. Configures kubeconfig for devcontainer networking."
$SCRIPT_RELATED      = "install-dev-golang install-tool-docker"
```

| Field | Purpose | Guidelines |
|-------|---------|------------|
| `SCRIPT_TAGS` | Search keywords for discovery | Space-separated, lowercase |
| `SCRIPT_ABSTRACT` | Brief description for listings | 50-150 characters, 1-2 sentences |
| `SCRIPT_LOGO` | Logo filename for documentation site | Place in your project's static assets folder |
| `SCRIPT_WEBSITE` | Official URL for the tool | Must start with `https://` |
| `SCRIPT_SUMMARY` | Detailed description for detail pages | 150-500 characters, 3-5 sentences |
| `SCRIPT_RELATED` | Related script IDs for cross-linking | Space-separated SCRIPT_ID values |

### How these are used

- **Documentation generation** — a doc generator (like devcontainer-toolbox's `dev-docs`) scans scripts, extracts metadata, and generates web pages. `SCRIPT_ABSTRACT` becomes the listing description, `SCRIPT_SUMMARY` becomes the detail page, `SCRIPT_TAGS` enables search.
- **Menu systems** — an interactive installer (like devcontainer-toolbox's `dev-setup`) uses `SCRIPT_NAME`, `SCRIPT_DESCRIPTION`, and `SCRIPT_CATEGORY` from the core fields to build menus. Extended fields add richer information.
- **JSON inventory** — a generator can produce `tools.json` with all script metadata for use by websites or APIs.

These fields are **not used at runtime** by the scripts themselves. They exist only for tooling that reads the script source to extract information.

---

## Standard Help Format

Every script must support a help flag (`-h`/`--help` for bash, `-Help` for PowerShell). The output must follow this structure:

```
<SCRIPT_NAME> (v<SCRIPT_VER>)
<SCRIPT_DESCRIPTION>

Usage:
  <SCRIPT_ID> [options]

Options:
  -h, --help  Show this help message

Metadata:
  ID:       <SCRIPT_ID>
  Category: <SCRIPT_CATEGORY>
```

The validation tool checks:
- First line contains `SCRIPT_NAME (vSCRIPT_VER)`
- `SCRIPT_DESCRIPTION` appears in the output
- A `Metadata:` section exists with `ID:` and `Category:` fields

Scripts may add extra sections (Arguments, Examples, Prerequisites, etc.) between Options and Metadata.

---

## Standard Logging

**Do not use raw print/echo/Write-Host for output. Always use the logging functions.**

Every message the script prints must go through a logging function. They add timestamps and severity levels, which makes log files useful for debugging.

| Function | Use for |
|----------|---------|
| `log_info` | Status updates, descriptions, instructions |
| `log_success` | Something worked: "App installed", "Profile written" |
| `log_error` | Something failed: "ERR002: Failed to download..." |
| `log_warning` | Non-fatal issues: "Restart required", "tool not found" |

The output format is: `[HH:MM:SS] LEVEL  message`

The only acceptable uses of raw output are:
- Blank lines for visual separation
- Separator lines for formatting
- Inside the help function's heredoc/here-string

See the language rules file for the exact function implementations.

### Inline vs shared library

There are two ways to include the logging functions in your scripts:

**Inline (default)** — copy the functions directly into each script from the template. Every script is self-contained and works anywhere, even if copied to another machine.

**Shared library** — extract the logging functions into a `lib/logging.sh` (or `lib/logging.ps1`) that scripts source at runtime. Changing the log format in one place updates all scripts.

| Approach | Use when | Trade-off |
|----------|----------|-----------|
| Inline (from template) | 1-3 scripts, scripts meant to be copied individually | Self-contained, but format changes require updating every script |
| Shared library | 4+ scripts in the same project | Single source of truth, but scripts depend on the library file being present |

For projects that use a shared library, the pattern is:

```bash
# Near the top of each script, after metadata
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/lib/logging.sh"
```

The shared library can also add features beyond what the inline functions provide. Start with the inline functions from the template and extract to a shared library when you have enough scripts to justify it.

### File logging (optional)

For projects that need installation logs or audit trails, the shared library can add **dual output** — writing to both terminal and log file simultaneously:

```bash
# In lib/logging.sh — add after the logging function definitions
LOG_DIR="${LOG_DIR:-/tmp/my-project-logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(basename "$0" .sh)-$(date +%Y%m%d-%H%M%S).log"

# Redirect all stdout and stderr to both terminal and log file
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "Logging to: $LOG_FILE"
```

This captures complete output for debugging without requiring the user to redirect output manually. Every `log_info`, `log_error`, etc. call is written to both the terminal and the log file.

Use file logging when:
- Scripts run unattended and you need to review results later
- Installation/deployment scripts where a failure audit trail is important
- Scripts where multiple tools are installed in sequence and you need to see the full history

Don't use file logging for:
- Utility scripts that produce output the user pipes to other commands
- Short scripts where terminal output is sufficient

---

## Startup Message

Every script must print its name and version as the first log line when it starts running. Use the `log_start` function, which is defined alongside the other logging functions:

| Language | Definition | Call |
|----------|-----------|------|
| Bash | `log_start() { log_info "Starting: $SCRIPT_NAME Ver: $SCRIPT_VER"; }` | `log_start` |
| PowerShell | `function log_start { log_info "Starting: $SCRIPT_NAME Ver: $SCRIPT_VER" }` | `log_start` |

Output:
```
[17:38:34] INFO  Starting: Devcontainer Initialization Ver: 0.1.0
```

The validation tool checks that the source contains the exact string `"Starting: $SCRIPT_NAME Ver: $SCRIPT_VER"` (present inside the function definition).

Call `log_start` in the main execution section, **after** the help check (so it does not print when the user runs with `-h`/`-Help`).

---

## Unique Error Identifiers

Every error log call must include a unique error code in the format `ERR001`, `ERR002`, etc. Error codes are unique **within each script** (not across the repo). This lets the ops team identify exactly which error occurred — especially when users report errors over the phone.

Rules:
- Start at `ERR001` in each script and increment sequentially
- Detail lines (captured stderr) use the same code as their parent error
- The code goes at the start of the message, before the description
- Keep codes sequential — don't skip numbers

When a user calls and says "I got ERR005", you can immediately find the exact error in the exact script.

---

## No Hardcoded Values

Put all URLs, paths, filenames, and defaults in a CONFIGURATION section as variables. Functions should only reference variables — never hardcode values inline.

This makes scripts easier to maintain — changing a URL or path means editing one line at the top, not hunting through functions.

---

## Verify Every Action

Never assume a command succeeded — verify the result. If a command fails silently, the script must detect that and exit with an error.

Apply this to all side effects: file/directory removal, file creation, downloads, mounts, copies, process termination. If you can check whether it worked, check it.

---

## Idempotency

Scripts that change system state (install, config, service types) must be safe to run multiple times. The pattern is: **check first, skip if already done, proceed if needed.**

### Install scripts

Check whether the tool is already installed before doing work:

```bash
# Bash
if command -v kubectl >/dev/null 2>&1; then
    log_info "kubectl already installed"
    exit 0
fi
```

```powershell
# PowerShell
if (Get-Command 'kubectl' -ErrorAction SilentlyContinue) {
    log_info "kubectl already installed"
    exit 0
}
```

If the script has `SCRIPT_CHECK_COMMAND`, use it for the idempotency check.

### Config scripts

Check whether the configuration is already applied:

```bash
# Bash — check if a config file already has the right content
if grep -qF "my-setting=true" "$config_file" 2>/dev/null; then
    log_info "Configuration already applied"
    exit 0
fi
```

```powershell
# PowerShell — check if a registry key already has the right value
$current = Get-ItemPropertyValue -Path $regPath -Name $settingName -ErrorAction SilentlyContinue
if ($current -eq $expectedValue) {
    log_info "Configuration already applied"
    exit 0
}
```

### Uninstall idempotency

Uninstall operations should also be idempotent — don't fail if the tool is already removed:

```bash
# Bash — safe to run even if file doesn't exist
sudo rm -f /usr/local/bin/tool    # -f means no error if missing
```

```powershell
# PowerShell — SilentlyContinue means no error if missing
Remove-Item -Path $toolPath -Force -ErrorAction SilentlyContinue
```

---

## Capture Error Output

When a command fails, the ops team needs to know **why** it failed. Capture the error output and include it in the error log. This is critical for commands that can fail for multiple reasons (downloads, file operations, system commands).

For cleanup commands where failure is acceptable, capturing error output is not needed.

---

## Check Commands Before Using Them

If a script depends on a command that is **not** part of the standard OS install, check that it exists before using it and give a clear error if it's missing.

Put required command checks early in the script, before it does any work.

Optional commands should fall back gracefully with a warning.

---

## Package Structure

Every script folder is a **package**. Each package groups related deployment scripts together with their documentation and tests.

### Required files

| File | Purpose |
|------|---------|
| `README.md` | What the package does, how to use it, examples |
| At least one script | The deployment script(s) |

### Recommended files

| File | Purpose |
|------|---------|
| `TESTING.md` | How to test on a real machine (or target environment) |
| `tests/` folder | Functional test scripts that verify the scripts work |

### Terminology

| Term | Meaning |
|------|---------|
| **Package** | A script folder with its scripts, docs, and tests |
| **Validation** | Checks that scripts follow the standard (syntax, help, metadata, lint) — run via language-specific validation tools |
| **Tests** | Functional tests that verify scripts actually work on a target machine — live in `<package>/tests/` |

---

## Checklist Before Committing

- [ ] Script follows the standard (metadata, logging, help, argument parsing)
- [ ] All 5 metadata fields are set
- [ ] Help flag produces standard format
- [ ] Validation passes for every folder containing changed scripts
- [ ] No lint errors
- [ ] Script is idempotent (safe to run twice)
- [ ] Every action is verified (file created? directory removed? process stopped?)
- [ ] All error logs have unique error identifiers (`ERR001`, `ERR002`, etc.)
- [ ] Logging uses standard functions — no raw output
