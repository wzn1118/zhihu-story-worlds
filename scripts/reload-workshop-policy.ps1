param([Parameter(Mandatory=$true)][string]$ProjectId, [Parameter(Mandatory=$true)][string]$ExpectedJobId)
$ErrorActionPreference = 'Stop'
if ($ProjectId -notmatch '^import-[0-9a-f-]{36}$' -or $ExpectedJobId -notmatch '^[0-9a-f-]{36}$') { throw 'Invalid ownership IDs.' }
$root = Split-Path -Parent $PSScriptRoot
$policy = @(& node --import tsx (Join-Path $PSScriptRoot 'check-workshop-policy.ts') $ProjectId | ConvertFrom-Json)[0]
if ($LASTEXITCODE -ne 0 -or $policy.matches -or $policy.jobId -ne $ExpectedJobId -or $policy.stage -ne 'editorial' -or $policy.status -ne 'running') { throw 'No verified active policy mismatch; no process was changed.' }
$directory = Join-Path $root ".local/story-workshop/projects/$ProjectId"
$ownerFile = Join-Path $directory 'job.lock/owner.json'
$owner = Get-Content -Raw -LiteralPath $ownerFile | ConvertFrom-Json
$worker = Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.pid)"
if ($owner.token -ne $ExpectedJobId -or $worker.Name -ne 'node.exe' -or $worker.CommandLine -notmatch 'workshop-worker\.ts' -or -not $worker.CommandLine.Contains($ProjectId) -or -not $worker.CommandLine.Contains($ExpectedJobId)) { throw 'Worker identity mismatch; no process was changed.' }
$sourceHash = (Get-FileHash -LiteralPath (Join-Path $directory 'source.json') -Algorithm SHA256).Hash
$routeHashes = @(Get-ChildItem -LiteralPath (Join-Path $directory "r$($policy.revision)") -Filter 'route-*.json' | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash)
if ($routeHashes.Count -ne 3) { throw 'Expected three retained route checkpoints.' }
$current = Get-Content -Raw -LiteralPath $ownerFile | ConvertFrom-Json
if ($current.token -ne $owner.token -or $current.pid -ne $owner.pid) { throw 'Ownership changed before stop.' }
# Stop this verified worker first, then only its project-bound creative children.
Stop-Process -Id $worker.ProcessId
$children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($worker.ProcessId)" | Where-Object { $_.Name -eq 'codex.exe' -and $_.CommandLine.Contains($ProjectId) })
foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 700
if (Get-Process -Id $worker.ProcessId -ErrorAction SilentlyContinue) { throw 'The owned worker is still running.' }
foreach ($child in $children) { if (Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue) { throw 'An owned creative child is still running; do not resume.' } }
if ((Get-FileHash -LiteralPath (Join-Path $directory 'source.json') -Algorithm SHA256).Hash -ne $sourceHash) { throw 'Source preservation verification failed.' }
foreach ($route in $routeHashes) { if ((Get-FileHash -LiteralPath $route.Path -Algorithm SHA256).Hash -ne $route.Hash) { throw 'A retained route checkpoint changed during the stop.' } }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
$output = Join-Path $root "output/zhihu-expansion/policy-reload-$stamp"
New-Item -ItemType Directory -Path $output | Out-Null
$record = [pscustomobject]@{ at=$stamp; projectId=$ProjectId; oldJobId=$ExpectedJobId; stoppedWorker=$worker.ProcessId; stoppedChildren=@($children | ForEach-Object { $_.ProcessId }); policy=$policy; sourceFileSha256=$sourceHash; retainedRoutes=$routeHashes; output=$output }
[System.IO.File]::WriteAllText((Join-Path $output 'stopped.json'), ($record | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
$record | ConvertTo-Json -Depth 6
