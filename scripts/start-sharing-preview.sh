#!/usr/bin/env bash
set -euo pipefail
# 只在已核验主机的独立持久化任务中执行；断线后查询原任务，不重复启动。
# 安装、构建、浏览器和服务任务须由既有执行器或独立 tmux 保存日志与退出码。
: "${WG_DATABASE_URL:?必须从私有环境注入 WG_DATABASE_URL，参见 docs/platform-postgres.md}"
: "${WG_DATABASE_SCHEMA:?必须从私有环境注入 WG_DATABASE_SCHEMA，参见 docs/platform-postgres.md}"
: "${WG_ACCOUNT_DATABASE_URL:?必须从私有环境注入 WG_ACCOUNT_DATABASE_URL，参见 docs/platform-postgres.md}"
: "${WG_ACCOUNT_DATABASE_SCHEMA:?必须从私有环境注入 WG_ACCOUNT_DATABASE_SCHEMA，参见 docs/platform-postgres.md}"
node --input-type=module <<'PGCONFIG'
try {
 const url = new URL(process.env.WG_DATABASE_URL);
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2) throw Error();
} catch { throw Error('WG_DATABASE_URL 必须是 PostgreSQL URL；不接受 SQLite 文件，参见 docs/platform-postgres.md'); }
try {
 const url = new URL(process.env.WG_ACCOUNT_DATABASE_URL);
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2) throw Error();
} catch { throw Error('WG_ACCOUNT_DATABASE_URL 必须是 PostgreSQL URL；不接受 SQLite 文件，参见 docs/platform-postgres.md'); }
if (!/^(?:qa|preview|test|e2e)_[a-z0-9_]{1,55}$/.test(process.env.WG_DATABASE_SCHEMA ?? '')) throw Error('WG_DATABASE_SCHEMA 必须指定独立 qa_/preview_/test_/e2e_ schema');
if (!/^(?:qa|preview|test|e2e)_[a-z0-9_]{1,55}$/.test(process.env.WG_ACCOUNT_DATABASE_SCHEMA ?? '')) throw Error('WG_ACCOUNT_DATABASE_SCHEMA 必须指定独立 qa_/preview_/test_/e2e_ schema');
PGCONFIG
export WG_DATABASE_URL WG_DATABASE_SCHEMA WG_ACCOUNT_DATABASE_URL WG_ACCOUNT_DATABASE_SCHEMA
unset WG_DATABASE
export WG_ACCOUNT_DATABASE="$WG_ACCOUNT_DATABASE_URL"
cd "${WG_ACCOUNT_PREVIEW_ROOT:-/home/wvn/wg-accounts-preview-20261019}"
test "$(hostname)" = localhost
sharing_root="$PWD"
sharing_state="$sharing_root/state/sharing-preview"
account_state="$sharing_root/state/accounts-preview"
mkdir -p "$sharing_state"
chmod 700 "$sharing_state"
# 改动进程前核验依赖与实际归属。
source scripts/lib/sharing-preflight.sh
for required in reports/sharing-source-revision reports/sharing-source-manifest.json build/server/index.js "$account_state/tls.crt" "$account_state/tls.key" "$account_state/secret" "$account_state/deletions.jsonl"; do
 test -s "$required" || { test "$required" = "$account_state/deletions.jsonl" && test -f "$required"; } || { echo "Missing prerequisite: $required"; exit 1; }
