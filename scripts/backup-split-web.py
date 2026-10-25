#!/usr/bin/env python3
"""通过 SSH 将 Arch 元数据与 Windows H 盘存档合并备份，并在 H 盘验证恢复。"""
import argparse, base64, json, pathlib, re, shlex, subprocess, tempfile, uuid
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--web-root',required=True)
p.add_argument('--unit',required=True)
p.add_argument('--env',required=True)
p.add_argument('--blob-root',required=True)
p.add_argument('--storage-code',default='H:/wg-split-resources-20261024')
p.add_argument('--backup-root',default='H:/wg-split-backups-20261024')
a=p.parse_args()
for value in [a.web_root,a.unit,a.env,a.blob_root,a.storage_code,a.backup_root]:
 if not re.fullmatch(r'[A-Za-z0-9_./:\\-]+',value) or '..' in value.split('/'):
  raise SystemExit('路径参数包含未允许的字符')
if not a.web_root.startswith('/home/wvn/wg-') or not re.fullmatch(r'wg-[a-z0-9-]+',a.unit) or any(not x.startswith('H:/') for x in [a.blob_root,a.storage_code,a.backup_root]):
 raise SystemExit('仅允许指定 WG Web 目录及 Windows H 盘存储')
web='web.example.invalid'; win='192.0.2.20'
sshwin=['ssh','-T','-o','BatchMode=yes','-o','HostKeyAlias=storage.example.invalid','-J',web,win]
scpwin=['scp','-q','-o','BatchMode=yes','-o','HostKeyAlias=storage.example.invalid','-J',web]
def run(cmd): return subprocess.run(cmd,check=True)
def ps(source): return run(sshwin+['powershell.exe -NoProfile -NonInteractive -OutputFormat Text -EncodedCommand '+base64.b64encode(source.encode('utf-16le')).decode()])
identity='backup-'+uuid.uuid4().hex
stage=a.web_root+'/state/split-backups/'+identity
remote=a.backup_root+'/'+identity+'.stage'
backup=a.backup_root+'/'+identity
restore=backup+'.restore-check'
q=shlex.quote
shell=f'''set -e
cd {q(a.web_root)}
active=$(systemctl --user is-active {q(a.unit)} || true)
if [ "$active" = active ]; then systemctl --user stop {q(a.unit)}; fi
trap 'if [ "$active" = active ]; then systemctl --user start {q(a.unit)}; fi' EXIT
set -a
. {q(a.env)}
set +a
export WG_SPLIT_STAGE={q(stage)}
node --import tsx scripts/split-account-backup.ts prepare > /dev/null
'''
run(['ssh','-T','-o','BatchMode=yes',web,shell])
print('已取得一致性元数据快照；原服务运行状态已恢复。',flush=True)
ps(f'''$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'WVN-STORAGE'){{throw 'Wrong host'}}
if((Get-PSDrive H).Free -lt 64GB){{throw 'space_stop'}}
New-Item -ItemType Directory -Force '{a.backup_root}' | Out-Null
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls '{a.backup_root}' /inheritance:r /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
New-Item -ItemType Directory '{remote}' | Out-Null
''')
with tempfile.TemporaryDirectory(prefix='wg-split-metadata-') as temporary:
 for name in ['accounts.sqlite','secret','deletions.jsonl','share-revocations.jsonl','split-manifest.json']:
  file=pathlib.Path(temporary)/name
  run(['scp','-q','-o','BatchMode=yes',web+':'+stage+'/'+name,str(file)])
  file.chmod(0o600)
  run(scpwin+[str(file),win+':'+remote+'/'+name])
 config=pathlib.Path(temporary)/'finalize.json'
 config.write_text(json.dumps({'stage':remote,'blobRoot':a.blob_root,'destination':backup,'restoreDirectory':restore}))
 config.chmod(0o600)
 run(scpwin+[str(config),win+':'+remote+'/finalize.json'])
ps(f'''$ErrorActionPreference='Stop'
Set-Location '{a.storage_code}'
& C:\\nvm4w\\nodejs\\node.exe --import tsx scripts/split-account-backup.ts finalize '{remote}/finalize.json'
if($LASTEXITCODE -ne 0){{throw 'Backup verification failed'}}
''')
print('H 盘备份和恢复检查已完成：'+backup,flush=True)
