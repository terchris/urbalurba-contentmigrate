#!/usr/bin/env pwsh
# File: <your-script-name>.ps1
#
# Usage:
#   <your-script-name>.ps1 [OPTIONS]
#   <your-script-name>.ps1 [-Help]
#
# Purpose:
#   <One-line description of what this script does>
#
# Author: <Your Name>
# Created: <Month Year>
#
# The Show-Help function, logging, and parameter block are ready to use.
# Do not change the Show-Help structure - the validation tool checks it.

[CmdletBinding()]
param(
    [switch]$Help
    # [switch]$Uninstall  # Uncomment for install scripts (see script-standard.md Script Types)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

#------------------------------------------------------------------------------
# SCRIPT METADATA
#------------------------------------------------------------------------------

$SCRIPT_ID          = "my-script"
$SCRIPT_NAME        = "My Script"
$SCRIPT_VER         = "0.0.1"
$SCRIPT_DESCRIPTION = "One-line description of what this script does."
$SCRIPT_CATEGORY    = "DEVOPS"
# $SCRIPT_CHECK_COMMAND = "Get-Command 'my-tool' -ErrorAction SilentlyContinue"  # Recommended for install/config scripts

#------------------------------------------------------------------------------
# CONFIGURATION
#------------------------------------------------------------------------------

# Put all URLs, paths, filenames, and defaults here as variables.
# Functions should only reference variables - never hardcode values inline.

#------------------------------------------------------------------------------
# LOGGING
#------------------------------------------------------------------------------

function log_time    { Get-Date -Format 'HH:mm:ss' }
function log_info    { param([string]$msg) Write-Host "[$( log_time )] INFO  $msg" }
function log_success { param([string]$msg) Write-Host "[$( log_time )] OK    $msg" }
function log_error   { param([string]$msg) Write-Host "[$( log_time )] ERROR $msg" }
function log_warning { param([string]$msg) Write-Host "[$( log_time )] WARN  $msg" }
function log_start   { log_info "Starting: $SCRIPT_NAME Ver: $SCRIPT_VER" }

#------------------------------------------------------------------------------
# HELP
#------------------------------------------------------------------------------

function Show-Help {
    Write-Host "$SCRIPT_NAME (v$SCRIPT_VER)"
    Write-Host "$SCRIPT_DESCRIPTION"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  $SCRIPT_ID [-Help]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help     Show this help message"
    Write-Host ""
    Write-Host "Metadata:"
    Write-Host "  ID:       $SCRIPT_ID"
    Write-Host "  Category: $SCRIPT_CATEGORY"
}

if ($Help) {
    Show-Help
    exit 0
}

#------------------------------------------------------------------------------
# HELPER FUNCTIONS
#------------------------------------------------------------------------------

# Add your functions here

#------------------------------------------------------------------------------
# MAIN
#------------------------------------------------------------------------------

log_start

# Your code here

log_success "$SCRIPT_NAME completed"
