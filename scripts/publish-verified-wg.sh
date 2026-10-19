#!/usr/bin/env bash
# Run on the Mac. Build/browser work stays on Linux; serving stays on Windows.
set -euo pipefail
cd "$(dirname "$0")/.."
builder=build.example.invalid
windows=storage.example.invalid
release_id="20261019-$(date +%H%M%S)"
scratch=$(mktemp -d /private/tmp/wg-release.XXXXXX)
inbox="H:/wg-manager-deploy-$release_id"
helper=/Users/developer/Code/temp/wg-deploy/remote_ps.py
mkdir -p reports
log="$PWD/reports/publish-$release_id.log"
exec > >(tee "$log") 2>&1
active=0

write_phase() {
  local phase=$1
  cat > "$scratch/invoke-$phase.ps1" <<PS
\$ErrorActionPreference='Stop'
try { & 'H:\wg-manager-deploy-$release_id\release-windows.ps1' -ReleaseId '$release_id' -Mode '$phase'; exit 0 } catch { Write-Error \$_; exit 1 }
PS
}
run_phase() {
  local phase=$1
  write_phase "$phase"
  python3 "$helper" "$scratch/invoke-$phase.ps1"
}
cleanup() {
  local result=$?
  trap - EXIT
  if [[ $result -ne 0 && $active -eq 1 ]]; then
    printf '\n验证中断，尝试仅回滚本次生产候选与 Caddy 配置。\n'
    if ! run_phase Rollback; then
      printf '\n自动回滚未确认。请保留此日志和发布目录，检查：%s\n' "$inbox"
    fi
  fi
  printf '\n日志：%s\n' "$log"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
write_phase Rollback
cp "$scratch/invoke-Rollback.ps1" "reports/rollback-$release_id.ps1"

# Send only the 12 new assets; verify all 330 cached files on Windows.
ssh -o BatchMode=yes -o ConnectTimeout=15 "$builder" bash -s -- "$release_id" <<'REMOTE'
set -euo pipefail
test "$(hostname)" = localhost
cd /home/wvn/wg-manager-preview
export WG_PACKAGE_DIR="/tmp/wg-release-$1"
mkdir "$WG_PACKAGE_DIR"
python3 - <<'PY'
import json,os,pathlib,tarfile
root=pathlib.Path.cwd();out=pathlib.Path(os.environ['WG_PACKAGE_DIR'])
last=json.loads((root/'test-results/.last-run.json').read_text())
assert last['status']=='passed' and not last['failedTests'],last
report=json.loads((root/'data/metadata-media-report.json').read_text())
assert report['works']==64 and report['covers']==64 and report['descriptions']==64 and report['images']==330 and not report['errors'],report
assert (root/'build/server/index.js').is_file()
doc=json.loads((root/'data/metadata.json').read_text())
files=sorted({i['url'].removeprefix('/') for w in doc['works'] for i in [w['cover'],*w['screenshots']]})
assert len(files)==330
new_files=sorted({w['cover']['url'].removeprefix('/') for w in doc['works'] if w['cover'].get('kind') in ['logo','promotion']})
assert len(new_files)==12
with tarfile.open(out/'media.tgz','w:gz') as archive:
 for name in new_files:
  assert name.startswith('media/') and len(pathlib.Path(name).parts)==2
  archive.add(root/name,arcname=name)
with tarfile.open(out/'qa.tgz','w:gz') as archive:
 for name in ['node_modules/@playwright/test','node_modules/playwright','node_modules/playwright-core','tests/e2e/metadata-supplements.spec.ts','tests/e2e/metadata.spec.ts']:
  archive.add(root/name,arcname=name)
PY
tar --exclude=data/metadata-sources --exclude=data/metadata-collected.json --exclude=data/metadata-plan.json \
 -czf "$WG_PACKAGE_DIR/app.tgz" package.json package-lock.json server.ts src scripts data build react-router.config.ts tsconfig.json
python3 - <<'PY'
import os,json,hashlib,pathlib
p=pathlib.Path(os.environ['WG_PACKAGE_DIR'])
sha=lambda file:hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
manifest={'archives':{n:sha(p/n) for n in ['app.tgz','media.tgz','qa.tgz']},'metadataSha256':sha(pathlib.Path('data/metadata.json'))}
doc=json.loads(pathlib.Path('data/metadata.json').read_text())
names={i['url'].removeprefix('/') for w in doc['works'] for i in [w['cover'],*w['screenshots']]}
manifest['mediaHashes']={n:sha(pathlib.Path(n)) for n in sorted(names)}
(p/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'archives':manifest['archives'],'metadataSha256':manifest['metadataSha256'],'cachedImages':len(names),'newImages':12,'mediaPackageBytes':(p/'media.tgz').stat().st_size}))
PY
REMOTE
scp -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "$builder:/tmp/wg-release-$release_id/app.tgz" \
 "$builder:/tmp/wg-release-$release_id/media.tgz" \
 "$builder:/tmp/wg-release-$release_id/qa.tgz" \
 "$builder:/tmp/wg-release-$release_id/manifest.json" "$scratch/"
