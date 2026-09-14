param([int]$Port = 4174)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw "Port $Port is occupied; no existing process was changed."
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $root "output/workshop-art-integration/preview-$stamp"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$previous = $env:PORT
try {
  $env:PORT = [string]$Port
  $process = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--import', 'tsx', 'server/index.ts') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'server.log') -RedirectStandardError (Join-Path $output 'server.error.log')
  [pscustomobject]@{ pid = $process.Id; port = $Port; url = "http://127.0.0.1:$Port"; logs = $output } | ConvertTo-Json -Compress
} finally { $env:PORT = $previous }
