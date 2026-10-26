$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='H:\wvn-renpy-layout-preview-20261026'
$source='H:\wg\君与彼女与彼女之恋\game.zip'
$patched=Join-Path $root 'screens-patched-v3.rpyc'
$target=Join-Path $root 'game-v3.zip'
$entryPath='game/system/screens.rpyc'
if(Test-Path $target){throw 'Preview archive already exists; inspect before retry'}
if((Get-PSDrive H).Free -lt (66571993088+(Get-Item $source).Length+1073741824)){throw 'space_stop'}
if((Get-FileHash $patched -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8b78788001b408ae4b94e588fe3614ce40cc0d4bf78e1d106c18e53ca876d228'){throw 'Unexpected patched layout'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
function EntryHash($entry){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose();$stream.Dispose()}}
$sourceHash=(Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant()
$old=[IO.Compression.ZipFile]::OpenRead($source)
try{if((EntryHash $old.GetEntry($entryPath)) -ne '67be1436ec9bc79696fb0ae50ce167b35ad67733287f2010febd37d05d57b023'){throw 'Unexpected original layout'}}finally{$old.Dispose()}
Copy-Item -LiteralPath $source -Destination $target
$zip=[IO.Compression.ZipFile]::Open($target,[IO.Compression.ZipArchiveMode]::Update)
try{$zip.GetEntry($entryPath).Delete();[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$patched,$entryPath,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}finally{$zip.Dispose()}
$old=[IO.Compression.ZipFile]::OpenRead($source);$new=[IO.Compression.ZipFile]::OpenRead($target);$unchanged=0
try{
 if($old.Entries.Count -ne $new.Entries.Count){throw 'Archive entry count changed'}
 foreach($entry in $old.Entries){$copy=$new.GetEntry($entry.FullName);if(!$copy){throw 'Missing entry'};if($entry.FullName -eq $entryPath){continue};if($entry.Length -ne $copy.Length -or (EntryHash $entry) -ne (EntryHash $copy)){throw ('Unrelated entry changed: '+$entry.FullName)};$unchanged++}
 if((EntryHash $new.GetEntry($entryPath)) -ne '8b78788001b408ae4b94e588fe3614ce40cc0d4bf78e1d106c18e53ca876d228'){throw 'Patched entry differs'}
}finally{$old.Dispose();$new.Dispose()}
if((Get-FileHash $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash){throw 'Original archive changed'}
$receipt=@{schema=1;player='renpy-v7738-1';purpose='native-save-layout-integer-division';sourceArchive=$source;sourceArchiveSHA256=$sourceHash;sourceArchiveBytes=(Get-Item $source).Length;targetArchive=$target;targetArchiveSHA256=(Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant();targetArchiveBytes=(Get-Item $target).Length;changedEntry=$entryPath;unchangedEntries=$unchanged;originalArchiveUnchanged=$true;freeBytes=(Get-PSDrive H).Free;checkedAt=(Get-Date).ToUniversalTime().ToString('o')}
$json=$receipt|ConvertTo-Json -Depth 5;[IO.File]::WriteAllText((Join-Path $root 'receipt-v3.json'),$json,(New-Object Text.UTF8Encoding($false)));$json
