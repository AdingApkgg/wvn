$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
if((Get-PSDrive H).Free -lt 66571993088){throw 'space_stop'}
$root='H:\wg-ons-pilot-20261019-1205'
Set-Location $root
& tar.exe -xzf 'H:\wg-ons-pilot-20261019-1205.tgz'
if($LASTEXITCODE -ne 0){throw 'Extract failed'}
@'
import fs from 'node:fs';import {createHash} from 'node:crypto';
const m=JSON.parse(fs.readFileSync('ons-source-manifest.json','utf8'));
for(const [p,h] of Object.entries(m.files)){if(createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)throw Error('Source mismatch: '+p)}
console.log(JSON.stringify({sourceFilesVerified:Object.keys(m.files).length}));
'@ | & 'C:\nvm4w\nodejs\node.exe' --input-type=module
if($LASTEXITCODE -ne 0){throw 'Source verification failed'}
$env:Path='C:\nvm4w\nodejs;'+$env:Path
foreach($check in @(@{name='ons-contract';command='node --import tsx --test tests/ons-pilot.test.ts'},@{name='npm-run-typecheck';command='npm run typecheck'},@{name='npm-run-build';command='npm run build'})){
 $name=$check.name
 & cmd.exe /d /c "$($check.command) > reports\$name.log 2>&1"
 if($LASTEXITCODE -ne 0){Get-Content "reports\$name.log" -Tail 45;throw "Failed: $($check.command)"}
 Get-Content "reports\$name.log" -Tail 5
}
if(!(Test-Path state\catalog.db)){
 $source='H:/wg-manager-release-20261019-133308/state/catalog.db'
 $destination='H:/wg-ons-pilot-20261019-1205/state/catalog.db'
 $env:WG_ONS_SOURCE_DB=$source;$env:WG_ONS_CANDIDATE_DB=$destination
 @'
import {DatabaseSync} from 'node:sqlite';
const source=new DatabaseSync(process.env.WG_ONS_SOURCE_DB,{readOnly:true});
source.exec("VACUUM INTO '"+process.env.WG_ONS_CANDIDATE_DB+"'");source.close();
'@ | & 'C:\nvm4w\nodejs\node.exe' --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Read-only catalog snapshot failed'}
}
if(Get-NetTCPConnection -LocalPort 18481 -State Listen -ErrorAction SilentlyContinue){throw 'Preview port already in use; inspect before restart'}
@'
@echo off
cd /d H:\wg-ons-pilot-20261019-1205
set WG_DATABASE=H:\wg-ons-pilot-20261019-1205\state\catalog.db
set WG_STATE_DIR=H:\wg-ons-pilot-20261019-1205\state
set WG_RESOURCE_ROOT=H:\wg
set WG_MEDIA_ROOT=H:\wg-manager-release-20261019-133308\media
set WG_ONS_PILOT=1
set WG_PORT=18481
set WG_ADMIN_PORT=18482
set NODE_ENV=production
C:\nvm4w\nodejs\node.exe --import tsx server.ts > reports\preview.log 2>&1
'@|Set-Content launch-preview.cmd -Encoding ASCII
$p=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="C:\Windows\System32\cmd.exe /d /c $root\launch-preview.cmd";CurrentDirectory=$root}
if($p.ReturnValue -ne 0){throw 'Launch failed'}
@{root=$root;host=$env:COMPUTERNAME;pid=$p.ProcessId;ports=@(18481,18482);startedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content reports\preview-process.json
Start-Sleep -Seconds 3
Invoke-RestMethod 'http://127.0.0.1:18481/health'|ConvertTo-Json
Write-Output 'WG_ONS_PREVIEW_STARTED'
