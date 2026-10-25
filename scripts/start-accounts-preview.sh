#!/usr/bin/env bash
set -euo pipefail
preview_root=${WG_ACCOUNT_PREVIEW_ROOT:-/home/wvn/wg-accounts-preview-20261019}
cd "$preview_root"
test "$(hostname)" = localhost
preview_state="$preview_root/state/accounts-preview"
mkdir -p "$preview_state"
chmod 700 "$preview_state"
if test -f "$preview_state/pid"; then
 previous_pid=$(cat "$preview_state/pid")
 if [[ "$previous_pid" =~ ^[0-9]+$ ]] && kill -0 "$previous_pid" 2>/dev/null; then
  test "$(readlink -f "/proc/$previous_pid/cwd")" = "$preview_root" || { echo 'Refusing to stop an unowned process'; exit 1; }
  tr '\0' ' ' < "/proc/$previous_pid/cmdline" | rg -q 'accounts-server.ts' || { echo 'Recorded process is not WG accounts'; exit 1; }
  kill "$previous_pid"
  for i in {1..20}; do if ! kill -0 "$previous_pid" 2>/dev/null; then break; fi; sleep .25; done
 fi
fi
if test -n "$(ss -H -ltn 'sport = :18283')"; then echo 'Port 18283 is already in use; no unowned listener was changed'; exit 1; fi
if ! test -f "$preview_state/tls.key"; then
 openssl req -x509 -newkey rsa:2048 -nodes -keyout "$preview_state/tls.key" -out "$preview_state/tls.crt" -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' > "$preview_state/certificate.log" 2>&1
 chmod 600 "$preview_state/tls.key"
fi
node --input-type=module - "$preview_state" <<'NODE'
import {existsSync,writeFileSync} from 'node:fs';import {randomBytes}from'node:crypto';
for(const name of ['secret']){const path=process.argv[2]+'/'+name;if(!existsSync(path))writeFileSync(path,randomBytes(48).toString('base64url'),{mode:0o600});}
NODE
export WG_ACCOUNT_REVISION=$(cat reports/accounts-source-revision)
export WG_ACCOUNT_ORIGIN=https://localhost:18283 WG_ACCOUNT_PORT=18283 WG_ACCOUNT_UI=1
export WG_ACCOUNT_DATABASE="$preview_state/accounts.sqlite" WG_ACCOUNT_BLOBS="$preview_state/blobs" WG_ACCOUNT_DELETION_LEDGER="$preview_state/deletions.jsonl"
export WG_ACCOUNT_SECRET_FILE="$preview_state/secret"
export WG_ACCOUNT_TLS_KEY="$preview_state/tls.key" WG_ACCOUNT_TLS_CERT="$preview_state/tls.crt"
nohup node --import tsx accounts-server.ts > "$preview_state/server.log" 2>&1 < /dev/null &
account_pid=$!
printf '%s\n' "$account_pid" > "$preview_state/pid"
for i in {1..30}; do
 if ! kill -0 "$account_pid" 2>/dev/null; then echo 'Account preview exited; inspect its private log'; exit 1; fi
 if curl -kfsS https://localhost:18283/health >/dev/null 2>&1; then
  node --input-type=module - "$account_pid" "$preview_root" <<'NODE'
console.log(JSON.stringify({status:'running',service:'wg-accounts-preview',pid:Number(process.argv[2]),root:process.argv[3],origin:'https://localhost:18283',startedAt:new Date().toISOString()}));
NODE
  exit 0
 fi
 sleep .5
done
echo 'Account preview did not become healthy';exit 1
