<#
.SYNOPSIS
    Standardized build & packaging script for userscript-steam-licenses.
.DESCRIPTION
    Validates JavaScript syntax and creates a versioned source archive into archives/.
#>

[CmdletBinding()]
param(
    [switch]$SkipArchive
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir
try {
    # 1. Determine version from userscript header
    $MainScript = "steam_licenses_manager.user.js"
    if (-not (Test-Path $MainScript)) {
        throw "Main script $MainScript not found"
    }

    $Content = Get-Content -Raw $MainScript
    if ($Content -match '@version\s+([0-9.]+)') {
        $Version = $Matches[1]
    } else {
        throw "Could not determine @version from $MainScript"
    }
    Write-Host "==> Building userscript-steam-licenses v$Version..." -ForegroundColor Cyan

    # 2. Syntax validation
    Write-Host "==> Checking JavaScript syntax..." -ForegroundColor Yellow
    & node -c $MainScript
    if ($LASTEXITCODE -ne 0) {
        throw "Syntax check failed for $MainScript"
    }
    Write-Host "    [OK] Userscript passed syntax validation." -ForegroundColor Green

    # 3. Source archive
    if (-not $SkipArchive) {
        $ArchiveDir = Join-Path $ScriptDir "archives"
        if (-not (Test-Path $ArchiveDir)) {
            New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
        }

        $ZipName = "steam-licenses-manager_v$($Version)_src.zip"
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
