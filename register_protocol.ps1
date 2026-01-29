$exePath = "S:\_projects_\_streaming-tools_\heychat\src-tauri\target\debug\heychat.exe"
$protocol = "heychat"

if (-not (Test-Path $exePath)) {
    Write-Error "Could not find executable at $exePath. Have you run 'bun run tauri dev' at least once?"
    exit 1
}

$registryPath = "HKCU:\Software\Classes\$protocol"

New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name "(default)" -Value "URL:HeyChat Protocol" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$commandPath = "$registryPath\shell\open\command"
New-Item -Path $commandPath -Force | Out-Null
New-ItemProperty -Path $commandPath -Name "(default)" -Value "`"$exePath`" `"%1`"" -PropertyType String -Force | Out-Null

Write-Host "Protocol '${protocol}://' registered successfully for '$exePath'!"
Write-Host "You can now test the login flow."
