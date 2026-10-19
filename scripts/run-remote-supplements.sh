#!/usr/bin/env bash
# Run on the Mac: synchronize and verify on the existing Linux build host.
# This script does not publish to Windows or modify production.
set -euo pipefail
cd "$(dirname "$0")/.."
builder=build.example.invalid
remote_root=/home/wvn/wg-manager-preview
mkdir -p reports
stamp=$(date +%Y%m%d-%H%M%S)
log="$PWD/reports/remote-supplements-$stamp.log"

ssh -o BatchMode=yes -o ConnectTimeout=15 "$builder" \
  'test "$(hostname)" = localhost && test -d /home/wvn/wg-manager-preview/node_modules && hostname'
rsync -az src/ "$builder:$remote_root/src/"
rsync -az tests/ "$builder:$remote_root/tests/"
scp scripts/prepare-metadata-supplements.ts scripts/cache-metadata-media.py \
  scripts/build-metadata-report.py scripts/verify-metadata.mjs \
  "$builder:$remote_root/scripts/"
scp data/metadata-official-sources.json data/metadata-supplements.json \
  "$builder:$remote_root/data/"

ssh -o BatchMode=yes -o ConnectTimeout=15 "$builder" 'bash -se' <<'REMOTE' 2>&1 | tee "$log"
set -euo pipefail
cd /home/wvn/wg-manager-preview
test "$(hostname)" = localhost
export HTTPS_PROXY=http://127.0.0.1:11090 HTTP_PROXY=http://127.0.0.1:11090
mkdir -p reports
cp -p data/metadata.json "reports/before-supplements-$(date +%Y%m%d-%H%M%S).json"
node --import tsx --test tests/metadata.test.ts
node --import tsx scripts/prepare-metadata-supplements.ts
python3 scripts/cache-metadata-media.py
python3 - <<'PY'
import json
from collections import Counter
from pathlib import Path
report=json.loads(Path('data/metadata-media-report.json').read_text())
assert not report['errors'], report
doc=json.loads(Path('data/metadata.json').read_text())
works=doc['works']
assert len(works)==64
assert all(w['cover'] and w['description'].strip() for w in works)
kinds=dict(Counter(w['cover'].get('kind','original') for w in works))
assert kinds=={'original':49,'promotion':7,'logo':5,'screenshot':3}, kinds
assert sum(len(w['screenshots']) for w in works)==269
images={i['url'] for w in works for i in [w['cover'],*w['screenshots']]}
assert len(images)==330, len(images)
print(json.dumps({'works':64,'descriptions':64,'coverKinds':kinds,'images':len(images)}))
PY
python3 scripts/build-metadata-report.py
npm test
NODE_ENV=development npm run typecheck
NODE_ENV=production npm run build
sh tests/e2e/run-remote.sh
printf '\nWG_REMOTE_SUPPLEMENTS_VERIFIED\n'
REMOTE

scp "$builder:$remote_root/data/metadata.json" \
  "$builder:$remote_root/data/metadata-media-report.json" \
  "$builder:$remote_root/data/metadata-match-report.json" data/
scp "$builder:$remote_root/reports/supplements-desktop.png" \
  "$builder:$remote_root/reports/supplements-mobile.png" reports/
printf '\n远程验证完成；本地日志：%s\n生产未修改。\n' "$log"
