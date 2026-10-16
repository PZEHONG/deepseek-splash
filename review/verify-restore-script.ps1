$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $taskRoot ([string]::Concat([char]0x8fd8, [char]0x539f, [char]0x539f, [char]0x7248, '.ps1'))
$source = [System.IO.File]::ReadAllText($sourcePath, [System.Text.Encoding]::UTF8)
$engines = @((Get-Command powershell.exe).Source, (Get-Command pwsh.exe).Source)
$fixtureRoot = Join-Path $taskRoot ('temp/restore-check-' + [Guid]::NewGuid().ToString('N'))
$utf8Bom = [System.Text.UTF8Encoding]::new($true)

function Assert-True($condition, $message) {
    if (-not $condition) { throw $message }
}

function Invoke-Restore($engine, $scriptPath) {
    $messages = & $engine -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $scriptPath 2>&1
    return @{ Code = $LASTEXITCODE; Messages = ($messages | Out-String) }
}

try {
    foreach ($engine in $engines) {
        $caseRoot = Join-Path $fixtureRoot ([Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path (Join-Path $caseRoot 'backup'), (Join-Path $caseRoot 'delivery'), (Join-Path $caseRoot 'resources') -Force | Out-Null
        $target = Join-Path $caseRoot 'resources/app.asar'
        $staged = Join-Path $caseRoot 'resources/app.restore-staged.asar'
        $backup = Join-Path $caseRoot 'backup/app.original.asar'
        $restoreBackup = Join-Path $caseRoot 'backup/app.patched-before-restore.asar'
        $fixtureScript = Join-Path $caseRoot 'restore.ps1'
        # Redirect the two fixed application paths; run all remaining production code unchanged.
        $fixtureSource = $source.Replace('D:\dsh-latest-windows-x64\resources\app.asar', $target).Replace('D:\dsh-latest-windows-x64\resources\app.restore-staged.asar', $staged)
        [System.IO.File]::WriteAllText($fixtureScript, $fixtureSource, $utf8Bom)
        [System.IO.File]::WriteAllText($backup, 'original-resource')
        [System.IO.File]::WriteAllText($target, 'patched-resource')
        $manifest = @{
            originalSha256 = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
            patchedSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        [System.IO.File]::WriteAllText((Join-Path $caseRoot 'delivery/manifest.json'), ($manifest | ConvertTo-Json), $utf8Bom)

        $result = Invoke-Restore $engine $fixtureScript
        Assert-True ($result.Code -eq 0) ('Restore failed: ' + $result.Messages)
        Assert-True ([System.IO.File]::ReadAllText($target) -eq 'original-resource') 'Original resource was not restored.'
        Assert-True ([System.IO.File]::ReadAllText($restoreBackup) -eq 'patched-resource') 'Patched resource backup was not preserved.'
        Assert-True (-not (Test-Path -LiteralPath $staged)) 'Staged file was not consumed.'

        $result = Invoke-Restore $engine $fixtureScript
        Assert-True ($result.Code -eq 0) ('Second restore failed: ' + $result.Messages)
        Assert-True ([System.IO.File]::ReadAllText($restoreBackup) -eq 'patched-resource') 'Repeated restore changed the saved patched resource.'

        [System.IO.File]::WriteAllText($target, 'new-version-resource')
        $result = Invoke-Restore $engine $fixtureScript
        Assert-True ($result.Code -ne 0) 'Unknown application version was accepted.'
        Assert-True ([System.IO.File]::ReadAllText($target) -eq 'new-version-resource') 'Unknown version was overwritten.'

        [System.IO.File]::WriteAllText($target, 'patched-resource')
        [System.IO.File]::WriteAllText($backup, 'corrupt-backup')
        $result = Invoke-Restore $engine $fixtureScript
        Assert-True ($result.Code -ne 0) 'Corrupt backup was accepted.'
        Assert-True ([System.IO.File]::ReadAllText($target) -eq 'patched-resource') 'Target changed with a corrupt backup.'
        Write-Output ('PASS: ' + $engine + ' - restore, repeat, unknown version, corrupt backup')
    }
} finally {
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    $allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $taskRoot 'temp')) + [System.IO.Path]::DirectorySeparatorChar
    if ($resolvedFixture.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedFixture)) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}
