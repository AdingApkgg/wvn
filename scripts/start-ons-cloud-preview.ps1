throw '历史 SQLite 启动或复制发布流程已停用；尚未完成当前 Windows PostgreSQL 实机验证。请按 docs/platform-postgres.md 使用显式 PG 配置与持久化任务；此入口不会执行后续历史正文。'
# 以下保留历史正文，仅供审查，禁止执行。
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
if((Get-PSDrive H).Free -lt 66571993088){throw 'space_stop'}
$root='H:\wg-ons-cloud-20261019';Set-Location $root
$expected=(Get-Content 'H:\wg-ons-cloud-source.sha256' -Raw).Trim()
if((Get-FileHash 'H:\wg-ons-cloud-source.tgz').Hash -ne $expected){throw 'Archive mismatch'}
& tar.exe -xzf 'H:\wg-ons-cloud-source.tgz';if($LASTEXITCODE -ne 0){throw 'Extract failed'}
$env:Path='C:\nvm4w\nodejs;'+$env:Path
$env:HTTP_PROXY='http://127.0.0.1:10808';$env:HTTPS_PROXY=$env:HTTP_PROXY;$env:npm_config_proxy=$env:HTTP_PROXY;$env:npm_config_https_proxy=$env:HTTP_PROXY
@'
import fs from 'node:fs';import {createHash,randomBytes}from'node:crypto';import{DatabaseSync}from'node:sqlite';
const m=JSON.parse(fs.readFileSync('ons-source-manifest.json','utf8'));for(const[p,h]of Object.entries(m.files))if(createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)throw Error('Source mismatch: '+p);
for(const name of ['secret']){const p='state/cloud/'+name;if(!fs.existsSync(p))fs.writeFileSync(p,randomBytes(48).toString('base64url'))}
if(!fs.existsSync('state/catalog.db')){const db=new DatabaseSync('H:/wg-ons-pilot-20261019-1205/state/catalog.db',{readOnly:true});db.exec("VACUUM INTO 'H:/wg-ons-cloud-20261019/state/catalog.db'");db.close()}
console.log(JSON.stringify({sourceFilesVerified:Object.keys(m.files).length}));
'@|& node --input-type=module
if($LASTEXITCODE -ne 0){throw 'Source or state preparation failed'}
if(!(Test-Path node_modules)){
 & cmd.exe /d /c 'npm ci --no-audit --no-fund > reports\install.log 2>&1';if($LASTEXITCODE -ne 0){Get-Content reports\install.log -Tail 25;throw 'Install failed'}
}
foreach($check in @(@{name='contracts';command='node --import tsx --test tests/account-response.test.ts tests/ons-cloud.test.ts tests/ons-pilot.test.ts tests/ons-native-checkpoint.test.mjs'},@{name='typecheck';command='npm run typecheck'},@{name='build';command='npm run build'})){
 & cmd.exe /d /c "$($check.command) > reports\$($check.name).log 2>&1"
 Get-Content "reports\$($check.name).log" -Tail 15
 if($LASTEXITCODE -ne 0){throw "Failed: $($check.name)"}
}
if(Get-NetTCPConnection -LocalPort 18487 -State Listen -ErrorAction SilentlyContinue){throw 'Preview port already in use; inspect owned process before restart'}
@'
@echo off
cd /d H:\wg-ons-cloud-20261019
set WG_ACCOUNT_ORIGIN=https://localhost:18487
set WG_ACCOUNT_PORT=18487
set WG_ACCOUNT_UI=1
set WG_ACCOUNT_COOKIE_PREFIX=__Host-wg-ons-cloud-preview
set WG_ACCOUNT_DATABASE=H:\wg-ons-cloud-20261019\state\cloud\accounts.sqlite
set WG_ACCOUNT_BLOBS=H:\wg-ons-cloud-20261019\state\cloud\blobs
set WG_ACCOUNT_DELETION_LEDGER=H:\wg-ons-cloud-20261019\state\cloud\deletions.jsonl
set WG_ACCOUNT_SECRET_FILE=H:\wg-ons-cloud-20261019\state\cloud\secret
set WG_ACCOUNT_TLS_KEY=H:\wg-ons-cloud-20261019\state\cloud\tls.key
set WG_ACCOUNT_TLS_CERT=H:\wg-ons-cloud-20261019\state\cloud\tls.crt
set WG_DATABASE=H:\wg-ons-cloud-20261019\state\catalog.db
set WG_RESOURCE_ROOT=H:\wg
set WG_MEDIA_ROOT=H:\wg-manager-release-20261019-133308\media
set WG_ONS_PILOT=1
set WG_ONS_CLOUD=1
set NODE_ENV=production
C:\nvm4w\nodejs\node.exe --import tsx accounts-server.ts > reports\server.log 2>&1
'@|Set-Content launch-cloud.cmd -Encoding ASCII
$p=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="C:\Windows\System32\cmd.exe /d /c $root\launch-cloud.cmd";CurrentDirectory=$root}
if($p.ReturnValue -ne 0){throw 'Launch failed'}
@{root=$root;host=$env:COMPUTERNAME;pid=$p.ProcessId;port=18487;startedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content reports\cloud-process.json
@'
import https from 'node:https';import fs from 'node:fs';
const check=()=>new Promise((resolve,reject)=>{https.get({hostname:'localhost',port:18487,path:'/health',ca:fs.readFileSync('state/cloud/tls.crt')},r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>r.statusCode===200?resolve(s):reject(Error('Health status '+r.statusCode)))}).on('error',reject)});
let error;for(let n=0;n<20;n++){try{console.log(await check());error=null;break}catch(e){error=e;await new Promise(r=>setTimeout(r,500))}}if(error)throw error;
'@|& node --input-type=module
if($LASTEXITCODE -ne 0){Get-Content reports\server.log -Tail 20;throw 'Preview health failed'}
