foreach($d in @('doc templates','m template','.agents','.planning','.freebuff','.claude')){
  if(Test-Path $d){
    $s=(Get-ChildItem $d -Recurse -File | Measure-Object -Property Length -Sum).Sum/1MB
    Write-Host ($d + ': ' + [math]::Round($s,1) + ' MB')
  }
}
