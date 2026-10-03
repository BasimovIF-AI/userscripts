# Userscripts Collection — Build & Verification Automation
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

Write-Host "=== [1/3] Verifying JavaScript Syntax ===" -ForegroundColor Cyan
$scripts = Get-ChildItem -Path $PSScriptRoot -Filter "*.user.js"

foreach ($f in $scripts) {
    node -c $f.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Syntax check failed in $($f.Name)"
        exit 1
    }
    Write-Host "  ✓ $($f.Name)" -ForegroundColor Green
}

Write-Host "`n=== [2/3] Detecting Release Version ===" -ForegroundColor Cyan
$version = "1.0.0"
$changelog = Get-Content "$PSScriptRoot/CHANGELOG.md" -Raw -Encoding UTF8
if ($changelog -match '##\s+\[([0-9\.]+)\]') {
    $version = $Matches[1]
}
Write-Host "Current collection version: v$version" -ForegroundColor Green

Write-Host "`n=== [3/3] Packaging Release Archive to archives/ ===" -ForegroundColor Cyan
$archivesDir = Join-Path $PSScriptRoot "archives"
if (-not (Test-Path $archivesDir)) {
    New-Item -ItemType Directory -Path $archivesDir | Out-Null
}

$srcZipName = "userscripts-collection_v${version}_src.zip"
$srcZipPath = Join-Path $archivesDir $srcZipName

$excludeItems = @('.git', 'archives', 'node_modules', '.vscode', '.idea')
$tempSrcDir = Join-Path $env:TEMP "userscripts_src_${version}_$([Guid]::NewGuid().ToString().Substring(0,8))"
New-Item -ItemType Directory -Path $tempSrcDir | Out-Null

try {
    Get-ChildItem -Path $PSScriptRoot | Where-Object { $excludeItems -notcontains $_.Name } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $tempSrcDir -Recurse -Force
    }
    if (Test-Path $srcZipPath) { Remove-Item $srcZipPath -Force }
    Compress-Archive -Path "$tempSrcDir\*" -DestinationPath $srcZipPath -CompressionLevel Optimal
    Write-Host "Created source archive: archives/$srcZipName" -ForegroundColor Green
} finally {
    if (Test-Path $tempSrcDir) { Remove-Item $tempSrcDir -Recurse -Force }
}

Write-Host "`n[SUCCESS] Build and verification completed successfully for userscripts collection v$version!" -ForegroundColor Green
