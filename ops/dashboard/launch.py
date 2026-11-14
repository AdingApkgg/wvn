from pathlib import Path
import json, os, re, subprocess, sys
assert subprocess.check_output(['hostname'], text=True).strip() == 'localhost'
base = Path('/home/i/wvn-dashboard-20261114')
name = sys.argv[1]
assert re.fullmatch('[a-z0-9-]+', name)
job = base / 'jobs' / name
job.mkdir(mode=0o700, exist_ok=False)
session = 'wvn-dashboard-20261114-' + name
script = '''#!/bin/bash
set -Eeuo pipefail
umask 077
job_dir="''' + str(job) + '''"
exec >"$job_dir/run.log" 2>&1
trap 'code=$?; echo "$code" > "$job_dir/exit-code"; date -u +%FT%TZ > "$job_dir/finished-at"' EXIT
date -u +%FT%TZ > "$job_dir/started-at"
echo $$ > "$job_dir/pid"
test "$(hostname)" = localhost
test -n "${TMUX:-}"
set -a
source /etc/environment
source /home/i/wvn-platform-20261029/private/services.env
set +a
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export HTTP_PROXY=http://127.0.0.1:11090 HTTPS_PROXY=http://127.0.0.1:11090
export http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY"
export TMPDIR=/home/i/wvn-dashboard-20261114/private/tmp
mkdir -p "$TMPDIR"
export NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1
cd /home/i/wvn-dashboard-20261114/source
''' + sys.stdin.read()
(job / 'run.sh').write_text(script)
os.chmod(job / 'run.sh', 0o700)
(job / 'task.json').write_text(json.dumps(dict(host='localhost', session=session, script=str(job/'run.sh'), log=str(job/'run.log'), exitCode=str(job/'exit-code'))))
subprocess.run(['tmux', 'new-session', '-d', '-s', session, 'bash', str(job/'run.sh')], check=True)
print(json.dumps(dict(session=session, job=str(job))))
