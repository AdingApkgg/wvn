$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
$root='H:\wg-ons-pilot-20261019-1205'
$record=Get-Content "$root\reports\preview-process.json" -Raw|ConvertFrom-Json
if($record.root -ne $root){throw 'Preview record differs'}
$parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
$listener=Get-NetTCPConnection -LocalPort 18481 -State Listen -ErrorAction SilentlyContinue
if($listener){
 if($listener.LocalAddress -ne '127.0.0.1' -or !$parent -or $parent.CommandLine -notlike "*$root\launch-preview.cmd*"){throw 'Preview process ownership differs'}
 $node=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
 if($node.ParentProcessId -ne $parent.ProcessId -or $node.Name -ne 'node.exe' -or $node.CommandLine -notlike '*--import tsx server.ts*'){throw 'Preview listener ancestry differs'}
 Stop-Process -Id $node.ProcessId
}
if($parent){
 $remaining=Get-CimInstance Win32_Process -Filter "ProcessId=$($parent.ProcessId)"
 if($remaining -and $remaining.CreationDate -eq $parent.CreationDate -and $remaining.CommandLine -eq $parent.CommandLine){Stop-Process -Id $remaining.ProcessId}
}
Start-Sleep -Milliseconds 500
& "$root\scripts\start-ons-preview.ps1"
