# Bash Script Rules

Bash-specific syntax and conventions for scripts in this repo. **Read [script-standard.md](script-standard.md) first** — it defines the universal rules (metadata, help format, logging, error codes, etc.) that this file shows how to implement in bash.

---

## The Golden Rule

**Every `.sh` file in this repo must follow the standard script template. No exceptions.**

This applies to:
- Main deployment scripts
- Test scripts
- Helper/utility scripts
- Library scripts (sourced by other scripts)
- Test runner scripts

Library scripts that are sourced (not run directly) still need metadata, logging, help, and argument parsing so that `bash script.sh -h` works — the validation tool checks this.

---

## Step-by-Step

### 1. Copy the template

```bash
mkdir -p scripts-mac/my-new-folder
cp docs/ai-developer/templates/bash/script-template.sh scripts-mac/my-new-folder/my-script.sh
```

### 2. Fill in the metadata

Edit the 5 required metadata fields at the top of the script:

```bash
SCRIPT_ID="my-script"
SCRIPT_NAME="My Script"
SCRIPT_VER="0.0.1"
SCRIPT_DESCRIPTION="One-line description of what this script does."
SCRIPT_CATEGORY="DEVOPS"
```

### 3. Implement main()

Add your logic to the `main()` function at the bottom of the script. The template provides the standard structure — keep the sections in order.

### 4. Validate

```bash
bash docs/ai-developer/tools/validate-bash.sh my-new-folder
```

Fix any failures before committing.

---

## Bash Logging Functions

The bash implementation of the standard logging functions. Copy them exactly from the template — don't modify the format.

```bash
log_time()    { date +%H:%M:%S; }
log_info()    { echo "[$(log_time)] INFO  $*" >&2; }
log_success() { echo "[$(log_time)] OK    $*" >&2; }
log_error()   { echo "[$(log_time)] ERROR $*" >&2; }
log_warning() { echo "[$(log_time)] WARN  $*" >&2; }
```

The only acceptable uses of raw `echo` are:
- `echo ""` for blank line separators (formatting)
- Separator lines like `echo "================================================================"` (formatting)
- Inside the `help()` heredoc (which uses `cat >&2 << EOF`)

---

## Bash Help Function

The `-h` flag must produce output matching the standard help format (see [script-standard.md](script-standard.md)).

```bash
help() {
    cat >&2 << EOF
$SCRIPT_NAME (v$SCRIPT_VER)
$SCRIPT_DESCRIPTION

Usage:
  $SCRIPT_ID [options]

Options:
  -h, --help  Show this help message

Metadata:
  ID:       $SCRIPT_ID
  Category: $SCRIPT_CATEGORY
EOF
}
```

Scripts may add extra sections (Arguments, Examples, Prerequisites, etc.) between Options and Metadata.

---

## Bash Template Sections

The template (`docs/ai-developer/templates/bash/script-template.sh`) has these sections in order. Keep this structure:

| Section | What it contains | Required for |
|---------|-----------------|--------------|
| SCRIPT METADATA | The 5 required metadata fields | All scripts |
| CONFIGURATION | Variables for URLs, paths, defaults — no hardcoded values in functions | Scripts with configurable values |
| LOGGING | Standard logging functions | All scripts |
| HELP | The `help()` function — do not change the structure | All scripts |
| ARGUMENT PARSING | Flag handling (`-h`, `--help`, plus your custom flags) | All scripts |
| HELPER FUNCTIONS | Your custom functions | As needed |
| MAIN | The `main()` entry point | Standalone scripts (not libraries) |

**Library scripts** (sourced by other scripts) must still have METADATA, LOGGING, HELP, and ARGUMENT PARSING sections. They skip MAIN since their code runs when sourced. The argument parsing ensures `bash library.sh -h` works for the validation tool.

---

## Bash Argument Parsing

```bash
while [ "${1:-}" != "" ] && [[ "${1:-}" == -* ]]; do
    case "$1" in
        -h|--help)
            help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=1
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done
```

If you add flags, document them in the `help()` function under the Options section.

### --uninstall flag (install scripts)

