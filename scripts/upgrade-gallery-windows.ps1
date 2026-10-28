param(
 [Parameter(Mandatory=$true)][ValidatePattern('^20261019-[0-9]{6}$')][string]$UpgradeId,
 [Parameter(Mandatory=$true)][ValidateSet('Stage','Promote','Confirm','Rollback')][string]$Mode
)
throw '历史 SQLite 启动或复制发布流程已停用；尚未完成当前 Windows PostgreSQL 实机验证。请按 docs/platform-postgres.md 使用显式 PG 配置与持久化任务；此入口不会执行后续历史正文。'
# 以下保留历史正文，仅供审查，禁止执行。
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Text.UTF8Encoding]::new($false)
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
$live='H:\wg-manager-release-20261019-133308'
$inbox="H:\wg-manager-ui-$UpgradeId"
$stage="$inbox\candidate"
$node='C:\nvm4w\nodejs\node.exe'
$taskName='WG-Manager-20261019-133308'
$config='C:\ProgramData\CaddyWG\Caddyfile'
$expectedConfig='B62AE14900CA682FE703BA7D37DE2B31555F3C5616AF6BB825D4C15BC1E06C01'
$expectedOldBuild='6F818B5D3CF0B9FD7E248930DA0CD60EE73B744E450C94ECB5B4BDB387D63AAC'
$receiptFile="$inbox\receipt.json"
$manifest=Get-Content "$inbox\wg-gallery-ui-manifest.json" -Raw | ConvertFrom-Json
function Save($r){$r | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $receiptFile}
function Assert-Task {
 $task=Get-ScheduledTask -TaskName $taskName
 if($task.Actions.Count -ne 1 -or $task.Actions[0].WorkingDirectory -ne $live -or $task.Actions[0].Execute -ne 'C:\Windows\System32\cmd.exe' -or $task.Actions[0].Arguments -ne "/d /c `"$live\scripts\launch-production.cmd`""){throw 'Production task identity differs'}
 if((Get-FileHash $config -Algorithm SHA256).Hash -ne $expectedConfig){throw 'Caddy configuration changed'}
}
function Assert-Runtime {
 foreach($p in $manifest.runtimeHashes.PSObject.Properties){
  if((Get-FileHash (Join-Path $live $p.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.Value){throw "Production runtime differs: $($p.Name)"}
 }
}
function Stop-Live {
 Assert-Task
 $listener=Get-NetTCPConnection -LocalPort 8381 -State Listen
 if($listener.LocalAddress -ne '127.0.0.1'){throw 'Unexpected production listener'}
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
 if($process.Name -ne 'node.exe' -or $process.CommandLine -notlike '*--import tsx server.ts*'){throw 'Unexpected production process'}
 $parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"
 if($parent.CommandLine -notlike "*$live\scripts\launch-production.cmd*"){throw 'Production process ancestry differs'}
 Stop-ScheduledTask -TaskName $taskName
 $remaining=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)"
 if($remaining){
  if($remaining.CreationDate -ne $process.CreationDate -or $remaining.CommandLine -ne $process.CommandLine){throw 'Process identity changed'}
  Stop-Process -Id $remaining.ProcessId
 }
 for($attempt=0;$attempt -lt 10;$attempt++){
  if(!(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8381,8382)})){return}
  Start-Sleep -Milliseconds 300
 }
 throw 'Production listeners did not close'
}
function Start-Live {
 Start-ScheduledTask -TaskName $taskName
 for($attempt=0;$attempt -lt 30;$attempt++){
  try {if((Invoke-RestMethod 'http://127.0.0.1:8381/health' -TimeoutSec 2).status -eq 'ok'){return}}catch{}
  Start-Sleep -Seconds 1
 }
 throw 'Production health did not recover'
}
function Stop-Candidate {
 if(!(Test-Path "$inbox\candidate-process.json")){return}
 $record=Get-Content "$inbox\candidate-process.json" -Raw | ConvertFrom-Json
 $parent=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
 if(!$parent){return}
 if($parent.CommandLine -notlike "*$inbox\launch-candidate.cmd*"){throw 'Candidate process identity differs'}
 foreach($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($record.pid)")){
  if($child.Name -eq 'node.exe' -and $child.CommandLine -like '*--import tsx server.ts*'){Stop-Process -Id $child.ProcessId}
 }
 Stop-Process -Id $parent.ProcessId -ErrorAction SilentlyContinue
}
function Verify-Http([string]$base){
 $env:WG_TEST_URL=$base
 & $node "$live\scripts\verify-preview.mjs"
 if($LASTEXITCODE -ne 0){throw 'Route verification failed'}
 & $node "$live\scripts\verify-metadata.mjs"
 if($LASTEXITCODE -ne 0){throw 'Metadata/image verification failed'}
}
function Browser([string]$base){
 Push-Location "$inbox\qa"
 try {
  $env:WG_TEST_URL=$base
  & $node node_modules/@playwright/test/cli.js test --config playwright.config.cjs
  if($LASTEXITCODE -ne 0){throw 'Read-only browser verification failed'}
  $report=Get-Content reports/browser.json -Raw -Encoding UTF8 | ConvertFrom-Json
  if($report.stats.expected -ne 4 -or $report.stats.unexpected -ne 0 -or $report.stats.flaky -ne 0 -or $report.stats.skipped -ne 0){throw 'Unexpected browser result counts'}
 } finally {Pop-Location}
}
function Verify-Preserved {
 $env:WG_UI_INBOX=$inbox;$env:WG_DATABASE="$live\state\catalog.db"
 @'
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import assert from 'node:assert/strict';
const before=new DatabaseSync(process.env.WG_UI_INBOX+'/before-ui.db',{readOnly:true});const after=new DatabaseSync(process.env.WG_DATABASE,{readOnly:true});
const names=before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
assert.deepEqual(after.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name),names);
for(const name of names){assert.match(name,/^[a-z_]+$/);assert.deepEqual(after.prepare('SELECT * FROM '+name+' ORDER BY rowid').all(),before.prepare('SELECT * FROM '+name+' ORDER BY rowid').all(),name+' changed');}
before.close();after.close();console.log(JSON.stringify({allCatalogTablesUnchanged:true,tables:names}));
'@ | & $node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Catalog preservation verification failed'}
}
function Rollback {
 Assert-Task
 $r=Get-Content $receiptFile -Raw | ConvertFrom-Json
 if($r.status -eq 'staged') {Stop-Candidate;$r.status='cancelled';Save $r;return}
 $actual=if(Test-Path "$live\build\server\index.js"){(Get-FileHash "$live\build\server\index.js" -Algorithm SHA256).Hash}else{''}
 if($actual -and $actual -ne $expectedOldBuild -and $actual.ToLowerInvariant() -ne $manifest.buildHash){throw 'Live build changed externally; refusing overwrite'}
 if($actual -ne $expectedOldBuild){
  if(Get-NetTCPConnection -LocalPort 8381 -State Listen -ErrorAction SilentlyContinue){Stop-Live}
  if(Test-Path "$live\build"){Move-Item "$live\build" "$inbox\build.failed"}
  Move-Item "$inbox\build.before" "$live\build"
  Copy-Item "$inbox\catalog.before.tsx" "$live\src\routes\catalog.tsx" -Force
  Copy-Item "$inbox\styles.before.css" "$live\src\styles.css" -Force
 }
 if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){Start-Live}
 Stop-Candidate
 $r.status='rolled_back';$r|Add-Member -NotePropertyName rolledBackAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;Save $r
 Write-Output 'WG_GALLERY_UI_ROLLED_BACK'
}
Assert-Task
Set-Location $live
if($Mode -eq 'Rollback'){Rollback;exit 0}
if((Get-PSDrive H).Free -lt 66571993088){throw 'Free-space reserve failed'}
if($Mode -eq 'Stage'){
 Assert-Runtime
 if((Get-FileHash "$live\build\server\index.js" -Algorithm SHA256).Hash -ne $expectedOldBuild){throw 'Production build differs from inspected snapshot'}
 if(Test-Path $stage){throw 'Candidate already exists; inspect before retrying'}
 if(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8481,8482)}){throw 'Candidate ports occupied'}
 if((Get-FileHash "$inbox\wg-gallery-ui.tgz" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.archiveHash){throw 'UI archive checksum mismatch'}
 New-Item -ItemType Directory -Path $stage,"$stage\state","$stage\reports","$inbox\qa\tests\e2e" | Out-Null
 foreach($dir in @('src','data','node_modules')){
  & robocopy.exe "$live\$dir" "$stage\$dir" /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS
  if($LASTEXITCODE -ge 8){throw "Runtime copy failed: $dir"}
 }
 Copy-Item "$live\server.ts","$live\package.json","$live\package-lock.json" $stage
 & tar.exe -xzf "$inbox\wg-gallery-ui.tgz" -C $stage
 if($LASTEXITCODE -ne 0){throw 'UI extraction failed'}
 if((Get-FileHash "$stage\build\server\index.js" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.buildHash){throw 'UI build hash differs'}
 $env:WG_UI_INBOX=$inbox;$env:WG_SOURCE_DB="$live\state\catalog.db";$env:WG_SNAPSHOT_DB="$stage\state\catalog.db"
 @'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.env.WG_SOURCE_DB,{readOnly:true});db.exec("VACUUM INTO '"+process.env.WG_SNAPSHOT_DB.replaceAll("'","''")+"'");db.close();
'@ | & $node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Candidate database snapshot failed'}
 & robocopy.exe 'H:\wg-manager-deploy-20261019-133308\browser-tools\node_modules' "$inbox\qa\node_modules" /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS
 if($LASTEXITCODE -ge 8){throw 'QA tools copy failed'}
 Copy-Item 'H:\wg-manager-deploy-20261019-133308\browser-tools\tests\e2e\metadata*.spec.ts' "$inbox\qa\tests\e2e"
 Copy-Item "$inbox\poster-layout.spec.ts" "$inbox\qa\tests\e2e"
 @'
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/e2e',workers:1,use:{baseURL:process.env.WG_TEST_URL,headless:true,launchOptions:{executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--proxy-server=http://127.0.0.1:10808','--proxy-bypass-list=localhost;127.0.0.1','--disable-background-networking']},trace:'retain-on-failure'},reporter:[['list'],['json',{outputFile:'reports/browser.json'}]]});
'@ | Set-Content -Encoding ASCII "$inbox\qa\playwright.config.cjs"
 @"
@echo off
cd /d $stage
set WG_DATABASE=$stage\state\catalog.db
set WG_STATE_DIR=$stage\state
set WG_MEDIA_ROOT=$live\media
set WG_RESOURCE_ROOT=H:\wg
set WG_PORT=8481
set WG_ADMIN_PORT=8482
set NODE_ENV=production
set PATH=C:\nvm4w\nodejs;%PATH%
"$node" --import tsx server.ts > "$inbox\candidate.stdout.log" 2> "$inbox\candidate.stderr.log"
"@ | Set-Content -Encoding ASCII "$inbox\launch-candidate.cmd"
 $r=@{upgradeId=$UpgradeId;root=$live;task=$taskName;status='staging';oldBuildHash=$expectedOldBuild;newBuildHash=$manifest.buildHash;caddyHash=$expectedConfig}
 Save $r
 try {
  $p=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="C:\Windows\System32\cmd.exe /d /c $inbox\launch-candidate.cmd";CurrentDirectory=$stage}
  if($p.ReturnValue -ne 0){throw 'Candidate launch failed'}
  @{pid=$p.ProcessId}|ConvertTo-Json|Set-Content -Encoding UTF8 "$inbox\candidate-process.json"
  $ready=$false
  for($attempt=0;$attempt -lt 20;$attempt++){
   try{if((Invoke-RestMethod 'http://127.0.0.1:8481/health' -TimeoutSec 2).status -eq 'ok'){$ready=$true;break}}catch{}
   Start-Sleep -Seconds 1
  }
  if(!$ready){throw 'Candidate health failed'}
  $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8481,8482)})
  if($listeners.Count -ne 2 -or @($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count){throw 'Candidate listener isolation failed'}
  Verify-Http 'http://127.0.0.1:8481'
  Browser 'http://127.0.0.1:8481'
  Copy-Item "$inbox\qa\reports\browser.json" "$inbox\candidate-browser.json"
  $r.status='staged';$r.stagedAt=[DateTime]::UtcNow.ToString('o');Save $r
  Write-Output 'WG_GALLERY_CANDIDATE_VERIFIED'
 }finally{Stop-Candidate}
 exit 0
}
if($Mode -eq 'Promote'){
 $r=Get-Content $receiptFile -Raw|ConvertFrom-Json
 if($r.status -ne 'staged'){throw 'Candidate not verified'}
 Assert-Runtime
 if((Get-FileHash "$live\build\server\index.js" -Algorithm SHA256).Hash -ne $expectedOldBuild){throw 'Production build changed before update'}
 Copy-Item "$live\src\routes\catalog.tsx" "$inbox\catalog.before.tsx"
 Copy-Item "$live\src\styles.css" "$inbox\styles.before.css"
 Copy-Item $config "$inbox\Caddyfile.before"
 & robocopy.exe "$live\build\client\assets" "$stage\build\client\assets" /E /XC /XN /XO /R:1 /W:1 /NFL /NDL /NJH /NJS
 if($LASTEXITCODE -ge 8){throw 'Old client assets retention failed'}
 $r.status='preparing';Save $r
 try {
  Stop-Live
  $env:WG_SOURCE_DB="$live\state\catalog.db";$env:WG_SNAPSHOT_DB="$inbox\before-ui.db"
  @'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.env.WG_SOURCE_DB,{readOnly:true});db.exec("VACUUM INTO '"+process.env.WG_SNAPSHOT_DB.replaceAll("'","''")+"'");db.close();
'@ | & $node --input-type=module
  if($LASTEXITCODE -ne 0){throw 'Production rollback snapshot failed'}
  Move-Item "$live\build" "$inbox\build.before"
  Move-Item "$stage\build" "$live\build"
  Copy-Item "$stage\src\routes\catalog.tsx" "$live\src\routes\catalog.tsx"
  Copy-Item "$stage\src\styles.css" "$live\src\styles.css"
  $r.status='promoting';Save $r
  Start-Live
  Verify-Http 'http://127.0.0.1:8212'
  Browser 'http://127.0.0.1:8212'
  Copy-Item "$inbox\qa\reports\browser.json" "$inbox\origin-browser.json"
  Verify-Preserved
  $r.status='promoted';$r|Add-Member -NotePropertyName promotedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;Save $r
  Write-Output 'WG_GALLERY_PRODUCTION_ORIGIN_VERIFIED'
 }catch{try{Rollback}catch{Write-Warning "Automatic rollback unconfirmed: $_"};throw}
 exit 0
}
if($Mode -eq 'Confirm'){
 $r=Get-Content $receiptFile -Raw|ConvertFrom-Json
 $public=Get-Content "$inbox\public-browser-acceptance.json" -Raw|ConvertFrom-Json
 if($r.status -ne 'promoted' -or $public.upgradeId -ne $UpgradeId -or $public.buildHash -ne $manifest.buildHash -or $public.browserTests -ne 4 -or $public.status -ne 'passed'){throw 'Public acceptance does not match'}
 if((Get-FileHash "$live\build\server\index.js" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.buildHash){throw 'Live build differs'}
 if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){throw 'Production task not running'}
 $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8381,8382)})
 if($listeners.Count -ne 2 -or @($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count){throw 'Production listener isolation failed'}
 Verify-Preserved
 $r.status='complete';$r|Add-Member -NotePropertyName completedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
 $r|Add-Member -NotePropertyName freeBytes -NotePropertyValue (Get-PSDrive H).Free -Force
 Save $r;$r|ConvertTo-Json -Depth 8
 Write-Output 'WG_GALLERY_PRODUCTION_VERIFIED'
}
