$ErrorActionPreference = "Stop"

Write-Output "Reset runtime Qrder..."

$processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -and
  $_.CommandLine -match "C:\\Users\\Admin\\Desktop\\Qrder" -and
  (
    $_.CommandLine -match "next\\dist\\server\\lib\\start-server\\.js" -or
    $_.CommandLine -match "tsx.*watch\\s+src/server\\.ts"
  )
}

if ($processes) {
  $pids = $processes.ProcessId -join ", "
  $processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Output "Stopped node processes: $pids"
} else {
  Write-Output "No matching runtime processes found."
}

$nextCache = "apps/web/.next"
if (Test-Path $nextCache) {
  Remove-Item -Path $nextCache -Recurse -Force
  Write-Output "Deleted $nextCache"
} else {
  Write-Output "$nextCache already clean"
}

Write-Output "Runtime reset complete."
