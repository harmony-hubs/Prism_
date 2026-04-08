# Build Solana on-chain crates with cargo-build-sbf.
# Requires: Agave/Solana release on PATH, or extract to repo `tools/solana-release/`.
#
# Windows: first run needs symlink rights so platform-tools can install (~/.cache/solana/...).
#   Settings -> System -> For developers -> Developer Mode = On
#   (or run the terminal as Administrator once for the install step)

param(
    [ValidateSet("program", "voting", "all")]
    [string]$Target = "all",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")

$defaultExe = Join-Path $repo "tools\solana-release\bin\cargo-build-sbf.exe"
if ($env:SOLANA_CARGO_BUILD_SBF) {
    $exe = $env:SOLANA_CARGO_BUILD_SBF
} elseif (Test-Path $defaultExe) {
    $exe = $defaultExe
} else {
    $exe = "cargo-build-sbf"
}

function Invoke-SbfBuild {
    param([string]$ManifestRel)
    $manifestPath = Join-Path $repo $ManifestRel
    Write-Host ""
    Write-Host "==> $ManifestRel" -ForegroundColor Cyan
    $argList = @("--manifest-path", $manifestPath)
    if ($Verbose) { $argList += "-v" }
    & $exe @argList
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Using: $exe" -ForegroundColor DarkGray
Write-Host "If install fails with (os error 1314): enable Windows Developer Mode for symlinks, then retry." -ForegroundColor Yellow
Write-Host ""

switch ($Target) {
    "program" { Invoke-SbfBuild "program\Cargo.toml" }
    "voting" { Invoke-SbfBuild "voting\Cargo.toml" }
    "all" {
        Invoke-SbfBuild "program\Cargo.toml"
        Invoke-SbfBuild "voting\Cargo.toml"
    }
}

Write-Host ""
Write-Host "Done. Look for the .so under each crate's target folder (see cargo-build-sbf output)." -ForegroundColor Green
