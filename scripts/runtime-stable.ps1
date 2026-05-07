$ErrorActionPreference = "Stop"

Write-Output "Preparing stable web runtime..."

$nextProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -and
  $_.CommandLine -match "C:\\Users\\Admin\\Desktop\\Qrder" -and
  (
    $_.CommandLine -match "next\\dist\\server\\lib\\start-server\\.js" -or
    $_.CommandLine -match "next\\dist\\bin\\next.*\sstart"
  )
}

if ($nextProcesses) {
  $pids = $nextProcesses.ProcessId -join ", "
  $nextProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Output "Stopped existing Next server process(es): $pids"
} else {
  Write-Output "No existing Next server process found."
}

Write-Output "Building web app..."
& npm run build -w apps/web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "Starting web app in stable mode..."
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($portInUse) {
  Write-Output "Port 3000 is already used by PID $($portInUse.OwningProcess). Starting on port 3001."
  & npm run start -w apps/web -- -p 3001
} else {
  Write-Output "Starting on port 3000."
  & npm run start -w apps/web
}
exit $LASTEXITCODE
