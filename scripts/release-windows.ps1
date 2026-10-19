param(
 [Parameter(Mandatory=$true)][ValidatePattern('^20261019-[0-9]{6}$')][string]$ReleaseId,
 [Parameter(Mandatory=$true)][ValidateSet('Stage','Browser','Promote','Confirm','Rollback')][string]$Mode
)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Text.UTF8Encoding]::new($false)
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
$root="H:\wg-manager-release-$ReleaseId"
$inbox="H:\wg-manager-deploy-$ReleaseId"
$preview='H:\wg-manager-preview-20261019'
$node='C:\nvm4w\nodejs\node.exe'
$caddy='C:\ProgramData\CaddyWG\caddy.exe'
$config='C:\ProgramData\CaddyWG\Caddyfile'
$oldHash='313A06303C4AD24B14CC535BDA718F09C08B3C2C0EF72110BF4D843F5AF0657F'
$taskName="WG-Manager-$ReleaseId"
$receiptFile="$inbox\receipt.json"
function Save-Receipt($receipt){$receipt | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $receiptFile}
function Invoke-Caddy([string]$verb,[string]$file){
 $out="$inbox\caddy-$verb.stdout.log";$err="$inbox\caddy-$verb.stderr.log"
 $arguments=@($verb,'--config',$file,'--adapter','caddyfile')
 if($verb -eq 'reload'){$arguments+=@('--address','127.0.0.1:2021')}
 $process=Start-Process -FilePath $caddy -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
 Get-Content $out,$err | ForEach-Object {Write-Host $_}
 if($process.ExitCode -ne 0){throw "Caddy $verb failed with exit code $($process.ExitCode)"}
}
function Stop-OwnTask {
 $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 if($task){
  if($task.Actions.Count -ne 1 -or $task.Actions[0].WorkingDirectory -ne $root -or $task.Actions[0].Arguments -ne "/d /c `"$root\scripts\launch-production.cmd`""){throw 'Task identity mismatch'}
  Stop-ScheduledTask -TaskName $taskName
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
 }
}
function Restore-Production {
 $r=Get-Content $receiptFile -Raw | ConvertFrom-Json
 $actual=(Get-FileHash $config -Algorithm SHA256).Hash
 if($actual -ne $oldHash -and $actual -ne $r.candidateHash){throw 'Caddy configuration changed externally; refusing rollback overwrite'}
 if($actual -ne $oldHash){
  Copy-Item "$inbox\Caddyfile.before" $config -Force
  Invoke-Caddy 'reload' $config
 }
 Stop-OwnTask
 $r.status='rolled_back';Save-Receipt $r
 Write-Output 'WG_PRODUCTION_ROLLED_BACK'
}
if($Mode -eq 'Rollback'){Restore-Production;exit 0}
if((Get-PSDrive H).Free -lt 66571993088){throw 'Insufficient reserve: requires 60 GiB plus 2 GiB buffer'}

if($Mode -eq 'Stage'){
 if((Get-FileHash $config -Algorithm SHA256).Hash -ne $oldHash){throw 'Production Caddyfile differs from reviewed snapshot'}
 if(Test-Path $root){throw 'Release directory already exists; inspect it before retrying'}
 if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Release task already exists'}
 if(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8381,8382)}){throw 'Candidate ports are occupied'}
 $manifest=Get-Content "$inbox\manifest.json" -Raw | ConvertFrom-Json
 foreach($name in @('app.tgz','media.tgz','qa.tgz')){
  if((Get-FileHash "$inbox\$name" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.archives.$name){throw "Archive checksum mismatch: $name"}
 }
 New-Item -ItemType Directory -Path $root | Out-Null
 Set-Location $root
 & tar.exe -xzf "$inbox\app.tgz"
 if($LASTEXITCODE -ne 0){throw 'App extraction failed'}
 & robocopy.exe "$preview\media" "$root\media" /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS
 if($LASTEXITCODE -ge 8){throw 'Existing media cache copy failed'}
 & tar.exe -xzf "$inbox\media.tgz"
 if($LASTEXITCODE -ne 0){throw 'Media extraction failed'}
 $env:WG_RELEASE_MANIFEST="$inbox\manifest.json"
 $hashMedia=@'
import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync(process.env.WG_RELEASE_MANIFEST,'utf8'));
assert.equal(Object.keys(manifest.mediaHashes).length,330);
for(const [file,expected] of Object.entries(manifest.mediaHashes)){
 assert.match(file,/^media\/[a-f0-9]{64}\.(jpg|png|webp)$/);
 assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file+' bytes differ');
}
console.log('All 330 image SHA256 hashes verified, including 12 new assets.');
'@
 $hashMedia | & $node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Media cache byte verification failed'}
 if((Get-FileHash data/metadata.json -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.metadataSha256){throw 'Metadata snapshot mismatch'}
 & robocopy.exe "$preview\node_modules" "$root\node_modules" /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS
 if($LASTEXITCODE -ge 8){throw 'Dependency copy failed'}
 if((Get-FileHash "$preview\package-lock.json").Hash -ne (Get-FileHash "$root\package-lock.json").Hash){throw 'Dependency lock differs from Windows installed lock'}
 New-Item -ItemType Directory -Path "$root\state","$root\reports" | Out-Null
 $env:WG_SOURCE_DB="$preview\state\catalog.db"
 $env:WG_BASELINE_DB="$root\state\before-release.db"
 $clone=@'
import {DatabaseSync} from 'node:sqlite';
const source=new DatabaseSync(process.env.WG_SOURCE_DB,{readOnly:true});
source.exec("VACUUM INTO '"+process.env.WG_BASELINE_DB.replaceAll("'","''")+"'");source.close();
'@
 $clone | & $node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Consistent catalog snapshot failed'}
 Copy-Item "$root\state\before-release.db" "$root\state\catalog.db"
 $env:WG_DATABASE="$root\state\catalog.db"
 $dry=& $node --import tsx scripts/import-metadata.ts
 if($LASTEXITCODE -ne 0){throw 'Metadata dry-run failed'}
 $dry | Set-Content -Encoding UTF8 reports/metadata-dry-run.json
 $check=$dry | ConvertFrom-Json
 if($check.total -ne 64 -or $check.added -ne 0 -or $check.updated -ne 19 -or $check.unchanged -ne 45){throw 'Unexpected metadata differences; nothing has been published'}
 & $node --import tsx scripts/import-metadata.ts --apply
 if($LASTEXITCODE -ne 0){throw 'Metadata import failed'}
 $preserve=@'
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import assert from 'node:assert/strict';
const before=new DatabaseSync('state/before-release.db',{readOnly:true}),after=new DatabaseSync('state/catalog.db',{readOnly:true});
for(const table of ['works','versions','routes','reports','pending'])assert.deepEqual(after.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),before.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),table+' changed');
const expected=new Set(JSON.parse(fs.readFileSync('data/metadata-supplements.json','utf8')).items.map(i=>i.workId));
const old=new Map(before.prepare('SELECT * FROM work_metadata').all().map(r=>[r.work_id,r]));const changed=[];
for(const row of after.prepare('SELECT * FROM work_metadata').all()){
 assert.ok(old.has(row.work_id));
 if(!expected.has(row.work_id))assert.deepEqual(row,old.get(row.work_id));
 else if(row.payload!==old.get(row.work_id).payload)changed.push(row.work_id);
}
assert.deepEqual(changed.sort(),[...expected].sort());
assert.equal(after.prepare('SELECT count(*) n FROM work_metadata').get().n,64);
before.close();after.close();console.log('Core catalog preserved; 19 metadata records updated; 45 unchanged.');
'@
 $preserve | & $node --input-type=module
 if($LASTEXITCODE -ne 0){throw 'Catalog preservation check failed'}
 @"
@echo off
cd /d $root
set WG_DATABASE=$root\state\catalog.db
set WG_RESOURCE_ROOT=H:\wg
set WG_STATE_DIR=$root\state
set WG_MEDIA_ROOT=$root\media
set WG_PORT=8381
set WG_ADMIN_PORT=8382
set NODE_ENV=production
set PATH=C:\nvm4w\nodejs;%PATH%
"$node" --import tsx server.ts >> production.log 2>> production-error.log
"@ | Set-Content -Encoding ASCII scripts/launch-production.cmd
 Copy-Item $config "$inbox\Caddyfile.before"
 if((Get-FileHash "$inbox\Caddyfile.before" -Algorithm SHA256).Hash -ne $oldHash){throw 'Production configuration changed during backup'}
 $oldText=Get-Content $config -Raw
 $pattern='(?ms)file_server\s*\{\s*hide\s+\.git\s+\.env\s+\*\.ps1\s+\*\.py\s*\}'
 if([regex]::Matches($oldText,$pattern).Count -ne 1){throw 'Unexpected Caddy file_server block'}
 $candidate=[regex]::Replace($oldText,$pattern,'reverse_proxy 127.0.0.1:8381')
 # Set headers after the proxy copies upstream headers, so policies occur once.
 $securityPattern='(?m)^(\s*)(Cross-Origin-Opener-Policy|Cross-Origin-Embedder-Policy|X-Content-Type-Options)(\s+)'
 if([regex]::Matches($candidate,$securityPattern).Count -ne 3){throw 'Unexpected security header block'}
 $candidate=[regex]::Replace($candidate,$securityPattern,'$1>$2$3')
 $candidate=$candidate.Replace('header @wasm Content-Type','header @wasm >Content-Type').Replace('header @html Cache-Control','header @html >Cache-Control')
 [IO.File]::WriteAllText("$inbox\Caddyfile.candidate",$candidate,[Text.UTF8Encoding]::new($false))
 Invoke-Caddy 'validate' "$inbox\Caddyfile.candidate"
 $receipt=@{releaseId=$ReleaseId;root=$root;task=$taskName;status='staging';metadataSha256=$manifest.metadataSha256;candidateHash=(Get-FileHash "$inbox\Caddyfile.candidate" -Algorithm SHA256).Hash;stagedAt=[DateTime]::UtcNow.ToString('o')}
 Save-Receipt $receipt
 try {
  $action=New-ScheduledTaskAction -Execute 'C:\Windows\System32\cmd.exe' -Argument "/d /c `"$root\scripts\launch-production.cmd`"" -WorkingDirectory $root
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName $taskName
  $ready=$false
  for($attempt=0;$attempt -lt 30;$attempt++){
   try {if((Invoke-RestMethod 'http://127.0.0.1:8381/health' -TimeoutSec 2).status -eq 'ok'){$ready=$true;break}}catch{}
   Start-Sleep -Seconds 1
  }
  if(!$ready){throw 'Production candidate did not become healthy'}
  $listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(8381,8382)})
  if($listeners.Count -ne 2 -or @($listeners | Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count){throw 'Candidate listener isolation failed'}
  $env:WG_TEST_URL='http://127.0.0.1:8381'
  & $node scripts/verify-preview.mjs
  if($LASTEXITCODE -ne 0){throw 'Candidate route checks failed'}
  & $node scripts/verify-metadata.mjs
  if($LASTEXITCODE -ne 0){throw 'Candidate metadata/image checks failed'}
  if((Get-PSDrive H).Free -lt 66571993088){throw 'Reserve check failed after staging'}
  $receipt.status='staged';Save-Receipt $receipt
  Write-Output 'WG_PRODUCTION_CANDIDATE_READY'
 } catch {Stop-OwnTask;throw}
 exit 0
}

