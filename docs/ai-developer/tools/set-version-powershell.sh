#!/usr/bin/env bash
# File: set-version-powershell.sh
#
# Usage:
#   set-version-powershell.sh [OPTIONS] <folder-name>
#   set-version-powershell.sh [-h|--help]
#
# Purpose:
#   Update SCRIPT_VER in all .ps1 files for a script package
#
# Author: Ops Team
# Created: February 2026
#
# SCRIPTS_DIR defaults to <repo-root>/scripts/ but can be overridden:
#   SCRIPTS_DIR=/path/to/scripts bash docs/ai-developer/tools/set-version-powershell.sh my-pkg
#
# Do not change the help() structure - the test runner validates it.

set -euo pipefail

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

SCRIPT_ID="set-version-powershell"
SCRIPT_NAME="Set Version (PowerShell)"
SCRIPT_VER="1.0.0"
SCRIPT_DESCRIPTION="Update SCRIPT_VER in all .ps1 files for a script package."
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
  $SCRIPT_ID [options] <folder-name>

Arguments:
  folder-name   Script package to update (e.g. my-package, utilities)

Options:
  -h, --help  Show this help message

Environment:
  SCRIPTS_DIR   Override the default scripts directory (default: <repo-root>/scripts/)

Examples:
  bash docs/ai-developer/tools/set-version-powershell.sh my-package
  SCRIPTS_DIR=./src bash docs/ai-developer/tools/set-version-powershell.sh utilities

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

# Extract $SCRIPT_VER value from a PowerShell file
# Handles aligned whitespace: $SCRIPT_VER         = "0.1.0"
extract_ver() {
    local file="$1"
    grep '^\$SCRIPT_VER' "$file" 2>/dev/null | head -1 | sed 's/.*= *"//' | sed 's/".*//'
}

#------------------------------------------------------------------------------
# MAIN
#------------------------------------------------------------------------------

main() {
    if [ -z "${1:-}" ]; then
        log_info "Available packages:"
        for d in "${SCRIPTS_DIR}"/*/; do
            [ -d "$d" ] && log_info "  $(basename "$d")"
        done
        echo ""
        log_error "ERR001: No folder name provided"
        log_info "Usage: bash docs/ai-developer/tools/set-version-powershell.sh <folder-name>"
        exit 1
    fi

    local FOLDER_NAME="$1"
    local FOLDER_PATH="${SCRIPTS_DIR}/${FOLDER_NAME}"

    if [ ! -d "$FOLDER_PATH" ]; then
        log_error "ERR002: Folder not found: ${FOLDER_PATH}"
        exit 1
    fi

    # Find .ps1 files
    local ps1files=()
    while IFS= read -r -d '' f; do
        ps1files+=("$f")
    done < <(find "$FOLDER_PATH" -maxdepth 1 -name '*.ps1' -type f -print0 | sort -z)

    if [ ${#ps1files[@]} -eq 0 ]; then
        log_info "No .ps1 files found in ${FOLDER_PATH}"
        exit 0
    fi

    # Show current versions
    log_info "Current versions in ${FOLDER_NAME}:"
    echo ""
    for script in "${ps1files[@]}"; do
        local name current
        name=$(basename "$script")
        current=$(extract_ver "$script")
        current="${current:-(not set)}"
        log_info "  ${name}  ->  ${current}"
    done

    echo ""
    read -rp "Enter new version (e.g. 0.1.0): " NEW_VER

    if [ -z "$NEW_VER" ]; then
        log_info "No version entered. Aborting."
        exit 1
    fi

    # Update $SCRIPT_VER in each file
    # Preserves alignment: $SCRIPT_VER         = "0.1.0" -> $SCRIPT_VER         = "0.2.0"
    echo ""
    for script in "${ps1files[@]}"; do
        local name
        name=$(basename "$script")
        if grep -q '^\$SCRIPT_VER' "$script"; then
            sed -i "s/^\(\\\$SCRIPT_VER *=  *\)\"[^\"]*\"/\1\"$NEW_VER\"/" "$script"
            log_success "Updated ${name} -> ${NEW_VER}"
        else
            log_warning "Skipped ${name} (no \$SCRIPT_VER found)"
        fi
    done

    echo ""
    log_success "Version set to ${NEW_VER} in ${FOLDER_NAME}"
}

main "$@"
