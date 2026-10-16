$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$env:TEMP = Join-Path $taskRoot 'temp'
$env:TMP = $env:TEMP
$appRoot = 'D:\dsh-latest-windows-x64'
$target = Join-Path $appRoot 'resources\app.asar'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'delivery\manifest.json') | ConvertFrom-Json
$running = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) { throw '请先在系统托盘中完全退出 DeepSeek Harness，再安装开屏。安装程序不会强制关闭应用。' }
$currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
if ($currentHash -eq $manifest.patchedSha256) { Write-Output '开屏已安装。'; exit 0 }
if ($currentHash -ne $manifest.originalSha256 -and $currentHash -ne $manifest.previousPatchedSha256) { throw '应用资源已变化，已停止安装以保护现有版本。' }
$prepared = Join-Path $taskRoot 'delivery\app.asar'
if (-not (Test-Path -LiteralPath $prepared)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 delivery\app.asar，且未检测到 Node.js。请安装 Node.js 18 或更高版本后重试（首次运行需要自动构建开屏安装包）。' }
  Write-Output '未找到 delivery\app.asar，正在基于本机已安装的 DeepSeek Harness 自动构建开屏安装包……'
  node (Join-Path $taskRoot 'build-package.mjs')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $prepared)) { throw '自动构建失败。请确认本机安装的 DeepSeek Harness 为对应的原始版本（脚本按 manifest 哈希校验版本一致性）。' }
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $prepared).Hash.ToLowerInvariant() -ne $manifest.patchedSha256) { throw '开屏安装包校验失败。' }
$backup = Join-Path $taskRoot 'backup\app.original.asar'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash.ToLowerInvariant() -ne $manifest.originalSha256) { throw '原始资源备份校验失败。' }
$dataRoot = Join-Path $appRoot 'resources\harness-local-data'
foreach ($folder in @('desktop', 'application-data', 'temp', 'logs', 'crash-dumps')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot $folder) | Out-Null
}
# Preserve readable desktop preferences and cookies when relocating the profile.
$oldProfile = Join-Path $env:APPDATA '@deepseek-ai\dsh-desktop'
$newProfile = Join-Path $dataRoot 'desktop'
if ($currentHash -eq $manifest.originalSha256 -and (Test-Path -LiteralPath $oldProfile)) {
  try { Get-ChildItem -Force -LiteralPath $oldProfile | Copy-Item -Destination $newProfile -Force -Recurse -ErrorAction Stop }
  catch { Write-Warning '旧桌面缓存不可读，将使用新的 D 盘缓存。既有 DSH_HOME 账号和会话目录保留。' }
}
$staged = Join-Path $appRoot 'resources\app.splash-staged.asar'
Copy-Item -LiteralPath $prepared -Destination $staged -Force
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $staged).Hash.ToLowerInvariant() -ne $manifest.patchedSha256) { throw '复制后的资源校验失败。' }
if (@(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue).Count -gt 0) { throw '应用重新启动了，已停止替换资源。' }
$installBackup = Join-Path $taskRoot ('backup\app.before-install-' + $currentHash.Substring(0,12) + '.asar')
[System.IO.File]::Replace($staged, $target, $installBackup)
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant() -ne $manifest.patchedSha256) { throw '安装后校验失败。' }
Write-Output '开屏已安装。下次完全启动 DeepSeek Harness 时播放；所有新增缓存和日志位于 D 盘。'