if($Mode -eq 'Browser'){
 $receipt=Get-Content $receiptFile -Raw | ConvertFrom-Json
 if($receipt.status -ne 'staged'){throw 'Candidate is not staged'}
 $manifest=Get-Content "$inbox\manifest.json" -Raw | ConvertFrom-Json
 if((Get-FileHash "$inbox\qa.tgz" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.archives.'qa.tgz'){throw 'Browser tools checksum mismatch'}
 $tools="$inbox\browser-tools"
 New-Item -ItemType Directory -Path $tools | Out-Null
 Set-Location $tools
 & tar.exe -xzf "$inbox\qa.tgz"
 if($LASTEXITCODE -ne 0){throw 'Browser tool extraction failed'}
 $env:WG_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
 if(!(Test-Path $env:WG_CHROME_PATH)){throw 'Reviewed Windows Chrome installation missing'}
 if(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq 8383}){throw 'Proxy smoke port occupied'}
 $smoke=(Get-Content "$inbox\Caddyfile.candidate" -Raw).Replace('admin 127.0.0.1:2021','admin off').Replace('http://:8212','http://:8383').Replace('C:/ProgramData/CaddyWG/logs/runtime.log',"$($inbox.Replace('\','/'))/smoke-runtime.log").Replace('C:/ProgramData/CaddyWG/logs/access.log',"$($inbox.Replace('\','/'))/smoke-access.log")
 [IO.File]::WriteAllText("$inbox\Caddyfile.smoke",$smoke,[Text.UTF8Encoding]::new($false))
 Invoke-Caddy 'validate' "$inbox\Caddyfile.smoke"
 $smokeProcess=Start-Process -FilePath $caddy -ArgumentList @('run','--config',"$inbox\Caddyfile.smoke",'--adapter','caddyfile') -PassThru -NoNewWindow -RedirectStandardOutput "$inbox\smoke.stdout.log" -RedirectStandardError "$inbox\smoke.stderr.log"
 try {
  $ready=$false
  for($attempt=0;$attempt -lt 10;$attempt++){
   try{if((Invoke-RestMethod 'http://127.0.0.1:8383/health' -TimeoutSec 2).status -eq 'ok'){$ready=$true;break}}catch{}
   Start-Sleep -Seconds 1
  }
  if(!$ready){throw 'Candidate proxy smoke listener did not start'}
  $headers=(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8383/8038/' -TimeoutSec 10).Headers
  if([string]$headers['Cross-Origin-Opener-Policy'] -cne 'same-origin' -or [string]$headers['Cross-Origin-Embedder-Policy'] -cne 'require-corp'){throw 'Duplicate or invalid proxy isolation headers'}
  foreach($game in @('atri','clannad')){
   $wasm=Get-ChildItem "H:\wg\$game" -File -Filter '*.wasm' | Select-Object -First 1
   if($wasm){
    $headers=(Invoke-WebRequest -UseBasicParsing -Method Head -Uri ("http://127.0.0.1:8383/$game/"+$wasm.Name) -TimeoutSec 10).Headers
    if([string]$headers['Content-Type'] -cne 'application/wasm'){throw 'Duplicate or invalid WASM MIME header'}
   }
  }
  $env:WG_TEST_URL='http://127.0.0.1:8383'
 @'
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/e2e',workers:1,use:{baseURL:process.env.WG_TEST_URL,headless:true,launchOptions:{executablePath:process.env.WG_CHROME_PATH,args:['--disable-background-networking','--proxy-server=http://127.0.0.1:10808','--proxy-bypass-list=localhost;127.0.0.1']},trace:'retain-on-failure'},reporter:[['list'],['json',{outputFile:'reports/browser.json'}]]});
'@ | Set-Content -Encoding ASCII playwright.config.cjs
 & $node "$tools\node_modules\@playwright\test\cli.js" test --config playwright.config.cjs
 if($LASTEXITCODE -ne 0){throw 'Candidate Windows browser checks failed'}
 $report=Get-Content reports/browser.json -Raw -Encoding UTF8 | ConvertFrom-Json
 if($report.stats.expected -ne 2 -or $report.stats.unexpected -ne 0 -or $report.stats.skipped -ne 0 -or $report.stats.flaky -ne 0){throw 'Unexpected browser test counts'}
 @{releaseId=$ReleaseId;metadataSha256=$receipt.metadataSha256;status='passed';browserTests=2;checkedAt=[DateTime]::UtcNow.ToString('o');host=$env:COMPUTERNAME} | ConvertTo-Json | Set-Content -Encoding UTF8 "$inbox\browser-acceptance.json"
 Write-Output 'WG_PRODUCTION_CANDIDATE_BROWSER_VERIFIED'
 }finally{if(!$smokeProcess.HasExited){$smokeProcess.Kill();$smokeProcess.WaitForExit()}}
}

if($Mode -eq 'Promote'){
 $receipt=Get-Content $receiptFile -Raw | ConvertFrom-Json
 if($receipt.status -ne 'staged'){throw 'Release has not passed staging'}
 $browser=Get-Content "$inbox\browser-acceptance.json" -Raw | ConvertFrom-Json
 if($browser.releaseId -ne $ReleaseId -or $browser.status -ne 'passed' -or $browser.metadataSha256 -ne $receipt.metadataSha256){throw 'Candidate browser acceptance missing or mismatched'}
 if((Get-FileHash "$root\data\metadata.json" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.metadataSha256){throw 'Candidate metadata changed after browser acceptance'}
 if((Get-FileHash $config -Algorithm SHA256).Hash -ne $oldHash){throw 'Production configuration changed before cutover'}
 if((Get-FileHash "$inbox\Caddyfile.candidate" -Algorithm SHA256).Hash -ne $receipt.candidateHash){throw 'Candidate configuration changed'}
 Set-Location $root
 try {
  Copy-Item "$inbox\Caddyfile.candidate" $config -Force
  Invoke-Caddy 'reload' $config
  $env:WG_TEST_URL='http://127.0.0.1:8212'
  & $node scripts/verify-preview.mjs
  if($LASTEXITCODE -ne 0){throw 'Production route checks failed'}
  & $node scripts/verify-metadata.mjs
  if($LASTEXITCODE -ne 0){throw 'Production metadata/image checks failed'}
  $receipt.status='promoted';$receipt | Add-Member -NotePropertyName promotedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
  Save-Receipt $receipt
  Write-Output 'WG_PRODUCTION_ORIGIN_VERIFIED'
 }catch{Restore-Production;throw}
}
if($Mode -eq 'Confirm'){
 $receipt=Get-Content $receiptFile -Raw | ConvertFrom-Json
 $browser=Get-Content "$inbox\public-browser-acceptance.json" -Raw | ConvertFrom-Json
 if($receipt.status -ne 'promoted' -or $browser.releaseId -ne $ReleaseId -or $browser.status -ne 'passed' -or $browser.metadataSha256 -ne $receipt.metadataSha256){throw 'Public browser verification missing or mismatched'}
 if((Get-FileHash $config -Algorithm SHA256).Hash -ne $receipt.candidateHash){throw 'Live Caddy configuration differs from candidate'}
 if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running'){throw 'Production task is not running'}
 if((Invoke-RestMethod 'http://127.0.0.1:8212/health' -TimeoutSec 5).status -ne 'ok'){throw 'Production health failed'}
 $receipt.status='complete';$receipt | Add-Member -NotePropertyName completedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
 Save-Receipt $receipt
 $receipt | ConvertTo-Json -Depth 8
 Write-Output 'WG_PRODUCTION_RELEASE_VERIFIED'
}
