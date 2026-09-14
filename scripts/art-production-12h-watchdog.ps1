param(
  [ValidateRange(1, 24)][int]$Hours = 12,
  [ValidateRange(1, 64)][int]$Concurrency = 64,
  [ValidateRange(1, 64)][int]$MaxWave = 64,
  [string]$Receipt = 'output/coordination/art-remake-12h-20260912/campaign-receipt.json',
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'
$receiptPath = if ([IO.Path]::IsPathRooted($Receipt)) { $Receipt } else { Join-Path $projectRoot $Receipt }
$campaignDirectory = Split-Path -Parent $receiptPath
$campaign = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
function Convert-CampaignTime([object]$value) {
  # PowerShell 7 decodes ISO dates; parsing its formatted DateTime loses the UTC kind.
  if ($value -is [DateTimeOffset]) { return $value }
  if ($value -is [DateTime]) { return [DateTimeOffset]$value }
  return [DateTimeOffset]::Parse([string]$value)
}
$startedAt = Convert-CampaignTime $campaign.createdAt
$completionRequired = $campaign.completionRequired -eq $true
$deadline = $startedAt.AddHours($Hours)
if ($completionRequired) {
  $authorization = Get-Content -LiteralPath (Join-Path $campaignDirectory 'root-completion-required-authorization.json') -Raw -Encoding utf8 | ConvertFrom-Json
  if ($authorization.completionRequired -ne $true -or [string]::IsNullOrWhiteSpace($authorization.userQuote)) { throw 'COMPLETION_POLICY_NOT_AUTHORIZED' }
  $deadline = $null
} elseif ($campaign.expiresAt) {
  $savedDeadline = Convert-CampaignTime $campaign.expiresAt
  if ($savedDeadline -le $startedAt) { throw 'INVALID_CAMPAIGN_WINDOW' }
  if ($savedDeadline -gt $deadline) {
    # A later explicit user deadline may extend the original Hours window.
    $authorizationFile = Join-Path $campaignDirectory 'deadline-20260913-noon-authorization.json'
    $authorization = Get-Content -LiteralPath $authorizationFile -Raw -Encoding utf8 | ConvertFrom-Json
    $supersededDeadline = Convert-CampaignTime $authorization.supersedesDeadline
    if ((Convert-CampaignTime $authorization.deadline) -ne $savedDeadline -or
        $supersededDeadline -gt $deadline -or $supersededDeadline -le $startedAt -or
        [string]::IsNullOrWhiteSpace($authorization.userQuote)) { throw 'CAMPAIGN_EXTENSION_NOT_AUTHORIZED' }
  }
  $deadline = $savedDeadline
}
$window = [ordered]@{
  startedAt = $startedAt.ToString('o'); expiresAt = $(if ($completionRequired) { $null } else { $deadline.ToString('o') }); pid = $PID
  completionRequired = $completionRequired
  stopCondition = $(if ($completionRequired) { 'verified-completion' } else { 'deadline' })
  concurrency = $Concurrency; maxWave = $MaxWave
}
if ($ValidateOnly) { $window | ConvertTo-Json -Compress; return }
$lockPath = Join-Path $campaignDirectory 'watchdog.lock'
# The OS releases this handle on exit; a stale file does not create a second owner.
$lockHandle = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$lockBytes = [Text.Encoding]::UTF8.GetBytes(($window | ConvertTo-Json -Compress))
$lockHandle.SetLength(0)
$lockHandle.Write($lockBytes, 0, $lockBytes.Length)
$lockHandle.Flush()
$pauseFile = Join-Path $projectRoot 'output/imagegen/scene-production/formal-production-20260907/pause'
$runtimeFile = Join-Path $campaignDirectory 'watchdog-runtime.json'
$reviewHoldFile = Join-Path $campaignDirectory 'review-supervisor-hold.json'
$formalHoldFile = Join-Path $campaignDirectory 'formal-supervisor-hold.json'
$log = Join-Path $projectRoot 'output\imagegen\scene-production\formal-production-20260907\watchdog-12h.log'
$snapshotScript = Join-Path $campaignDirectory 'hourly-monitor-snapshot.ps1'
$snapshotLatest = Join-Path $campaignDirectory 'hourly/monitor-latest.json'
$lastSnapshotHour = $null
$nextSnapshotAttempt = [DateTimeOffset]::MinValue
if (Test-Path -LiteralPath $snapshotLatest) {
  try { $lastSnapshotHour = (Get-Content -LiteralPath $snapshotLatest -Raw -Encoding utf8 | ConvertFrom-Json).reportHourLocal } catch { }
}

function Write-WatchdogEvent([string]$event) {
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $event"
}

function Has-NodeProcess([string]$needle) {
  $nodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
  return @($nodes | Where-Object { $_.CommandLine -like "*$needle*" }).Count -gt 0
}

function Has-FormalSupervisor {
  # The art owner may execute one authorized wave and inspect it before the next.
  if (Has-NodeProcess 'scripts/art-production-formal.ts run') { return $true }
  $lockFile = Join-Path $projectRoot 'output\imagegen\scene-production\formal-production-20260907\supervisor.lock'
  if (-not (Test-Path -LiteralPath $lockFile)) { return $false }
  try {
    $owner = Get-Content -LiteralPath $lockFile -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$owner.pid) AND Name = 'node.exe'"
    return [bool]($process -and $process.CommandLine -like '*scripts/art-production-formal.ts*')
  } catch { return $false }
}