done
preflight_listener 18283 "$account_state/pid" "$sharing_root" accounts-server.ts
preflight_listener 18285 "$account_state/pid" "$sharing_root" accounts-server.ts
preflight_listener 18284 "$sharing_state/catalog.pid" "$sharing_root" server.ts
preflight_listener 18286 "$sharing_state/catalog.pid" "$sharing_root" server.ts
stop_owned(){
 local record="$1" expected="$2"
 if test -f "$record"; then
  local owned_pid=$(cat "$record")
  if [[ "$owned_pid" =~ ^[0-9]+$ ]] && kill -0 "$owned_pid" 2>/dev/null; then
   test "$(readlink -f "/proc/$owned_pid/cwd")" = "$sharing_root" || { echo 'Refusing foreign cwd'; exit 1; }
   tr '\0' ' ' < "/proc/$owned_pid/cmdline" | rg -q "$expected" || { echo 'Refusing foreign command'; exit 1; }
   kill "$owned_pid"
   for i in {1..30}; do if ! kill -0 "$owned_pid" 2>/dev/null; then break; fi; sleep .2; done
  fi
 fi
}
# 先做 PG 一致性备份，并保留独立删除与分享撤销账本，再改变预览进程。
sharing_backup="$sharing_state/before-$(date +%Y%m%d-%H%M%S)-$RANDOM"
export WG_ACCOUNT_BLOBS="$account_state/blobs" WG_ACCOUNT_DELETION_LEDGER="$account_state/deletions.jsonl"
if test -f "$account_state/share-revocations.jsonl"; then export WG_ACCOUNT_SHARE_LEDGER="$account_state/share-revocations.jsonl"; else unset WG_ACCOUNT_SHARE_LEDGER; fi
WG_ACCOUNT_BACKUP_DIR="$sharing_backup" node --import tsx scripts/account-backup.ts > "$sharing_backup-receipt.json"
stop_owned "$account_state/pid" accounts-server.ts
stop_owned "$sharing_state/catalog.pid" server.ts
for sharing_port in 18283 18284 18285 18286; do test -z "$(ss -H -ltn "sport = :$sharing_port")" || { echo "Unowned or lingering listener; no further process changed"; exit 1; }; done
export NODE_EXTRA_CA_CERTS="$account_state/tls.crt"
export WG_PORT=18284 WG_ADMIN_PORT=18286 WG_STATE_DIR="$sharing_state/catalog-admin"
if test "${WG_PREVIEW_SEED_CATALOG:-0}" = 1; then node --import tsx scripts/seed.ts > "$sharing_state/seed.log" 2>&1; fi
export WG_SHARE_BACKEND_ORIGIN=https://localhost:18283 WG_SHARE_ACCOUNT_ORIGIN=https://localhost:18283
nohup node --import tsx server.ts > "$sharing_state/catalog.log" 2>&1 < /dev/null &
printf '%s\n' "$!" > "$sharing_state/catalog.pid"
export WG_ACCOUNT_ORIGIN=https://localhost:18283 WG_ACCOUNT_PORT=18283 WG_ACCOUNT_UI=1 WG_ACCOUNT_REVISION=$(cat reports/sharing-source-revision)
export WG_ACCOUNT_SHARE_LEDGER="$account_state/share-revocations.jsonl" WG_ACCOUNT_CATALOG_ORIGIN=http://127.0.0.1:18284
export WG_ACCOUNT_SECRET_FILE="$account_state/secret" WG_ACCOUNT_TLS_KEY="$account_state/tls.key" WG_ACCOUNT_TLS_CERT="$account_state/tls.crt"
export WG_SHARE_ADMIN_ORIGIN=https://localhost:18285 WG_SHARE_ADMIN_PORT=18285 WG_SHARE_ADMIN_TOKEN_FILE="$account_state/share-admin-token"
nohup node --import tsx accounts-server.ts > "$account_state/server.log" 2>&1 < /dev/null &
printf '%s\n' "$!" > "$account_state/pid"
for i in {1..30}; do
 if ! kill -0 "$(cat "$account_state/pid")" 2>/dev/null || ! kill -0 "$(cat "$sharing_state/catalog.pid")" 2>/dev/null; then echo 'Owned preview exited; inspect its logs'; exit 1; fi
 if curl -kfsS https://localhost:18283/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:18284/health >/dev/null 2>&1 && curl -kfsS https://localhost:18285/share-admin >/dev/null 2>&1; then
  touch "$sharing_state/ready"
  printf 'Sharing preview ready; account 18283, catalog 18284, private moderation 18285. Backup: %s\n' "$sharing_backup"
  exit 0
 fi
 sleep .5
done
echo 'Sharing preview not ready; production untouched'; exit 1
