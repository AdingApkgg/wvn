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
mkdir -p state/accounts-test reports
if ! test -f state/accounts-test/tls.key; then
 openssl req -x509 -newkey rsa:2048 -nodes -keyout state/accounts-test/tls.key -out state/accounts-test/tls.crt -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' > state/accounts-test/certificate.log 2>&1
 chmod 600 state/accounts-test/tls.key
fi
node -e 'require("fs").writeFileSync("state/accounts-test/secret",require("crypto").randomBytes(48).toString("base64url"),{mode:0o600})'
export WG_ACCOUNT_ORIGIN=https://localhost:8393 WG_ACCOUNT_PORT=8393
export WG_ACCOUNT_SECRET_FILE="$PWD/state/accounts-test/secret"
export WG_ACCOUNT_TLS_KEY="$PWD/state/accounts-test/tls.key" WG_ACCOUNT_TLS_CERT="$PWD/state/accounts-test/tls.crt"
export WG_ACCOUNT_DELETION_LEDGER="$PWD/state/accounts-test/deletions-$(date +%s)-$RANDOM.jsonl"
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
