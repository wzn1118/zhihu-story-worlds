param([int]$ExpectedPid = 65684, [int]$Port = 4174)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$listener = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
$owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ExpectedPid"
if ($listener.Count -ne 1 -or $listener[0].OwningProcess -ne $ExpectedPid -or $owner.Name -ne 'node.exe' -or $owner.CommandLine -notmatch '--import\s+tsx\s+server/index\.ts') {
  throw 'Preview ownership changed; no process was stopped.'
}
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
$output = Join-Path $root "output/zhihu-expansion/preview-reload-$stamp"
New-Item -ItemType Directory -Path $output | Out-Null
# The caller coordinates this verified listener; detached creative workers stay alive.
Stop-Process -Id $ExpectedPid
for ($i = 0; $i -lt 60; $i++) {
  if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw 'Preview port did not release.' }
$previousPort = $env:PORT
try {
  $env:PORT = [string]$Port
  $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--import', 'tsx', 'server/index.ts') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'server.log') -RedirectStandardError (Join-Path $output 'server.error.log')
} finally { $env:PORT = $previousPort }
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    if ($health.status -eq 'ok') { $healthy = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}
$current = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if (-not $healthy -or $current.Count -ne 1 -or $current[0].OwningProcess -ne $server.Id) { throw 'New listener failed identity or health verification; inspect this run log.' }
$discovery = Invoke-RestMethod "http://127.0.0.1:$Port/api/workshop/discovery"
if (@($discovery.candidates | Where-Object { $_.sourceHash -notmatch '^[a-f0-9]{64}$' }).Count) { throw 'The latest source-snapshot backend was not loaded.' }
$record = [pscustomobject]@{ at = $stamp; previousPid = $ExpectedPid; pid = $server.Id; port = $Port; url = "http://127.0.0.1:$Port"; sourceSnapshots = $discovery.candidates.Count; contentAddressedApi = $true; output = $output }
[System.IO.File]::WriteAllText((Join-Path $output 'verification.json'), ($record | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
$record | ConvertTo-Json
