$ErrorActionPreference = "Stop"

# The desktop backend reads the account service URL from the Rust build-time
# environment (option_env!("ACCOUNT_API_BASE_URL")). Local development runs
# PocketBase on http://127.0.0.1:8090, so default to that and allow an
# explicit override through the existing environment variable.
if ([string]::IsNullOrWhiteSpace($env:ACCOUNT_API_BASE_URL)) {
    $env:ACCOUNT_API_BASE_URL = "http://127.0.0.1:8090"
}

Write-Host "Building Windows release with ACCOUNT_API_BASE_URL=$env:ACCOUNT_API_BASE_URL"

Push-Location (Join-Path $PSScriptRoot "..")
try {
    npm run tauri:build:windows
} finally {
    Pop-Location
}
