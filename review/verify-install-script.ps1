$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $taskRoot ([string]::Concat([char]0x5b89, [char]0x88c5, [char]0x5f00, [char]0x5c4f, '.ps1'))
$source = [System.IO.File]::ReadAllText($sourcePath, [System.Text.Encoding]::UTF8)
$fixtureRoot = Join-Path $taskRoot ('temp/install-check-' + [Guid]::NewGuid().ToString('N'))
$utf8Bom = [System.Text.UTF8Encoding]::new($true)
$engines = @((Get-Command powershell.exe).Source, (Get-Command pwsh.exe).Source)

function Assert-True($condition, $message) {
    if (-not $condition) { throw $message }
}

try {
    foreach ($engine in $engines) {
        foreach ($scenario in @('original', 'previous', 'installed', 'unknown', 'bad-package', 'bad-backup')) {
            $caseRoot = Join-Path $fixtureRoot ([Guid]::NewGuid().ToString('N'))
            $appRoot = Join-Path $caseRoot 'app'
            $profileRoot = Join-Path $caseRoot 'profile'
            $oldProfile = Join-Path $profileRoot '@deepseek-ai/dsh-desktop'
            New-Item -ItemType Directory -Path (Join-Path $caseRoot 'backup'), (Join-Path $caseRoot 'delivery'), (Join-Path $appRoot 'resources'), $oldProfile -Force | Out-Null
            [System.IO.File]::WriteAllText((Join-Path $oldProfile 'preferences'), 'existing-preferences')
            $backup = Join-Path $caseRoot 'backup/app.original.asar'
            $prepared = Join-Path $caseRoot 'delivery/app.asar'
            $target = Join-Path $appRoot 'resources/app.asar'
            $previous = Join-Path $caseRoot 'previous.asar'
            [System.IO.File]::WriteAllText($backup, 'original-resource')
            [System.IO.File]::WriteAllText($prepared, 'patched-resource')
            [System.IO.File]::WriteAllText($previous, 'previous-resource')
            $manifest = @{
                originalSha256 = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
                patchedSha256 = (Get-FileHash -LiteralPath $prepared -Algorithm SHA256).Hash.ToLowerInvariant()
                previousPatchedSha256 = (Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash.ToLowerInvariant()
            }
            [System.IO.File]::WriteAllText((Join-Path $caseRoot 'delivery/manifest.json'), ($manifest | ConvertTo-Json), $utf8Bom)
            $initial = switch ($scenario) {
                'previous' { 'previous-resource' }
                'installed' { 'patched-resource' }
                'unknown' { 'new-version-resource' }
                default { 'original-resource' }
            }
            [System.IO.File]::WriteAllText($target, $initial)
            $initialHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($scenario -eq 'bad-package') { [System.IO.File]::WriteAllText($prepared, 'corrupt-package') }
            if ($scenario -eq 'bad-backup') { [System.IO.File]::WriteAllText($backup, 'corrupt-backup') }
            # Redirect application and profile paths into fixtures; preserve the actual file encoding.
            $fixtureSource = $source.Replace('D:\dsh-latest-windows-x64', $appRoot).Replace('$env:APPDATA', ("'" + $profileRoot + "'"))
            $fixtureScript = Join-Path $caseRoot 'install.ps1'
            $fixtureTextBytes = [System.Text.Encoding]::UTF8.GetBytes($fixtureSource)
            $sourceBytes = [System.IO.File]::ReadAllBytes($sourcePath)
            if ($sourceBytes[0] -eq 0xef -and $sourceBytes[1] -eq 0xbb -and $sourceBytes[2] -eq 0xbf) {
                $fixtureTextBytes = [byte[]]($utf8Bom.GetPreamble() + $fixtureTextBytes)
            }
            [System.IO.File]::WriteAllBytes($fixtureScript, $fixtureTextBytes)
            $messages = & $engine -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $fixtureScript 2>&1
            $code = $LASTEXITCODE
            $successExpected = $scenario -in @('original', 'previous', 'installed')
            Assert-True (($code -eq 0) -eq $successExpected) ($scenario + ': unexpected exit code ' + $code + '. ' + ($messages | Out-String))
            $expectedContent = if ($successExpected) { 'patched-resource' } else { $initial }
            Assert-True ([System.IO.File]::ReadAllText($target) -eq $expectedContent) ($scenario + ': unexpected target content')
            $installBackup = Join-Path $caseRoot ('backup/app.before-install-' + $initialHash.Substring(0,12) + '.asar')
            if ($scenario -in @('original', 'previous')) {
                Assert-True ([System.IO.File]::ReadAllText($installBackup) -eq $initial) ($scenario + ': previous application was not backed up')
                foreach ($folder in @('desktop', 'application-data', 'temp', 'logs', 'crash-dumps')) {
                    Assert-True (Test-Path -LiteralPath (Join-Path $appRoot ('resources/harness-local-data/' + $folder)) -PathType Container) ('Missing data folder: ' + $folder)
                }
            } else {
                Assert-True (-not (Test-Path -LiteralPath $installBackup)) ($scenario + ': unexpected replacement backup')
            }
            if ($scenario -eq 'original') {
                Assert-True ([System.IO.File]::ReadAllText((Join-Path $appRoot 'resources/harness-local-data/desktop/preferences')) -eq 'existing-preferences') 'Desktop preferences were not migrated.'
            }
            Assert-True (-not (Test-Path -LiteralPath (Join-Path $appRoot 'resources/app.splash-staged.asar'))) ($scenario + ': unexpected staged resource')
            Write-Output ('PASS: ' + [System.IO.Path]::GetFileName($engine) + ' - ' + $scenario)
        }
    }
} finally {
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    $allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $taskRoot 'temp')) + [System.IO.Path]::DirectorySeparatorChar
    if ($resolvedFixture.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedFixture)) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}
