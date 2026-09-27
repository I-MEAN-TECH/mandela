$ProgressPreference = 'SilentlyContinue'
try {
  $t0 = Get-Date
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3101/login' -UseBasicParsing -TimeoutSec 10
  $ms = ((Get-Date) - $t0).TotalMilliseconds
  Write-Output ("PS 3101/login: {0} in {1:N0} ms, {2} bytes" -f $r.StatusCode, $ms, $r.RawContentLength)
} catch { Write-Output ("PS 3101/login FAILED: {0}" -f $_.Exception.Message) }
try {
  $t1 = Get-Date
  $r2 = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/web/pulse' -Headers @{ 'x-mandela-host' = 'demo.mandela.school' } -UseBasicParsing -TimeoutSec 10
  $ms2 = ((Get-Date) - $t1).TotalMilliseconds
  Write-Output ("PS 4000/pulse: {0} in {1:N0} ms, {2} bytes" -f $r2.StatusCode, $ms2, $r2.RawContentLength)
} catch { Write-Output ("PS 4000/pulse FAILED: {0}" -f $_.Exception.Message) }
