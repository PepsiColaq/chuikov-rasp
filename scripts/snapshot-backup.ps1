# Локальная копия исходников rasp (без node_modules, dist и .git).
# Запуск из любой папки: powershell -File scripts/snapshot-backup.ps1
$ErrorActionPreference = "Stop"
$src = Split-Path (Split-Path $PSScriptRoot -Parent) -Leaf
$root = Split-Path $PSScriptRoot -Parent
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$name = if ($args[0]) { $args[0] } else { "rasp-$stamp" }
$dest = Join-Path (Split-Path $root -Parent) "backups\$name"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
& robocopy $root $dest /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }
Write-Host "Backup: $dest"
