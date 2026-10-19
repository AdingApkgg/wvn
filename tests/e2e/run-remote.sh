#!/bin/sh
set -eu
cd "${WG_TEST_ROOT:-/home/wvn/wg-manager-preview}"
test "$(hostname)" = localhost
mkdir -p state/e2e reports
export WG_DATABASE="$PWD/state/e2e/catalog.db" WG_STATE_DIR="$PWD/state/e2e"
export WG_PORT=${WG_TEST_PUBLIC_PORT:-8291} WG_ADMIN_PORT=${WG_TEST_ADMIN_PORT:-8292}
export WG_TEST_URL=http://127.0.0.1:$WG_PORT WG_ADMIN_URL=http://127.0.0.1:$WG_ADMIN_PORT WG_TEST_TOKEN_FILE="$PWD/state/e2e/admin-token"
rm -f "$WG_DATABASE" "$WG_DATABASE-wal" "$WG_DATABASE-shm"
./node_modules/.bin/tsx scripts/seed.ts
if test -n "$(ss -H -ltn "sport = :$WG_PORT")" || test -n "$(ss -H -ltn "sport = :$WG_ADMIN_PORT")"; then echo "Catalog test ports already in use"; exit 1; fi
node --import tsx server.ts > state/e2e/server.log 2>&1 &
preview_pid=$!
cleanup(){ kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true; }
trap cleanup EXIT
for attempt in 1 2 3 4 5; do if curl -fsS "$WG_TEST_URL/health" >/dev/null 2>&1; then break; fi; sleep 1; done
./node_modules/.bin/playwright test
