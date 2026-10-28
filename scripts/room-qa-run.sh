#!/usr/bin/env bash
# 必须通过任务持久化执行器在专用远程构建机执行；只监听回环。
set -euo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
task_root=$(dirname "$source_dir")
if [ "$(hostname)" != localhost ] || [ "$task_root" != /home/i/wvn-platform-20261029 ]; then
  echo 'Refusing to run outside the isolated remote task' >&2; exit 1
fi
for port in 28439 28440 28443 28444; do
  if ss -lunt | awk '{print $5}' | rg -q ":${port}$"; then echo "QA port already occupied: $port" >&2; exit 1; fi
done
set -a
. "$task_root/private/rooms.env"
set +a
export WVN_ROOMS_QA=isolated-loopback
export ROOMS_QA_CERT="$task_root/private/rooms-qa.crt" ROOMS_QA_KEY="$task_root/private/rooms-qa.key"
export WT_TLS_CERT="$ROOMS_QA_CERT" WT_TLS_KEY="$ROOMS_QA_KEY" WT_LISTEN=127.0.0.1:28443 WT_ORIGIN=https://127.0.0.1:28444 WT_UPSTREAM_WS=ws://127.0.0.1:28439/api/rooms/ws
turn_config="$task_root/private/rooms-turn-qa.conf"
python3 - "$source_dir" "$turn_config" <<'PY'
from pathlib import Path
import os,sys
p=Path(sys.argv[2]);p.write_text(Path(sys.argv[1]+'/ops/platform/realtime/turnserver.qa.conf').read_text()+'\nstatic-auth-secret='+os.environ['ROOMS_TURN_SECRET']+'\npidfile=/tmp/turn.pid\n');p.chmod(0o600)
PY
turn_name="wvn-platform-20261029-rooms-turn-$$"
qa_pid= gateway_pid=
cleanup() {
  trap - EXIT INT TERM
  [ -z "$gateway_pid" ] || kill "$gateway_pid" 2>/dev/null || true
  [ -z "$qa_pid" ] || kill "$qa_pid" 2>/dev/null || true
  docker logs "$turn_name" > "$source_dir/reports/rooms/turn-qa.log" 2>&1 || true
  docker stop -t 3 "$turn_name" >/dev/null 2>&1 || true
  docker rm "$turn_name" >/dev/null 2>&1 || true
  [ -z "$gateway_pid" ] || wait "$gateway_pid" 2>/dev/null || true
  [ -z "$qa_pid" ] || wait "$qa_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
cd "$source_dir"
docker run -d --name "$turn_name" --network host --user "$(id -u):$(id -g)" --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,noexec,size=8m --cpus 1 --memory 256m --pids-limit 256 -v "$turn_config:/etc/coturn/turnserver.conf:ro" coturn/coturn:4.6.3 -c /etc/coturn/turnserver.conf >/dev/null
node --import tsx scripts/room-qa-server.ts --isolated-qa > reports/rooms/qa-server.log 2>&1 &
qa_pid=$!
"$task_root/tools/wvn-webtransport" > reports/rooms/webtransport-qa.log 2>&1 &
gateway_pid=$!
for n in $(seq 1 60); do
  if curl -ks https://127.0.0.1:28444/qa-info >/dev/null && ss -lun | rg -q '127.0.0.1:28443'; then break; fi
  sleep 0.2
done
export ROOMS_QA_CHROMIUM=${ROOMS_QA_CHROMIUM:-/home/i/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome}
node scripts/room-qa-browser.mjs
