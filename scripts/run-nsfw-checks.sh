#!/usr/bin/env bash
set -euo pipefail
test "$(hostname)" = "${WG_EXPECTED_BUILD_HOST:?}"
test -n "${TMUX:-}"
cd "${WG_NSFW_ROOT:?}"
set -a
. /etc/environment
. "${WVN_QA_ENV:?}"
set +a
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
export HTTPS_PROXY="${https_proxy:?}" HTTP_PROXY="${http_proxy:?}"
# 机器共享/tmp为tmpfs且接近满额，测试只使用本任务磁盘目录，不清理其他任务。
mkdir -p "$WG_NSFW_ROOT/../private/tmp"
chmod 700 "$WG_NSFW_ROOT/../private/tmp"
export TMPDIR="$WG_NSFW_ROOT/../private/tmp"
case "${1:-}" in
  baseline|red-account|red-classification|content|cas|full)
    # Better Auth建表检查会枚举可见schema，不能与另一轮fixture清理并行。
    exec 9>"$WG_NSFW_ROOT/../private/qa-check.lock"
    flock -x 9
    ;;
esac
node --input-type=module - <<'JS'
const target=new URL(process.env.WVN_TEST_DATABASE_URL??'');
if(target.username!=='wvn_qa'||target.pathname!=='/wvn_qa'||target.port!=='25439'||!['localhost','127.0.0.1'].includes(target.hostname))throw Error('只允许独立QA数据库');
JS
case "${1:-}" in
  baseline) node --import @oxc-node/core/register --test --test-concurrency=1 tests/accounts.test.ts tests/catalog-postgres.test.ts tests/search-runtime.test.ts ;;
  red-account) node --import @oxc-node/core/register --test --test-concurrency=1 tests/content-eligibility.test.ts ;;
  red-classification) node --import @oxc-node/core/register --test --test-concurrency=1 tests/content-classification.test.ts ;;
  content) node --import @oxc-node/core/register --test --test-concurrency=1 tests/content-*.test.ts ;;
  cas) node --import @oxc-node/core/register --test --test-concurrency=1 tests/cas-browser-client.test.mjs tests/cas-manifest.test.ts tests/content-preview.test.ts tests/resource-api.test.ts tests/version-resources.test.ts tests/platform-integration.test.ts tests/b2-direct-server.test.ts ;;
  full) npm test; node --test --test-concurrency=1 tests/*.test.mjs ;;
  build) NODE_ENV=development npm run typecheck; NODE_ENV=production npm run build ;;
  browser) node --import @oxc-node/core/register scripts/nsfw-preview.ts verify ;;
  cas-browser) WG_CONTENT_NATIVE_CAS=1 WG_CONTENT_TEST_GREP='真实ONS' node --import @oxc-node/core/register scripts/nsfw-preview.ts verify ;;
  browser-red) node --import @oxc-node/core/register scripts/nsfw-preview.ts red ;;
  preview) node --import @oxc-node/core/register scripts/nsfw-preview.ts serve ;;
  metadata) python3 scripts/fetch-content-image-evidence.py ;;
  media) python3 scripts/prepare-nsfw-media.py ;;
  *) echo '未知检查阶段' >&2; exit 2 ;;
esac
