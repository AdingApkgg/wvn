#!/usr/bin/env bash
set -euo pipefail
cd /home/wvn/wg-accounts-preview-20261019
test "$(hostname)" = localhost
mkdir -p state/accounts-test reports
if ! test -f state/accounts-test/tls.key; then
 openssl req -x509 -newkey rsa:2048 -nodes -keyout state/accounts-test/tls.key -out state/accounts-test/tls.crt -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' > state/accounts-test/certificate.log 2>&1
 chmod 600 state/accounts-test/tls.key
fi
node -e 'require("fs").writeFileSync("state/accounts-test/secret",require("crypto").randomBytes(48).toString("base64url"),{mode:0o600})'
export WG_ACCOUNT_ORIGIN=https://localhost:8393 WG_ACCOUNT_PORT=8393 WG_ACCOUNT_DATABASE="$PWD/state/accounts-test/$(date +%s)-$RANDOM.sqlite"
export WG_ACCOUNT_SECRET_FILE="$PWD/state/accounts-test/secret"
export WG_ACCOUNT_TLS_KEY="$PWD/state/accounts-test/tls.key" WG_ACCOUNT_TLS_CERT="$PWD/state/accounts-test/tls.crt"
export WG_ACCOUNT_DELETION_LEDGER="$WG_ACCOUNT_DATABASE.deletions.jsonl"
export WG_ACCOUNT_BLOBS="$PWD/state/accounts-test/blobs-$RANDOM"
export WG_ACCOUNT_UI=1
export WG_ACCOUNT_TEST_URL="$WG_ACCOUNT_ORIGIN"
export WG_ACCOUNT_TEST_CERT="$PWD/state/accounts-test/tls.crt"
if test -n "$(ss -H -ltn 'sport = :8393')"; then echo "Account test port already in use"; exit 1; fi
node --import tsx accounts-server.ts > state/accounts-test/server.log 2>&1 &
account_pid=$!
cleanup(){ kill "$account_pid" 2>/dev/null || true; wait "$account_pid" 2>/dev/null || true; }
trap cleanup EXIT
for i in {1..20}; do if ! kill -0 "$account_pid" 2>/dev/null; then cat state/accounts-test/server.log; exit 1; fi; if curl -kfsS "$WG_ACCOUNT_ORIGIN/health" >/dev/null 2>&1; then break; fi; sleep .5; done
node_modules/.bin/playwright test tests/e2e/accounts.spec.ts "$@"
