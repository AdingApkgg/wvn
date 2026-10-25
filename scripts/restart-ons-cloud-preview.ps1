$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
if((Get-PSDrive H).Free -lt 66571993088){throw 'space_stop'}
$root='H:\wg-ons-cloud-20261019'
$record=Get-Content "$root\reports\cloud-process.json" -Raw|ConvertFrom-Json
if($record.root -ne $root -or $record.host -ne $env:COMPUTERNAME -or $record.port -ne 18487){throw 'Wrong ownership record'}
$parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
if(!$parent -or $parent.Name -ne 'cmd.exe' -or $parent.CommandLine -notlike "*$root\launch-cloud.cmd*"){throw 'Unowned launcher'}
$listener=Get-NetTCPConnection -State Listen -LocalPort 18487 -ErrorAction SilentlyContinue
if($listener){
 $node=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
 if(!$node -or $node.Name -ne 'node.exe' -or $node.ParentProcessId -ne $record.pid -or $node.CommandLine -notmatch 'accounts-server\.ts'){throw 'Unowned account listener'}
 Stop-Process -Id $node.ProcessId -ErrorAction Stop
}
Stop-Process -Id $parent.ProcessId -ErrorAction SilentlyContinue
& "$root\scripts\start-ons-cloud-preview.ps1"
