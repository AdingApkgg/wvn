#!/bin/sh
set -eu
cd /home/wvn/wg-manager-preview
mkdir -p state/e2e reports
export WG_DATABASE="$PWD/state/e2e/catalog.db" WG_STATE_DIR="$PWD/state/e2e"
export WG_PORT=8291 WG_ADMIN_PORT=8292 WG_TEST_URL=http://127.0.0.1:8291 WG_ADMIN_URL=http://127.0.0.1:8292 WG_TEST_TOKEN_FILE="$PWD/state/e2e/admin-token"
rm -f "$WG_DATABASE" "$WG_DATABASE-wal" "$WG_DATABASE-shm"
./node_modules/.bin/tsx scripts/seed.ts
node --import tsx server.ts > state/e2e/server.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5; do if curl -fsS http://127.0.0.1:8291/health >/dev/null; then break; fi; sleep 1; done
./node_modules/.bin/playwright test
