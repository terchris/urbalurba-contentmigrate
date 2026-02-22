#!/usr/bin/env bash
# File: validate-powershell.sh
#
# Usage:
#   validate-powershell.sh [OPTIONS] [FOLDER]
#   validate-powershell.sh [-h|--help]
#
# Purpose:
#   Validate that PowerShell scripts follow the standard template
#
# Author: Ops Team
# Created: February 2026
#
# For each .ps1 file under SCRIPTS_DIR/<folder>/:
#   1. pwsh parser  (syntax check)
#   2. pwsh <script> -Help  (help flag works and output matches standard format)
#   3. SCRIPT_METADATA fields present in source
#   4. PSScriptAnalyzer (if available)
#
# SCRIPTS_DIR defaults to <repo-root>/scripts/ but can be overridden:
#   SCRIPTS_DIR=/path/to/scripts bash docs/ai-developer/tools/validate-powershell.sh
#
# Do not change the help() structure - the test runner validates it.

set -euo pipefail

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

SCRIPT_ID="validate-powershell"
SCRIPT_NAME="Validate PowerShell Scripts"
SCRIPT_VER="1.0.0"
SCRIPT_DESCRIPTION="Validate that PowerShell scripts follow the standard template."
SCRIPT_CATEGORY="DEVOPS"

#------------------------------------------------------------------------------
# CONFIGURATION
#------------------------------------------------------------------------------

# Resolve repo root from this script's location (docs/ai-developer/tools/)
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SCRIPTS_DIR="${SCRIPTS_DIR:-${REPO_ROOT}/scripts}"

#------------------------------------------------------------------------------
# LOGGING
#------------------------------------------------------------------------------

log_time()    { date +%H:%M:%S; }
log_info()    { echo "[$(log_time)] INFO  $*" >&2; }
log_success() { echo "[$(log_time)] OK    $*" >&2; }
log_error()   { echo "[$(log_time)] ERROR $*" >&2; }
log_warning() { echo "[$(log_time)] WARN  $*" >&2; }

#------------------------------------------------------------------------------
# HELP
#------------------------------------------------------------------------------

help() {
    cat >&2 << EOF
$SCRIPT_NAME (v$SCRIPT_VER)
$SCRIPT_DESCRIPTION

Usage:
  $SCRIPT_ID [options] [folder]

Arguments:
  folder    Script folder to validate (e.g. my-package, diagnostics)
            If omitted, validates all folders under SCRIPTS_DIR/

Environment:
  SCRIPTS_DIR   Override the default scripts directory (default: <repo-root>/scripts/)

Options:
  -h, --help  Show this help message

Examples:
  bash docs/ai-developer/tools/validate-powershell.sh
  bash docs/ai-developer/tools/validate-powershell.sh my-package
  SCRIPTS_DIR=./src bash docs/ai-developer/tools/validate-powershell.sh

Metadata:
  ID:       $SCRIPT_ID
  Category: $SCRIPT_CATEGORY
EOF
}

#------------------------------------------------------------------------------
# ARGUMENT PARSING
#------------------------------------------------------------------------------

while [ "${1:-}" != "" ] && [[ "${1:-}" == -* ]]; do
    case "$1" in
        -h|--help)
            help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

#------------------------------------------------------------------------------
# HELPER FUNCTIONS
#------------------------------------------------------------------------------

# Extract a metadata value from a PowerShell script file
# Handles aligned whitespace: $SCRIPT_ID          = "check-environment"
extract_meta() {
    local file="$1" field="$2"
    grep "^\\\$${field}" "$file" 2>/dev/null | head -1 | sed 's/.*= *"//' | sed 's/".*//'
}

#------------------------------------------------------------------------------
# MAIN
#------------------------------------------------------------------------------

