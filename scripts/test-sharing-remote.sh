#!/usr/bin/env bash
set -euo pipefail
cd /home/wvn/wg-accounts-preview-20261019
test "$(hostname)" = localhost
mkdir -p state/sharing-test reports
sharing_run="$PWD/state/sharing-test/$(date +%s)-$RANDOM"
mkdir -p "$sharing_run"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$sharing_run/tls.key" -out "$sharing_run/tls.crt" -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' > "$sharing_run/certificate.log" 2>&1
chmod 600 "$sharing_run/tls.key"
node -e 'const f=require("fs"),c=require("crypto"),p=process.argv[1];f.writeFileSync(p+"/secret",c.randomBytes(48).toString("base64url"),{mode:0o600})' "$sharing_run"
export NODE_EXTRA_CA_CERTS="$sharing_run/tls.crt"
export WG_ACCOUNT_ORIGIN=https://localhost:18483 WG_ACCOUNT_PORT=18483 WG_ACCOUNT_DATABASE="$sharing_run/accounts.sqlite" WG_ACCOUNT_BLOBS="$sharing_run/blobs" WG_ACCOUNT_DELETION_LEDGER="$sharing_run/deletions.jsonl" WG_ACCOUNT_SHARE_LEDGER="$sharing_run/share-revocations.jsonl"
export WG_ACCOUNT_SECRET_FILE="$sharing_run/secret" WG_ACCOUNT_TLS_KEY="$sharing_run/tls.key" WG_ACCOUNT_TLS_CERT="$sharing_run/tls.crt" WG_ACCOUNT_UI=1
export WG_ACCOUNT_CATALOG_ORIGIN=http://127.0.0.1:18484 WG_SHARE_BACKEND_ORIGIN=https://localhost:18483 WG_SHARE_ACCOUNT_ORIGIN=https://localhost:18483
export WG_SHARE_ADMIN_ORIGIN=https://localhost:18485 WG_SHARE_ADMIN_PORT=18485 WG_SHARE_ADMIN_TOKEN_FILE="$sharing_run/admin-token"
export WG_DATABASE="$sharing_run/catalog.sqlite" WG_PORT=18484 WG_ADMIN_PORT=18486 WG_STATE_DIR="$sharing_run/catalog-state"
export WG_SHARING_TEST_URL=https://localhost:18483 WG_SHARING_PUBLIC_URL=http://127.0.0.1:18484 WG_SHARING_ADMIN_URL=https://localhost:18485
for sharing_port in 18483 18484 18485 18486; do test -z "$(ss -H -ltn "sport = :$sharing_port")" || { echo "Sharing test port occupied"; exit 1; }; done
node --import tsx scripts/seed.ts > "$sharing_run/seed.log" 2>&1
node --import tsx server.ts > "$sharing_run/catalog.log" 2>&1 &
catalog_pid=$!
node --import tsx accounts-server.ts > "$sharing_run/accounts.log" 2>&1 &
account_pid=$!
cleanup(){ kill "$account_pid" "$catalog_pid" 2>/dev/null || true; wait "$account_pid" "$catalog_pid" 2>/dev/null || true; }
trap cleanup EXIT
for i in {1..30}; do
 if ! kill -0 "$account_pid" 2>/dev/null || ! kill -0 "$catalog_pid" 2>/dev/null; then cat "$sharing_run/accounts.log" "$sharing_run/catalog.log"; exit 1; fi
 if curl -kfsS https://localhost:18483/health >/dev/null 2>&1 && test -s "$sharing_run/admin-token"; then break; fi
 sleep .5
done
export WG_SHARING_TEST_CERT="$sharing_run/tls.crt"
export WG_SHARING_ADMIN_TOKEN=$(cat "$sharing_run/admin-token")
node_modules/.bin/playwright test tests/e2e/shares.spec.ts tests/e2e/preview-tls.spec.ts "$@"
