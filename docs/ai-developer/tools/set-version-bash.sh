#!/usr/bin/env bash
# File: set-version-bash.sh
#
# Usage:
#   set-version-bash.sh [OPTIONS] <folder-name>
#   set-version-bash.sh [-h|--help]
#
# Purpose:
#   Update SCRIPT_VER in all .sh files for a script package
#
# Author: Ops Team
# Created: February 2026
#
# SCRIPTS_DIR defaults to <repo-root>/scripts/ but can be overridden:
#   SCRIPTS_DIR=/path/to/scripts bash docs/ai-developer/tools/set-version-bash.sh my-pkg
#
# Do not change the help() structure — the test runner validates it.

set -euo pipefail

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

SCRIPT_ID="set-version-bash"
SCRIPT_NAME="Set Version (Bash)"
SCRIPT_VER="1.0.0"
SCRIPT_DESCRIPTION="Update SCRIPT_VER in all .sh files for a script package."
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
  bash docs/ai-developer/tools/set-version-bash.sh my-package
  SCRIPTS_DIR=./src bash docs/ai-developer/tools/set-version-bash.sh utilities

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

# Extract SCRIPT_VER value from a file (macOS-safe, no grep -oP)
extract_ver() {
    local file="$1"
    grep '^SCRIPT_VER=' "$file" 2>/dev/null | head -1 | sed 's/^SCRIPT_VER="//' | sed 's/".*//'
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
        log_info "Usage: bash docs/ai-developer/tools/set-version-bash.sh <folder-name>"
        exit 1
    fi

    local FOLDER_NAME="$1"
    local FOLDER_PATH="${SCRIPTS_DIR}/${FOLDER_NAME}"

    if [ ! -d "$FOLDER_PATH" ]; then
        log_error "ERR002: Folder not found: ${FOLDER_PATH}"
        exit 1
    fi

    # Find .sh files
    local shfiles=()
    while IFS= read -r -d '' f; do
        shfiles+=("$f")
    done < <(find "$FOLDER_PATH" -maxdepth 1 -name '*.sh' -type f -print0 | sort -z)

    if [ ${#shfiles[@]} -eq 0 ]; then
        log_info "No .sh files found in ${FOLDER_PATH}"
        exit 0
    fi

    # Show current versions
    log_info "Current versions in ${FOLDER_NAME}:"
    echo ""
    for script in "${shfiles[@]}"; do
        local name current
        name=$(basename "$script")
        current=$(extract_ver "$script")
        current="${current:-(not set)}"
        log_info "  ${name}  →  ${current}"
    done

    echo ""
    read -rp "Enter new version (e.g. 0.1.0): " NEW_VER

    if [ -z "$NEW_VER" ]; then
        log_info "No version entered. Aborting."
        exit 1
    fi

    # Update SCRIPT_VER in each file
    echo ""
    for script in "${shfiles[@]}"; do
        local name
        name=$(basename "$script")
        if grep -q 'SCRIPT_VER="' "$script"; then
            sed -i "s/SCRIPT_VER=\"[^\"]*\"/SCRIPT_VER=\"$NEW_VER\"/" "$script"
            log_success "Updated ${name} → ${NEW_VER}"
        else
            log_warning "Skipped ${name} (no SCRIPT_VER found)"
        fi
    done

    echo ""
    log_success "Version set to ${NEW_VER} in ${FOLDER_NAME}"
}

main "$@"
