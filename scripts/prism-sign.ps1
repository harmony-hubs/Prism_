# Run prism-client sign from the repo root (PowerShell).
# Requires: Rust toolchain; protoc (bundled under tools/protoc/bin if present).
# Set your secrets via parameters or environment variables — do not commit keypairs.

param(
    [Parameter(Mandatory = $true)]
    [string] $Keypair,
    [Parameter(Mandatory = $true)]
    [string] $PrismProgramId,
    [string] $Dwallet = "2Emhnhn3KcEhaQFaWAZstKL91psYwQs2XTe56H5qTmeQ",
    [string] $Message = "b8ea7a50f36d6aed37f52d1d46cc01e189bda1b538cd687149d7917a68818505",
    [string] $Chain = "sol"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$ProtocExe = Join-Path $Root "tools\protoc\bin\protoc.exe"
if (Test-Path $ProtocExe) {
    $env:PROTOC = $ProtocExe
} else {
    Write-Warning "tools/protoc/bin/protoc.exe not found. Install protoc or set PROTOC to protoc.exe path. See https://github.com/protocolbuffers/protobuf/releases"
}

$env:PRISM_PROGRAM_ID = $PrismProgramId

Write-Host "Running: cargo run -p prism-client -- sign (from $Root)" -ForegroundColor Cyan
& cargo run -p prism-client -- sign `
    --keypair $Keypair `
    --dwallet $Dwallet `
    --message $Message `
    --chain $Chain
