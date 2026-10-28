#!/bin/sh
set -eu
# 只在已核验主机的独立持久化任务中执行；断线后查询原任务，不重复启动。
# 安装、构建、浏览器和服务任务须由既有执行器或独立 tmux 保存日志与退出码。
: "${WG_DATABASE_URL:?必须从私有环境注入 WG_DATABASE_URL，参见 docs/platform-postgres.md}"
: "${WG_DATABASE_SCHEMA:?必须从私有环境注入 WG_DATABASE_SCHEMA，参见 docs/platform-postgres.md}"
node --input-type=module <<'PGCONFIG'
try {
 const url = new URL(process.env.WG_DATABASE_URL);
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2) throw Error();
} catch { throw Error('WG_DATABASE_URL 必须是 PostgreSQL URL；不接受 SQLite 文件，参见 docs/platform-postgres.md'); }
if (!/^(?:qa|preview|test|e2e)_[a-z0-9_]{1,55}$/.test(process.env.WG_DATABASE_SCHEMA ?? '')) throw Error('WG_DATABASE_SCHEMA 必须指定独立 qa_/preview_/test_/e2e_ schema');
PGCONFIG
export WG_DATABASE_URL WG_DATABASE_SCHEMA
unset WG_DATABASE
cd "${WG_CATALOG_PREVIEW_ROOT:-/home/wvn/wg-manager-preview}"
test "$(hostname)" = localhost
export NODE_ENV=production
export WG_PORT=8281 WG_ADMIN_PORT=8282 WG_HOST=127.0.0.1
exec node --import tsx server.ts
