$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='H:\wvn-renpy-media-preview-20261026'
$source='H:\wg\星之旅途 后日谈\game.zip'
$floor=66571993088
if((Get-PSDrive H).Free -lt ($floor+1073741824)){throw 'space_stop'}
if(Test-Path $root){throw 'Preview media directory already exists; inspect before retry'}
New-Item -ItemType Directory -Path $root | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceHash=(Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant()
$archive=[IO.Compression.ZipFile]::OpenRead($source)
$rows=@()
try{
 foreach($prefix in @('game/gui/ef00/','game/tl/Japanese/gui/ef00/')){
  foreach($name in @('ef_monitor01_on.mpg','ef_monitor01_off.mpg')){
   if((Get-PSDrive H).Free -lt ($floor+1073741824)){throw 'space_stop'}
   $entry=$archive.GetEntry($prefix+$name)
   if(!$entry -or $entry.Length -gt 16777216){throw 'Unexpected source movie'}
   $key=($prefix+$name).Replace('/','_');$movieInput=Join-Path $root $key;$output=$movieInput+'.webm'
   [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$movieInput,$false)
   $before=& 'C:\Program Files\ffmpeg\bin\ffprobe.exe' -v error -show_streams -show_format -of json $movieInput | ConvertFrom-Json
   & 'C:\Program Files\ffmpeg\bin\ffmpeg.exe' -nostdin -hide_banner -v error -n -i $movieInput -map '0:v:0' -map '0:a:0?' -c:v libvpx -threads 4 -pix_fmt yuv420p -b:v 2M -deadline good -cpu-used 2 -c:a libvorbis -q:a 4 -f webm $output
   if($LASTEXITCODE -ne 0){throw 'Movie conversion failed'}
   $after=& 'C:\Program Files\ffmpeg\bin\ffprobe.exe' -v error -show_streams -show_format -of json $output | ConvertFrom-Json
   $video=@($after.streams|Where-Object codec_type -eq video)[0];$oldVideo=@($before.streams|Where-Object codec_type -eq video)[0]
   if($video.codec_name -ne 'vp8' -or $video.width -ne $oldVideo.width -or $video.height -ne $oldVideo.height -or [Math]::Abs([double]$after.format.duration-[double]$before.format.duration) -gt .25 -or !@($after.streams|Where-Object codec_type -eq audio)){throw 'Converted movie validation failed'}
   $rows+=@{path=$prefix+$name;file=$output;sourceSHA256=(Get-FileHash $movieInput -Algorithm SHA256).Hash.ToLowerInvariant();sha256=(Get-FileHash $output -Algorithm SHA256).Hash.ToLowerInvariant();sourceBytes=$entry.Length;bytes=(Get-Item $output).Length;duration=$after.format.duration;width=$video.width;height=$video.height;videoCodec=$video.codec_name;audioCodec=@($after.streams|Where-Object codec_type -eq audio)[0].codec_name}
  }
 }
}finally{$archive.Dispose()}
$target=Join-Path $root 'game.zip'
Copy-Item -LiteralPath $source -Destination $target
$archive=[IO.Compression.ZipFile]::Open($target,[IO.Compression.ZipArchiveMode]::Update)
try{foreach($row in $rows){$archive.GetEntry($row.path).Delete();[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$row.file,$row.path,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}}finally{$archive.Dispose()}
if((Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash){throw 'Original archive changed'}
$receipt=@{schema=1;player='renpy-v50789-1';sourceArchive=$source;sourceArchiveSHA256=$sourceHash;sourceArchiveBytes=(Get-Item $source).Length;targetArchive=$target;targetArchiveSHA256=(Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant();targetArchiveBytes=(Get-Item $target).Length;entries=$rows;originalArchiveUnchanged=$true;freeBytes=(Get-PSDrive H).Free;checkedAt=(Get-Date).ToUniversalTime().ToString('o')}
$json=$receipt|ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $root 'receipt.json'),$json,(New-Object Text.UTF8Encoding($false)))
$json
