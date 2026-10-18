$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$root='H:\wg-manager-preview-20261019'
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Wrong host'}
if((Get-PSDrive H).Free -lt 66571993088){throw 'Free space below 62 GiB buffer'}
Set-Location $root
& tar.exe -xzf app.tgz
if($LASTEXITCODE -ne 0){throw 'Extract application failed'}
$env:HTTP_PROXY='http://127.0.0.1:10808';$env:HTTPS_PROXY=$env:HTTP_PROXY
$env:npm_config_proxy=$env:HTTP_PROXY;$env:npm_config_https_proxy=$env:HTTP_PROXY
$env:Path='C:\nvm4w\nodejs;'+$env:Path
& 'C:\nvm4w\nodejs\npm.cmd' ci --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund *> install.log
if($LASTEXITCODE -ne 0){Get-Content install.log -Tail 15;throw 'Install failed'}
$env:WG_DATABASE=Join-Path $root 'state\catalog.db';$env:WG_RESOURCE_ROOT='H:\wg';$env:WG_HOST='127.0.0.1';$env:WG_PORT='8281';$env:WG_ADMIN_PORT='8282';$env:NODE_ENV='production'
& 'C:\nvm4w\nodejs\node.exe' node_modules\tsx\dist\cli.mjs scripts\seed.ts
if($LASTEXITCODE -ne 0){throw 'Seed failed'}
$p=Start-Process -FilePath 'C:\nvm4w\nodejs\node.exe' -ArgumentList @('node_modules\tsx\dist\cli.mjs','server.ts') -WorkingDirectory $root -RedirectStandardOutput "$root\preview.log" -RedirectStandardError "$root\preview-error.log" -PassThru
@{pid=$p.Id;host=$env:COMPUTERNAME;root=$root;startedAt=[DateTime]::UtcNow.ToString('o');freeBytes=(Get-PSDrive H).Free}|ConvertTo-Json -Compress|Tee-Object -FilePath "$root\preview-process.json"