Install scripts should support `--uninstall` to cleanly reverse what they installed (see [Script Types](script-standard.md#script-types)). The pattern uses a global flag that each function checks:

```bash
UNINSTALL_MODE=0

while [ "${1:-}" != "" ] && [[ "${1:-}" == -* ]]; do
    case "$1" in
        -h|--help)
            help
            exit 0
            ;;
        --uninstall)
            UNINSTALL_MODE=1
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

install_tool() {
    if [ "${UNINSTALL_MODE}" -eq 1 ]; then
        sudo rm -f /usr/local/bin/tool
        log_success "tool removed"
        return
    fi
    # ... install logic
}
```

Key points:
- `UNINSTALL_MODE` is set early and checked in every function that changes system state
- Both install and uninstall are idempotent — safe to run when already installed or already removed
- Document `--uninstall` in the help function under Options

---

## Bash Error Capture Pattern

```bash
# Bad — logs that it failed but not why
if ! curl -fSL -o "$tmp_file" "$url"; then
    log_error "Failed to download from $url"
    exit 1
fi

# Good — captures and logs the actual error
local curl_err
if ! curl_err=$(curl -fSL -o "$tmp_file" "$url" 2>&1); then
    log_error "Failed to download from $url"
    log_error "curl: $curl_err"
    exit 1
fi
```

The pattern is: `if ! err=$(command 2>&1); then log_error "...: $err"`.

---

## Bash Verification Examples

```bash
# Verify a file was created
cat > "$profile_path" << PLIST
...
PLIST
if [ ! -f "$profile_path" ]; then
    log_error "Failed to write profile to $profile_path"
    exit 1
fi

# Verify a directory was created
mkdir -p "$target_dir"
if [ ! -d "$target_dir" ]; then
    log_error "Failed to create directory $target_dir"
    exit 1
fi

# Verify a process was stopped
pkill -f "$process_name" 2>/dev/null || true
sleep 1
if pgrep -f "$process_name" >/dev/null 2>&1; then
    log_error "Failed to stop $process_name"
    exit 1
fi
```

---

## Bash Command Checks

macOS ships with standard tools (`curl`, `mkdir`, `cp`, `rm`, `hdiutil`, `osascript`, `sysctl`, `xattr`, `pgrep`, `pkill`, `awk`, etc.) — these can be used without checks.

```bash
# Check a required command
if ! command -v jq >/dev/null 2>&1; then
    log_error "jq is required but not installed"
    exit 1
fi

# Check an optional command — fall back gracefully
if command -v shellcheck >/dev/null 2>&1; then
    shellcheck "$script"
else
    log_warning "shellcheck not installed, skipping lint"
fi
```

Put required command checks early in `main()`, before the script does any work.

---

## macOS Bash Limitations

macOS ships **bash 3.2** (Apple won't update past GPLv2). Many modern bash features do not work. Do not use any of these:

| Feature | Requires | Alternative |
|---------|----------|-------------|
| Associative arrays (`declare -A`) | bash 4+ | Use multiple indexed arrays or `case` statements |
| `mapfile` / `readarray` | bash 4+ | Use `while read` loops |
| `${var,,}` / `${var^^}` (case conversion) | bash 4+ | Use `tr '[:upper:]' '[:lower:]'` |
| `|&` (pipe stderr) | bash 4+ | Use `2>&1 \|` |
| `coproc` | bash 4+ | Avoid |

Regular indexed arrays (`arr=()`, `"${arr[@]}"`) work fine in bash 3.2 and are safe to use.

**Common tools not installed on stock macOS:**

| Tool | Status | Alternative |
|------|--------|-------------|
| `jq` | Not installed | Use `plutil`, `defaults read`, or `awk`/`sed` for simple parsing |
| `wget` | Not installed | Use `curl` |
| `python3` | Not guaranteed | Don't depend on it |
| `brew` | Not installed | Don't depend on it |
| `gnu coreutils` (`gdate`, `gsed`, etc.) | Not installed | Use the BSD variants that ship with macOS |

When in doubt, test on a stock macOS machine — not in a devcontainer.

---

## Validation

The validation tool (`docs/ai-developer/tools/validate-bash.sh`) checks every `.sh` file in the specified folder. It validates 4 things:

1. **Syntax** — `bash -n` (catches parse errors)
2. **Help** — `bash <script> -h` must exit 0 and match the standard format
3. **Metadata** — All 5 required fields must be present in the source
4. **Lint** — `shellcheck --severity=error` (if shellcheck is installed)

### Running validation

```bash
# Validate all script folders
bash docs/ai-developer/tools/validate-bash.sh

# Validate one folder
bash docs/ai-developer/tools/validate-bash.sh devcontainer-toolbox

# Validate scripts in a subfolder (e.g. test scripts)
bash docs/ai-developer/tools/validate-bash.sh rancher-desktop/tests
```

The validation tool looks at one folder level at a time (`-maxdepth 1`). If your scripts live in a subfolder like `tests/`, you must pass the subfolder path explicitly.

**Always** validate after creating or modifying any script. Do not commit until all checks pass.

### Fixing failures

- **syntax** failure: Fix bash syntax errors
- **help** failure: Check that help output matches the standard format. Most common cause: missing `help()` function or missing argument parsing for `-h`
- **meta** failure: Add missing metadata fields
- **lint** failure: Fix shellcheck errors

---

## Version Bumping

Use `docs/ai-developer/tools/set-version-bash.sh` to update `SCRIPT_VER` across all scripts in a folder:

```bash
bash docs/ai-developer/tools/set-version-bash.sh devcontainer-toolbox
```

This shows the current version of each script in the folder and prompts for the new version. Only bump the version when making a release — not for every small edit.

---

## Real Examples

The `scripts-mac/devcontainer-toolbox/` folder contains working scripts that follow these conventions:

| Script | Purpose |
|--------|---------|
| `devcontainer-init.sh` | Initialize devcontainer toolbox on a Mac |
| `devcontainer-init-install.sh` | Install devcontainer toolbox components |
| `devcontainer-pull.sh` | Pull latest devcontainer images |

Read these for patterns on argument parsing, error handling, and logging.
