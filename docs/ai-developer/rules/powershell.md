# PowerShell Script Rules

PowerShell-specific syntax and conventions for scripts in this repo. **Read [script-standard.md](script-standard.md) first** — it defines the universal rules (metadata, help format, logging, error codes, etc.) that this file shows how to implement in PowerShell.

---

## The Golden Rule

**Every `.ps1` file in this repo must follow the standard script template. No exceptions.**

This applies to:

- Main deployment scripts (install, uninstall)
- Detection scripts (for Intune)
- Test scripts
- Helper/utility scripts
- Library scripts (dot-sourced by other scripts)
- Test runner scripts

Library scripts that are dot-sourced (not run directly) still need metadata, logging, help, and parameter handling so that `pwsh script.ps1 -Help` works — the validation tool checks this.

---

## Step-by-Step

### 1. Copy the template

```bash
mkdir -p scripts-win/my-new-folder
cp docs/ai-developer/templates/powershell/script-template.ps1 scripts-win/my-new-folder/my-script.ps1
```

### 2. Fill in the metadata

Edit the 5 required metadata fields at the top of the script:

```powershell
$SCRIPT_ID          = "my-script"
$SCRIPT_NAME        = "My Script"
$SCRIPT_VER         = "0.0.1"
$SCRIPT_DESCRIPTION = "One-line description of what this script does."
$SCRIPT_CATEGORY    = "DEVOPS"
```

### 3. Implement Main

Add your logic to the Main section at the bottom of the script. The template provides the standard structure — keep the sections in order.

### 4. Validate

```bash
bash docs/ai-developer/tools/validate-powershell.sh my-new-folder
```

Fix any failures before committing.

---

## PowerShell Strict Mode

