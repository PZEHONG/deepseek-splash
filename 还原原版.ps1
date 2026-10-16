$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
if (@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue).Count -gt 0) { throw '请先完全退出 DeepSeek Harness。' }
$manifest = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'delivery\manifest.json') | ConvertFrom-Json
$target = 'D:\dsh-latest-windows-x64\resources\app.asar'
$currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
if ($currentHash -eq $manifest.originalSha256) { Write-Output '当前已是原版。'; exit 0 }
if ($currentHash -ne $manifest.patchedSha256) { throw '应用版本已变化，已停止还原。' }
$backup = Join-Path $taskRoot 'backup\app.original.asar'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash.ToLowerInvariant() -ne $manifest.originalSha256) { throw '备份校验失败。' }
$staged = 'D:\dsh-latest-windows-x64\resources\app.restore-staged.asar'
Copy-Item -LiteralPath $backup -Destination $staged -Force
[System.IO.File]::Replace($staged, $target, (Join-Path $taskRoot 'backup\app.patched-before-restore.asar'))
Write-Output '原版资源已还原。D 盘开屏文件和缓存保留。原版恢复原有数据路径设置。'