cat > "$scratch/prepare.ps1" <<PS
\$ErrorActionPreference='Stop';\$ProgressPreference='SilentlyContinue'
if(\$env:COMPUTERNAME -ne 'WVN-STORAGE'){throw 'Unexpected host'}
if((Get-PSDrive H).Free -lt 66571993088){throw 'Insufficient reserve'}
if(Test-Path 'H:\wg-manager-deploy-$release_id'){throw 'Release inbox already exists'}
New-Item -ItemType Directory -Path 'H:\wg-manager-deploy-$release_id' | Out-Null
PS
python3 "$helper" "$scratch/prepare.ps1"
scp -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "$scratch/app.tgz" "$scratch/media.tgz" "$scratch/qa.tgz" "$scratch/manifest.json" \
 scripts/release-windows.ps1 "$windows:$inbox/"
active=1
run_phase Stage

browser_check() {
  local target=$1 proxy=$2 label=$3
  ssh "$builder" bash -s -- "$target" "$proxy" "$release_id" "$label" <<'REMOTE'
set -euo pipefail
cd /home/wvn/wg-manager-preview
export WG_TEST_URL="$1" WG_USE_PROXY="$2"
export WG_BROWSER_REPORT="$PWD/reports/release-$3-$4-browser.json"
config="playwright.release-$3.config.ts"
trap 'rm -f "$config"' EXIT
if [ "$WG_USE_PROXY" = 0 ];then
 ready=0
 for attempt in 1 2 3 4 5 6 7 8 9 10;do
  if curl --noproxy '*' -fsS --max-time 3 "$WG_TEST_URL/health" >/dev/null;then ready=1;break;fi
  sleep 1
 done
 test "$ready" = 1
fi
cat > "$config" <<'CONFIG'
import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';
export default defineConfig({...base,use:{...base.use,proxy:process.env.WG_USE_PROXY==='1'?{server:'http://127.0.0.1:11090'}:undefined},reporter:[['list'],['json',{outputFile:process.env.WG_BROWSER_REPORT}]]});
CONFIG
./node_modules/.bin/playwright test --config "$config" tests/e2e/metadata-supplements.spec.ts tests/e2e/metadata.spec.ts
python3 - <<'PY'
import json,os
report=json.load(open(os.environ['WG_BROWSER_REPORT']))
assert report['stats']['expected']==2 and report['stats']['unexpected']==0 and report['stats']['skipped']==0 and report['stats']['flaky']==0,report['stats']
print('Two read-only browser checks passed for '+os.environ['WG_TEST_URL'])
PY
REMOTE
}
acceptance() {
  local name=$1
  python3 - "$scratch/manifest.json" "$scratch/$name" "$release_id" <<'PY'
import sys,json,datetime
manifest=json.load(open(sys.argv[1]))
json.dump({'releaseId':sys.argv[3],'metadataSha256':manifest['metadataSha256'],'status':'passed','browserTests':2,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},open(sys.argv[2],'w'))
PY
  scp -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "$scratch/$name" "$windows:$inbox/$name"
}
run_phase Browser
run_phase Promote
browser_check https://wg.saop.cc 1 public
acceptance public-browser-acceptance.json
run_phase Confirm
active=0
scp -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "$windows:$inbox/receipt.json" "reports/production-$release_id.json"
printf '\nWG_PRODUCTION_RELEASE_VERIFIED\n生产：https://wg.saop.cc/\n回滚命令：python3 %s %s/reports/rollback-%s.ps1\n' "$helper" "$PWD" "$release_id"