Every script starts with these three lines after the `param()` block. This is the PowerShell equivalent of bash's `set -euo pipefail`:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
```

| Setting | What it does | Bash equivalent |
| ------- | ------------ | --------------- |
| `Set-StrictMode -Version Latest` | Error on uninitialized variables and non-existent properties | `set -u` |
| `$ErrorActionPreference = 'Stop'` | Convert non-terminating errors into terminating errors | `set -e` |
| `$ProgressPreference = 'SilentlyContinue'` | Suppress progress bars (they break non-interactive mode and slow downloads) | N/A |

There is no direct equivalent of `set -o pipefail`. PowerShell passes objects (not text) through pipelines, and `$ErrorActionPreference = 'Stop'` catches pipeline errors.

---

## PowerShell Logging Functions

The PowerShell implementation of the standard logging functions. Copy them exactly from the template — don't modify the format.

```powershell
function log_time    { Get-Date -Format 'HH:mm:ss' }
function log_info    { param([string]$msg) Write-Host "[$( log_time )] INFO  $msg" }
function log_success { param([string]$msg) Write-Host "[$( log_time )] OK    $msg" }
function log_error   { param([string]$msg) Write-Host "[$( log_time )] ERROR $msg" }
function log_warning { param([string]$msg) Write-Host "[$( log_time )] WARN  $msg" }
```

Why `Write-Host` instead of `Write-Error`/`Write-Warning`? These are deployment scripts run by Intune as SYSTEM. `Write-Host` gives us consistent, predictable output format. `Write-Error` adds PowerShell error formatting that clutters logs and can trigger `$ErrorActionPreference = 'Stop'` unintentionally.

The only acceptable uses of raw `Write-Host` (without the logging functions) are:

- `Write-Host ""` for blank line separators (formatting)
- Separator lines like `Write-Host "================================================================"` (formatting)
- Inside the `Show-Help` function

---

## PowerShell Help Function

The `-Help` flag must produce output matching the standard help format (see [script-standard.md](script-standard.md)).

```powershell
function Show-Help {
    Write-Host "$SCRIPT_NAME (v$SCRIPT_VER)"
    Write-Host "$SCRIPT_DESCRIPTION"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  $SCRIPT_ID [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help     Show this help message"
    Write-Host ""
    Write-Host "Metadata:"
    Write-Host "  ID:       $SCRIPT_ID"
    Write-Host "  Category: $SCRIPT_CATEGORY"
}
```

Scripts may add extra sections (Arguments, Examples, Prerequisites, etc.) between Options and Metadata.

---

## PowerShell Template Sections

The template (`docs/ai-developer/templates/powershell/script-template.ps1`) has these sections in order. Keep this structure:

| Section | What it contains | Required for |
| ------- | ---------------- | ------------ |
| PARAMETERS | `param()` block with `-Help` switch | All scripts |
| STRICT MODE | `Set-StrictMode`, `$ErrorActionPreference`, `$ProgressPreference` | All scripts |
| SCRIPT METADATA | The 5 required metadata fields | All scripts |
| CONFIGURATION | Variables for URLs, paths, defaults — no hardcoded values in functions | Scripts with configurable values |
| LOGGING | Standard logging functions | All scripts |
| HELP | The `Show-Help` function + early exit if `-Help` | All scripts |
| HELPER FUNCTIONS | Your custom functions | As needed |
| MAIN | The main logic with try/catch | Standalone scripts (not libraries) |

**Library scripts** (dot-sourced by other scripts) must still have PARAMETERS, STRICT MODE, METADATA, LOGGING, and HELP sections. They skip MAIN since their code runs when dot-sourced.

---

## PowerShell Parameter Block

```powershell
[CmdletBinding()]
param(
    [switch]$Help,

    [string]$TargetPath
)
```

Key rules:

- `[CmdletBinding()]` is always required above `param()`.
- `-Help` switch is always the first parameter.
- Do NOT use `[Parameter(Mandatory = $true)]` — it triggers an interactive prompt when the parameter is missing, which fails in Intune's non-interactive SYSTEM context. Instead, validate manually and exit with a clear error.
- Use `[ValidateSet()]` for parameters with a fixed set of values.

### Validating required parameters manually

```powershell
if (-not $TargetPath) {
    log_error "ERR001: -TargetPath is required"
    log_error "ERR001: Run with -Help for usage"
    exit 1
}
```

### -Uninstall flag (install scripts)

Install scripts should support `-Uninstall` to cleanly reverse what they installed (see [Script Types](script-standard.md#script-types)). Add it as a switch parameter:

```powershell
[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$Uninstall
)

# ... strict mode, metadata, logging, help ...

if ($Uninstall) {
    log_start
    log_info "Uninstalling..."
    # Remove files, registry keys, etc.
    Remove-Item -Path "C:\Program Files\MyTool" -Recurse -Force -ErrorAction SilentlyContinue
    log_success "MyTool removed"
    exit 0
}

# ... normal install logic
```

Key points:
- Both install and uninstall are idempotent — safe to run when already installed or already removed
- Use `-ErrorAction SilentlyContinue` for removal commands (don't fail if already gone)
- Document `-Uninstall` in the Show-Help function under Options

---

## PowerShell Error Capture Pattern

```powershell
# Bad — logs that it failed but not why
try {
    Copy-Item -Path $source -Destination $dest
}
catch {
    log_error "ERR003: Failed to copy file"
    exit 1
}

# Good — captures and logs the actual error
try {
    Copy-Item -Path $source -Destination $dest
}
catch {
    log_error "ERR003: Failed to copy $source to $dest"
    log_error "ERR003: $_"
    exit 1
}
```

The pattern is: `catch { log_error "ERR...: $_" }` where `$_` contains the error message.

### External commands (native executables)

PowerShell does NOT throw when an external command fails. You must check `$LASTEXITCODE`:

```powershell
# Bad — ignores failure
& msiexec /i $msiPath /qn /norestart

# Good — checks exit code
& msiexec /i $msiPath /qn /norestart
if ($LASTEXITCODE -ne 0) {
    log_error "ERR004: msiexec failed with exit code $LASTEXITCODE"
    exit 1
}

# Also good — MSI has special exit codes
& msiexec /i $msiPath /qn /norestart
switch ($LASTEXITCODE) {
    0       { log_success "Installation successful" }
    3010    { log_warning "Installation successful — reboot required" }
    default {
        log_error "ERR004: msiexec failed with exit code $LASTEXITCODE"
        exit 1
    }
}
```

---

## PowerShell Verification Examples

```powershell
# Verify a file was created
$content | Set-Content -Path $configPath
if (-not (Test-Path $configPath)) {
    log_error "ERR005: Failed to write config to $configPath"
    exit 1
}

# Verify a directory was created
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
if (-not (Test-Path $targetDir)) {
    log_error "ERR006: Failed to create directory $targetDir"
    exit 1
}

# Verify a registry key was written
New-ItemProperty -Path $regPath -Name $name -Value $value -Force | Out-Null
$actual = Get-ItemPropertyValue -Path $regPath -Name $name
if ($actual -ne $value) {
    log_error "ERR007: Registry value mismatch — expected '$value', got '$actual'"
    exit 1
}

# Verify a process was stopped
Stop-Process -Name $processName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
if (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
    log_error "ERR008: Failed to stop $processName"
    exit 1
}
```

---

## PowerShell Command Checks

Windows ships with standard tools (`msiexec`, `reg`, `sc`, `net`, `schtasks`, `wsl`, etc.) — these can be used without checks.

```powershell
# Check a required command
if ($null -eq (Get-Command 'winget' -ErrorAction SilentlyContinue)) {
    log_error "ERR001: winget is required but not installed"
    exit 1
}

# Check an optional command — fall back gracefully
if (Get-Command 'choco' -ErrorAction SilentlyContinue) {
    & choco upgrade $packageName -y
}
else {
    log_warning "choco not installed, skipping upgrade"
}
```

Put required command checks early in the Main section, before the script does any work.

---

## PowerShell Gotchas for Bash Users

These are the most common mistakes when switching from bash to PowerShell:

| Bash | PowerShell | Notes |
| ---- | ---------- | ----- |
| `==`, `!=`, `>`, `<` | `-eq`, `-ne`, `-gt`, `-lt` | Using `>` in PowerShell creates a file (redirection) |
| `true` / `false` | `$true` / `$false` | Must have the `$` prefix |
| `$VAR` | `$env:VAR` | Environment variables need the `env:` prefix |
| `command -v git` | `Get-Command 'git'` | Returns command info or `$null` |
| `[ -f "$path" ]` | `Test-Path $path` | Also works for directories |
| `if [ "$a" = "$b" ]` | `if ($a -eq $b)` | Curly braces, not `then`/`fi` |
| `"${var}"` | `"$var"` or `"$($expr)"` | Use `$()` for expressions in strings |
| `$()` (command substitution) | `$( )` or assign to variable | `$()` in double-quoted strings evaluates expressions |
| `export VAR=value` | `$env:VAR = 'value'` | Sets for current process and children |
| `&&` / `\|\|` | `-and` / `-or` for logic | `&&`/`||` work in PowerShell 7+ for command chaining |
| Array `("a" "b")` | Array `@('a', 'b')` | Comma-separated, `@()` wrapper |
| `$?` (exit code) | `$LASTEXITCODE` | `$?` in PowerShell is a boolean, not exit code |

### Single-element array trap

PowerShell unwraps single-element arrays. Always use `@()` when you expect an array:

```powershell
$files = @(Get-ChildItem *.log)    # Always an array, even with 0 or 1 result
```

### Null comparison order

Always put `$null` on the left side:

```powershell
if ($null -eq $value) { ... }      # Correct
if ($value -eq $null) { ... }      # PSScriptAnalyzer warning — array comparison issue
```

---

## Intune-Specific Conventions

### Scripts run as SYSTEM

Intune runs PowerShell scripts as the `NT AUTHORITY\SYSTEM` account. This means:

- No user profile loaded (`$env:USERPROFILE` points to the system profile)
- No desktop, no Start menu, no interactive UI
- Full admin privileges (equivalent to root on Mac/Linux)
- No user-specific environment variables

### Scripts must be non-interactive

Never use `Read-Host`, `[Parameter(Mandatory)]`, or any other interactive prompt. The script runs unattended — there is no one to answer prompts.

### Detection scripts have special rules

Detection scripts tell Intune whether an app is already installed. They follow a strict convention:

- **Exit 0 + stdout output** = app is detected (installed)
- **Exit 0 + no output** = app is NOT detected (not installed)
- **Exit non-zero** = detection error

```powershell
# Detection script example
$appPath = "C:\Program Files\MyApp\app.exe"
if (Test-Path $appPath) {
    Write-Host "Installed"    # Any stdout output = detected
    exit 0
}
exit 0                        # No output = not detected
```

Detection scripts are the one exception where `Write-Host` outside logging functions is acceptable — Intune checks for any stdout output.

### Execution policy

Intune runs scripts with `-ExecutionPolicy Bypass` automatically. Do not add `Set-ExecutionPolicy` to your scripts.

---

## File Extensions

| Extension | Use for |
| --------- | ------- |
| `.ps1` | All scripts (install, uninstall, detect, test, helper) |

PowerShell also has `.psm1` (modules) and `.psd1` (manifests) but we don't use those for deployment scripts.

---

## Validation

The validation tool (`docs/ai-developer/tools/validate-powershell.sh`) checks every `.ps1` file in the specified folder. It validates 4 things:

1. **Syntax** — `pwsh -Command "[System.Management.Automation.Language.Parser]::ParseFile()"` (catches parse errors)
2. **Help** — `pwsh script.ps1 -Help` must exit 0 and match the standard format
3. **Metadata** — All 5 required fields must be present in the source
4. **Lint** — `Invoke-ScriptAnalyzer -Severity Error,Warning` (if PSScriptAnalyzer is installed)

### Running validation

```bash
# Validate all script folders
bash docs/ai-developer/tools/validate-powershell.sh

# Validate one folder
bash docs/ai-developer/tools/validate-powershell.sh rancher-desktop

# Validate scripts in a subfolder
bash docs/ai-developer/tools/validate-powershell.sh rancher-desktop/tests
```

**Always** validate after creating or modifying any script. Do not commit until all checks pass.

---

## Version Bumping

Use `docs/ai-developer/tools/set-version-powershell.sh` to update `$SCRIPT_VER` across all scripts in a folder:

```bash
bash docs/ai-developer/tools/set-version-powershell.sh diagnostics
```

This shows the current version of each script in the folder and prompts for the new version. Only bump the version when making a release - not for every small edit.

---

## Real Examples

*(To be added when the first scripts-win package is created.)*
