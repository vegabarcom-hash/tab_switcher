$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$publishDir = Join-Path $projectRoot 'comet-hotkey\publish'
$sourcePath = Join-Path $projectRoot 'comet-hotkey\Program.cs'
$exePath = Join-Path $publishDir 'CometTabHotkey.exe'
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null
Get-Process -Name 'CometTabHotkey' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name 'CometTabHotkey' -ErrorAction SilentlyContinue | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $exePath -ErrorAction SilentlyContinue

$escapedSource = $sourcePath.Replace("'", "''")
$escapedExe = $exePath.Replace("'", "''")
$compile = "Add-Type -Path '$escapedSource' -OutputAssembly '$escapedExe' -OutputType WindowsApplication"
& powershell.exe -NoProfile -Command $compile
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) {
    throw 'Failed to compile CometTabHotkey.exe'
}

$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Comet Tab Hotkey.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $publishDir
$shortcut.Description = 'Make Ctrl+Tab switch immediately to the last active Comet tab'
$shortcut.Save()

$taskName = 'Comet Tab Hotkey Watchdog'
$taskAction = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $publishDir
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)
$taskSettings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger @($logonTrigger, $watchdogTrigger) `
    -Settings $taskSettings `
    -Description 'Keeps the Comet Ctrl+Tab helper running and restarts it after failure.' `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Milliseconds 500
if (-not (Get-Process -Name 'CometTabHotkey' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $exePath -WorkingDirectory $publishDir -WindowStyle Hidden
}

Write-Host 'Hotkey helper installed with automatic restart and started.'
Write-Host 'Reload the extension at comet://extensions before testing Ctrl+Tab.'
