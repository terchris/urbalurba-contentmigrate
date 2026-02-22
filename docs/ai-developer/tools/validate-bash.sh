#!/usr/bin/env bash
# File: validate-bash.sh
#
# Usage:
#   validate-bash.sh [OPTIONS] [FOLDER]
#   validate-bash.sh [-h|--help]
#
# Purpose:
#   Validate that shell scripts follow the standard template
#
# Author: Ops Team
# Created: February 2026
#
# For each .sh file under SCRIPTS_DIR/<folder>/:
#   1. bash -n  (syntax check)
#   2. bash <script> -h  (help flag works and output matches standard format)
#   3. SCRIPT_METADATA fields present in source
#   4. shellcheck (if installed)
#
# SCRIPTS_DIR defaults to <repo-root>/scripts/ but can be overridden:
#   SCRIPTS_DIR=/path/to/scripts bash docs/ai-developer/tools/validate-bash.sh
#
# Do not change the help() structure — the test runner validates it.

set -euo pipefail

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

SCRIPT_ID="validate-bash"
SCRIPT_NAME="Validate Bash Scripts"
SCRIPT_VER="1.0.0"
SCRIPT_DESCRIPTION="Validate that shell scripts follow the standard template."
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
  folder    Script folder to validate (e.g. my-package, my-package/tests)
            If omitted, validates all folders under SCRIPTS_DIR/

Environment:
  SCRIPTS_DIR   Override the default scripts directory (default: <repo-root>/scripts/)

Options:
  -h, --help  Show this help message

Examples:
  bash docs/ai-developer/tools/validate-bash.sh
  bash docs/ai-developer/tools/validate-bash.sh my-package
  SCRIPTS_DIR=./src bash docs/ai-developer/tools/validate-bash.sh

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

# Extract a metadata value from a script file (macOS-safe, no grep -oP)
extract_meta() {
    local file="$1" field="$2"
    grep "^${field}=" "$file" 2>/dev/null | head -1 | sed "s/^${field}=\"//" | sed 's/".*//'
}

#------------------------------------------------------------------------------
# MAIN
#------------------------------------------------------------------------------

main() {
    local FAILED=0
    local TOTAL=0
    local PASSED=0

    # If a folder name was given, only validate that folder
    local FOLDERS=()
    if [ -n "${1:-}" ]; then
        FOLDERS=("${SCRIPTS_DIR}/$1")
        if [ ! -d "${FOLDERS[0]}" ]; then
            log_error "Folder not found: ${FOLDERS[0]}"
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

    # Check if shellcheck is available
    local HAS_SHELLCHECK=0
    if command -v shellcheck >/dev/null 2>&1; then
        HAS_SHELLCHECK=1
        echo "shellcheck: found"
    else
        echo "shellcheck: not found (skipping lint checks)"
    fi

    echo ""

    for folder in "${FOLDERS[@]}"; do
        local folder_name
        folder_name=$(basename "$folder")
        echo "=== $folder_name ==="

        # Find all .sh files in this folder
        local shfiles=()
        while IFS= read -r -d '' f; do
            shfiles+=("$f")
        done < <(find "$folder" -maxdepth 1 -name '*.sh' -type f -print0 | sort -z)

        if [ ${#shfiles[@]} -eq 0 ]; then
            echo "  (no .sh files)"
            echo ""
            continue
        fi

        for script in "${shfiles[@]}"; do
            local name
            name=$(basename "$script")
            TOTAL=$((TOTAL + 1))
            local script_ok=1

            # 1. Syntax check
            if bash -n "$script" 2>/dev/null; then
                echo "  PASS  syntax   $name"
            else
                echo "  FAIL  syntax   $name" >&2
                script_ok=0
            fi

            # 2. Help flag — must exit 0 and output must follow standard format
            local help_output
            local help_exit=0
            help_output=$(bash "$script" -h 2>&1) || help_exit=$?
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
                if ! grep -q "^${field}=" "$script"; then
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
            if grep -q "^SCRIPT_CHECK_COMMAND=" "$script"; then
                echo "  PASS  check    $name"
            else
                echo "  INFO  check    $name  (no SCRIPT_CHECK_COMMAND — recommended for install/config scripts)"
            fi

            # 6. Shellcheck (if available) — only fail on errors, not warnings
            if [ "$HAS_SHELLCHECK" -eq 1 ]; then
                if shellcheck --severity=error "$script" >/dev/null 2>&1; then
                    echo "  PASS  lint     $name"
                else
                    echo "  FAIL  lint     $name" >&2
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
