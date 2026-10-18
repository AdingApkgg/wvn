$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$root='H:\wg-manager-preview-20261019';$record=Get-Content "$root\preview-process.json" -Raw|ConvertFrom-Json
$parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
if($parent -and $parent.CommandLine -like '*H:\wg-manager-preview-20261019\scripts\launch-loopback.cmd*'){
 $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($record.pid)")
 foreach($child in $children){if($child.Name -eq 'node.exe' -and $child.CommandLine -like '*--import tsx server.ts*'){Stop-Process -Id $child.ProcessId -ErrorAction Stop}}
 Stop-Process -Id $parent.ProcessId -ErrorAction SilentlyContinue
 'Stopped only the recorded isolated preview process.'
}else{throw 'Preview identity mismatch; refusing stop'}
