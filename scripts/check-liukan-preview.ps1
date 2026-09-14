$ports = 4173,4180
foreach ($port in $ports) {
  $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listener.OwningProcess)
    [pscustomobject]@{ Port=$port; Pid=$listener.OwningProcess; Command=$owner.CommandLine } | ConvertTo-Json -Compress
  }
}