function Start-FormalSupervisor {
  Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'scripts/art-production-formal.ts', 'supervise',
    "--max-wave=$MaxWave", "--concurrency=$Concurrency", '--cooldown-seconds=60', '--idle-poll-seconds=60') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  Write-WatchdogEvent 'started formal supervisor'
}

function Start-ReviewSupervisor {
  Start-Process -FilePath $node -ArgumentList @('scripts/art-production-review-supervisor.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  Write-WatchdogEvent 'started review supervisor'
}

function Start-Publisher {
  Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'scripts/art-production-publish-manifest.ts', '--watch') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  Write-WatchdogEvent 'started publication watcher'
}

function Has-VerifiedCompletion {
  try {
    $control = Get-Content -LiteralPath $receiptPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($control.status -ne 'COMPLETE' -or $control.completionVerified -ne $true) { return $false }
    $proof = Get-Content -LiteralPath (Join-Path $campaignDirectory 'completion-evidence.json') -Raw -Encoding utf8 | ConvertFrom-Json
    return ($proof.complete -eq $true -and $proof.validationPassed -eq $true -and
      $null -ne $proof.remainingRequiredAssets -and $proof.remainingRequiredAssets -eq 0 -and
      $null -ne $proof.placeholderReferences -and $proof.placeholderReferences -eq 0 -and
      $null -ne $proof.inFlight -and $proof.inFlight -eq 0)
  } catch { return $false }
}

try {
  Write-WatchdogEvent "watchdog resumed; stop condition $($window.stopCondition); expires $($window.expiresAt)"
  $window.status = 'active'
  [IO.File]::WriteAllText($runtimeFile, ($window | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  $completed = $false
  while ($completionRequired -or [DateTimeOffset]::UtcNow -lt $deadline) {
    if ($completionRequired -and (Has-VerifiedCompletion)) { $completed = $true; break }
    # A user/production pause survives watchdog recovery and must never cause a restart loop.
    $paused = Test-Path -LiteralPath $pauseFile
    # A delegated production owner can clear its pause without the watchdog
    # starting another formal producer alongside that owner's direct runner.
    $formalHeld = Test-Path -LiteralPath $formalHoldFile
    if (-not $paused -and -not $formalHeld -and -not (Has-FormalSupervisor)) { Start-FormalSupervisor }
    $reviewHeld = Test-Path -LiteralPath $reviewHoldFile
    if (-not $reviewHeld -and -not (Has-NodeProcess 'scripts/art-production-review-supervisor.mjs')) { Start-ReviewSupervisor }
    if (-not (Has-NodeProcess 'scripts/art-production-publish-manifest.ts --watch')) { Start-Publisher }
    $snapshotHour = Get-Date -Format 'yyyy-MM-ddTHH:00'
    if ($lastSnapshotHour -ne $snapshotHour -and [DateTimeOffset]::UtcNow -ge $nextSnapshotAttempt -and (Test-Path -LiteralPath $snapshotScript)) {
      # Capture real hourly deltas even while a busy Codex thread defers its heartbeat.
      $nextSnapshotAttempt = [DateTimeOffset]::UtcNow.AddMinutes(5)
      try {
        $snapshotSummary = & $snapshotScript -Root $projectRoot -Coord $campaignDirectory
        $snapshotResult = $snapshotSummary | ConvertFrom-Json
        $lastSnapshotHour = $snapshotHour
        $window.lastHourlySnapshot = $snapshotResult.path
        $window.Remove('lastHourlySnapshotError')
        Write-WatchdogEvent "hourly snapshot saved $($snapshotResult.path)"
      } catch {
        $window.lastHourlySnapshotError = $_.Exception.Message
        Write-WatchdogEvent 'hourly snapshot failed; inspect current runtime error'
      }
    }
    $window.checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $window.admission = if ($paused) { 'paused' } else { 'enabled' }
    $window.generationDispatch = if ($formalHeld) { 'delegated-single-owner' } else { 'formal-supervisor' }
    $window.reviewDispatch = if ($reviewHeld) { 'native-short-session-handoff' } else { 'cli-supervisor' }
    [IO.File]::WriteAllText($runtimeFile, ($window | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $remaining = if ($completionRequired) { 60000 } else { ($deadline - [DateTimeOffset]::UtcNow).TotalMilliseconds }
    if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Min(60000, [Math]::Ceiling($remaining))) }
  }
  # Stop admitting new waves; existing paid requests and publication can drain.
  if (-not (Test-Path -LiteralPath $pauseFile)) {
    try {
      $pauseHandle = [IO.File]::Open($pauseFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
      try {
        $stopCode = if ($completed) { 'CAMPAIGN_VERIFIED_COMPLETE' } else { 'CAMPAIGN_WINDOW_EXPIRED' }
        $bytes = [Text.Encoding]::UTF8.GetBytes((@{ code = $stopCode; expiresAt = $window.expiresAt } | ConvertTo-Json))
        $pauseHandle.Write($bytes, 0, $bytes.Length)
      } finally { $pauseHandle.Dispose() }
    } catch {
      if (-not (Test-Path -LiteralPath $pauseFile)) { throw }
    }
  }
  $window.status = if ($completed) { 'complete' } else { 'expired' }
  [IO.File]::WriteAllText($runtimeFile, ($window | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  Write-WatchdogEvent "campaign $($window.status); no new formal waves; existing requests may drain"
} finally {
  $lockHandle.Dispose()
}
