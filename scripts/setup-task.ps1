$taskName = "AI Builders Digest"
$scriptPath = "d:\Trae CN\program\follow-builders\scripts\run-digest.bat"
$triggerTime = "09:00"
$description = "Daily AI Builders Digest email delivery"

$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$scriptPath`""

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force

Write-Host "Task '$taskName' has been created successfully."
Write-Host "It will run daily at $triggerTime."
Write-Host "You can manage it in Task Scheduler under Task Scheduler Library."