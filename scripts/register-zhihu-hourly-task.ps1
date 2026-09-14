$ErrorActionPreference = 'Stop'
$taskName = 'ZhihuStoryWorlds-HourlyUX'
$script = 'E:\知乎\scripts\zhihu-hourly-optimization.ps1'
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Hourly non-invasive Zhihu collection and drag UX health check' -Force | Out-Null
Write-Output "registered:$taskName"
