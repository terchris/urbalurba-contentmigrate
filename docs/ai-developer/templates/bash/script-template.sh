#!/bin/bash
# File: <your-script-name>.sh
#
# Usage:
#   <your-script-name> [OPTIONS]
#   <your-script-name> [-h|--help]
#
# Purpose:
#   <One-line description of what this script does>
#
# Author: <Your Name>
# Created: <Month Year>
#
# The help() function, logging, and argument parsing are ready to use.
# Do not change the help() structure — the test runner validates it.

set -euo pipefail

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

SCRIPT_ID="my-script"
SCRIPT_NAME="My Script"
SCRIPT_VER="0.0.1"
SCRIPT_DESCRIPTION="One-line description of what this script does."
SCRIPT_CATEGORY="DEVOPS"
# SCRIPT_CHECK_COMMAND="command -v my-tool >/dev/null 2>&1"  # Recommended for install/config scripts

#------------------------------------------------------------------------------
# CONFIGURATION
#------------------------------------------------------------------------------

# Put all URLs, paths, filenames, and defaults here as variables.
# Functions should only reference variables - never hardcode values inline.

#------------------------------------------------------------------------------
# LOGGING
#------------------------------------------------------------------------------

log_time()    { date +%H:%M:%S; }
log_info()    { echo "[$(log_time)] INFO  $*" >&2; }
log_success() { echo "[$(log_time)] OK    $*" >&2; }
log_error()   { echo "[$(log_time)] ERROR $*" >&2; }
log_warning() { echo "[$(log_time)] WARN  $*" >&2; }
log_start()   { log_info "Starting: $SCRIPT_NAME Ver: $SCRIPT_VER"; }

#------------------------------------------------------------------------------
# HELP
#------------------------------------------------------------------------------

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

#------------------------------------------------------------------------------
# ARGUMENT PARSING
#------------------------------------------------------------------------------

# Uncomment for install scripts (see script-standard.md Script Types):
# UNINSTALL_MODE=0

while [ "${1:-}" != "" ] && [[ "${1:-}" == -* ]]; do
    case "$1" in
        -h|--help)
            help
            exit 0
            ;;
        # --uninstall)
        #     UNINSTALL_MODE=1
        #     shift
        #     ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

#------------------------------------------------------------------------------
# HELPER FUNCTIONS
#------------------------------------------------------------------------------

# Add your functions here

#------------------------------------------------------------------------------
# MAIN
#------------------------------------------------------------------------------

main() {
    log_start

    # Your code here

    log_success "$SCRIPT_NAME completed"
}

main "$@"
