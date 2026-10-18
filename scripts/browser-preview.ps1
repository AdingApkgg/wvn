$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$root='H:\wg-manager-preview-20261019';Set-Location $root
if((Get-PSDrive H).Free -lt 66571993088){throw 'space_stop'}
if(Get-NetTCPConnection -LocalPort 9251 -State Listen -ErrorAction SilentlyContinue){throw 'Debug port already used'}
& 'C:\nvm4w\nodejs\node.exe' scripts\verify-preview.mjs
if($LASTEXITCODE -ne 0){throw 'HTTP route check failed'}
foreach($slug in @('atri','clannad')){
 $profile="$root\state\browser-$slug";$args=@('--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',"--user-data-dir=$profile",'--disk-cache-size=33554432','--media-cache-size=16777216','--proxy-server=http://127.0.0.1:10808','--proxy-bypass-list=localhost;127.0.0.1','--remote-debugging-port=9251','--remote-debugging-address=127.0.0.1','about:blank')
 $chrome=Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList $args -PassThru
 try{Start-Sleep -Milliseconds 1500;& 'C:\nvm4w\nodejs\node.exe' scripts\browser-preview.mjs $slug}finally{if(-not $chrome.HasExited){Stop-Process -Id $chrome.Id -ErrorAction SilentlyContinue}}
}
