Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CreationDate)|$($_.CommandLine)" } | Out-File -Encoding utf8 .freebuff\node-procs.txt
