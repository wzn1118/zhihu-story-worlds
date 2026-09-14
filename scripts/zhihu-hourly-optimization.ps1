$ErrorActionPreference = 'Continue'
$root = 'E:\知乎'
$out = Join-Path $root 'output\coordination\zhihu-hourly'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $out "$stamp.json"
$health = $null
try { $health = Invoke-RestMethod 'http://127.0.0.1:4173/api/health' -TimeoutSec 8 } catch { $health = @{ status = 'unavailable'; error = $_.Exception.Message } }
$frame = $null
try { $frame = Invoke-RestMethod 'http://127.0.0.1:4173/api/zhihu-browser/frame' -TimeoutSec 15 } catch { $frame = @{ status = 'unavailable'; error = $_.Exception.Message } }
$payload = [ordered]@{
  timestamp = (Get-Date).ToString('o')
  purpose = 'hourly zhihu collection and drag UX health check'
  health = $health
  browser = [ordered]@{ status = $frame.status; url = $frame.url; posts = @($frame.posts).Count; document = [bool]$frame.document; message = $frame.message }
  policy = 'reuse current session; no login changes; no paid requests; no story mutation'
}
$payload | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $report
# Keep only the latest 48 hourly receipts.
Get-ChildItem $out -Filter '*.json' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 48 | Remove-Item -Force -ErrorAction SilentlyContinue
