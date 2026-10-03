<#
.SYNOPSIS
    Standardized build & packaging script for userscript-lestrades-toolkit.
.DESCRIPTION
    Validates documentation structure and creates a versioned source archive into archives/.
#>

[CmdletBinding()]
param(
    [switch]$SkipArchive
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir
try {
    # 1. Determine version from CHANGELOG.md
    $Changelog = "CHANGELOG.md"
    if (-not (Test-Path $Changelog)) {
        throw "CHANGELOG.md not found"
    }

    $Content = Get-Content -Raw $Changelog
    if ($Content -match '##\s+\[([0-9.]+)\]') {
        $Version = $Matches[1]
    } else {
        $Version = "1.0.0"
    }
    Write-Host "==> Building userscript-lestrades-toolkit v$Version..." -ForegroundColor Cyan

    # 2. Document validation
    Write-Host "==> Validating project files..." -ForegroundColor Yellow
    $requiredFiles = @("API_REFERENCE.md", "README.md", "CHANGELOG.md", "AGENTS.md")
    foreach ($f in $requiredFiles) {
        if (-not (Test-Path $f)) {
            throw "Required file missing: $f"
        }
    }
    Write-Host "    [OK] All documentation files present." -ForegroundColor Green

    # 3. Source archive
    if (-not $SkipArchive) {
        $ArchiveDir = Join-Path $ScriptDir "archives"
        if (-not (Test-Path $ArchiveDir)) {
            New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
        }

        $ZipName = "lestrades-api-reference_v$($Version)_src.zip"
        $ZipPath = Join-Path $ArchiveDir $ZipName

        if (Test-Path $ZipPath) {
            Remove-Item $ZipPath -Force
        }

        Write-Host "==> Creating source archive: $ZipName..." -ForegroundColor Yellow

        $excludeNames = @("archives", ".git")
        $filesToZip = Get-ChildItem -Path $ScriptDir -Exclude $excludeNames | Where-Object {
            $_.Name -notlike "*.zip"
        }

        Compress-Archive -Path $filesToZip.FullName -DestinationPath $ZipPath -Force
        $zipSize = (Get-Item $ZipPath).Length / 1KB
        Write-Host "    [OK] Archive created: $ZipPath ($([math]::Round($zipSize, 2)) KB)" -ForegroundColor Green
    }

    Write-Host "==> Build and validation completed successfully!" -ForegroundColor Green
}
finally {
    Pop-Location
}
