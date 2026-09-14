param([int]$Port = 4174)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port already has a listener; no process was changed." }
$output = Join-Path $root 'output/zhihu-experience'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$previousPort = $env:PORT
try {
  $env:PORT = [string]$Port
  $node = (Get-Command node).Source
  $process = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'server/index.ts') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output "preview-$Port.log") -RedirectStandardError (Join-Path $output "preview-$Port.error.log")
  [pscustomobject]@{ pid = $process.Id; port = $Port; url = "http://127.0.0.1:$Port" } | ConvertTo-Json -Compress
} finally { $env:PORT = $previousPort }