main() {
    # Check pwsh is available
    if ! command -v pwsh >/dev/null 2>&1; then
        log_error "ERR001: pwsh (PowerShell) not found. Install PowerShell 7 first."
        exit 1
    fi

    local FAILED=0
    local TOTAL=0
    local PASSED=0

    # If a folder name was given, only validate that folder
    local FOLDERS=()
    if [ -n "${1:-}" ]; then
        FOLDERS=("${SCRIPTS_DIR}/$1")
        if [ ! -d "${FOLDERS[0]}" ]; then
            log_error "ERR002: Folder not found: ${FOLDERS[0]}"
            exit 1
        fi
    else
        for d in "${SCRIPTS_DIR}"/*/; do
            [ -d "$d" ] && FOLDERS+=("${d%/}")
        done
    fi

    if [ ${#FOLDERS[@]} -eq 0 ]; then
        log_info "No script folders found under ${SCRIPTS_DIR}/"
        exit 0
    fi

    # Check if PSScriptAnalyzer is available
    local HAS_ANALYZER=0
    if pwsh -NoProfile -Command "Get-Module -ListAvailable PSScriptAnalyzer" 2>/dev/null | grep -q "PSScriptAnalyzer"; then
        HAS_ANALYZER=1
        echo "PSScriptAnalyzer: found"
    else
        echo "PSScriptAnalyzer: not found (skipping lint checks)"
    fi

    echo ""

    for folder in "${FOLDERS[@]}"; do
        local folder_name
        folder_name=$(basename "$folder")
        echo "=== $folder_name ==="

        # Find all .ps1 files in this folder (not recursive into tests/)
        local ps1files=()
        while IFS= read -r -d '' f; do
            ps1files+=("$f")
        done < <(find "$folder" -maxdepth 1 -name '*.ps1' -type f -print0 | sort -z)

        if [ ${#ps1files[@]} -eq 0 ]; then
            echo "  (no .ps1 files)"
            echo ""
            continue
        fi

        for script in "${ps1files[@]}"; do
            local name
            name=$(basename "$script")
            TOTAL=$((TOTAL + 1))
            local script_ok=1

            # 1. Syntax check — PowerShell AST parser
            local syntax_result
            syntax_result=$(pwsh -NoProfile -Command "
                \$errors = \$null
                [System.Management.Automation.Language.Parser]::ParseFile('$script', [ref]\$null, [ref]\$errors) | Out-Null
                if (\$errors.Count -gt 0) {
                    \$errors | ForEach-Object { Write-Host \$_.Message }
                    exit 1
                }
                exit 0
            " 2>&1) || true
            if [ $? -eq 0 ] && [ -z "$syntax_result" ]; then
                echo "  PASS  syntax   $name"
            else
                echo "  FAIL  syntax   $name" >&2
                script_ok=0
            fi

            # 2. Help flag — must exit 0 and output must follow standard format
            local help_output
            local help_exit=0
            help_output=$(pwsh -NoProfile -File "$script" -Help 2>&1) || help_exit=$?
            if [ "$help_exit" -ne 0 ]; then
                echo "  FAIL  help     $name  (exit code $help_exit)" >&2
                script_ok=0
            else
                # Read metadata values from the source file
                local src_name src_ver src_desc src_id src_cat
                src_name=$(extract_meta "$script" "SCRIPT_NAME")
                src_ver=$(extract_meta "$script" "SCRIPT_VER")
                src_desc=$(extract_meta "$script" "SCRIPT_DESCRIPTION")
                src_id=$(extract_meta "$script" "SCRIPT_ID")
                src_cat=$(extract_meta "$script" "SCRIPT_CATEGORY")

                local help_problems=()

                # Check first line: "SCRIPT_NAME (vSCRIPT_VER)"
                if [ -n "$src_name" ] && [ -n "$src_ver" ]; then
                    if ! echo "$help_output" | head -1 | grep -qF "$src_name (v$src_ver)"; then
                        help_problems+=("first line missing '$src_name (v$src_ver)'")
                    fi
                fi

                # Check SCRIPT_DESCRIPTION appears in output
                if [ -n "$src_desc" ]; then
                    if ! echo "$help_output" | grep -qF "$src_desc"; then
                        help_problems+=("missing SCRIPT_DESCRIPTION")
                    fi
                fi

                # Check Metadata section with ID and Category
                if ! echo "$help_output" | grep -q "^Metadata:"; then
                    help_problems+=("missing 'Metadata:' section")
                fi
                if [ -n "$src_id" ]; then
                    if ! echo "$help_output" | grep -qF "ID:       $src_id"; then
                        help_problems+=("missing ID in Metadata")
                    fi
                fi
                if [ -n "$src_cat" ]; then
                    if ! echo "$help_output" | grep -qF "Category: $src_cat"; then
                        help_problems+=("missing Category in Metadata")
                    fi
                fi

                if [ ${#help_problems[@]} -eq 0 ]; then
                    echo "  PASS  help     $name"
                else
                    echo "  FAIL  help     $name  (${help_problems[*]})" >&2
                    script_ok=0
                fi
            fi

            # 3. Required SCRIPT_METADATA fields
            local METADATA_FIELDS=("SCRIPT_ID" "SCRIPT_NAME" "SCRIPT_VER" "SCRIPT_DESCRIPTION" "SCRIPT_CATEGORY")
            local missing=()
            for field in "${METADATA_FIELDS[@]}"; do
                if ! grep -q "^\\\$${field}" "$script"; then
                    missing+=("$field")
                fi
            done
            if [ ${#missing[@]} -eq 0 ]; then
                echo "  PASS  meta     $name"
            else
                echo "  FAIL  meta     $name  (missing: ${missing[*]})" >&2
                script_ok=0
            fi

            # 4. Startup message — source must contain the standard startup line
            if grep -qF 'log_info "Starting: $SCRIPT_NAME Ver: $SCRIPT_VER"' "$script"; then
                echo "  PASS  startup  $name"
            else
                echo "  FAIL  startup  $name  (missing: log_info \"Starting: \$SCRIPT_NAME Ver: \$SCRIPT_VER\")" >&2
                script_ok=0
            fi

            # 5. SCRIPT_CHECK_COMMAND — recommended for install/config scripts (info only, not a failure)
            if grep -q '^\$SCRIPT_CHECK_COMMAND' "$script"; then
                echo "  PASS  check    $name"
            else
                echo "  INFO  check    $name  (no SCRIPT_CHECK_COMMAND — recommended for install/config scripts)"
            fi

            # 6. PSScriptAnalyzer — only fail on errors
            if [ "$HAS_ANALYZER" -eq 1 ]; then
                local lint_result
                lint_result=$(pwsh -NoProfile -Command "
                    \$results = Invoke-ScriptAnalyzer -Path '$script' -Severity Error
                    if (\$results.Count -gt 0) {
                        \$results | ForEach-Object { Write-Host \"\$(\$_.RuleName): \$(\$_.Message)\" }
                        exit 1
                    }
                    exit 0
                " 2>&1)
                local lint_exit=$?
                if [ "$lint_exit" -eq 0 ]; then
                    echo "  PASS  lint     $name"
                else
                    echo "  FAIL  lint     $name  ($lint_result)" >&2
                    script_ok=0
                fi
            fi

            if [ "$script_ok" -eq 0 ]; then
                FAILED=$((FAILED + 1))
            else
                PASSED=$((PASSED + 1))
            fi
        done
        echo ""
    done

    echo "--- Results ---"
    echo "Total scripts: $TOTAL  Passed: $PASSED  Failed: $FAILED"

    if [ "$FAILED" -ne 0 ]; then
        exit 1
    fi

    echo "All checks passed."
}

main "$@"
