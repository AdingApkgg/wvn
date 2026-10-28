#!/usr/bin/env bash
set -euo pipefail
# 本脚本不安装、不构建，也不删除SQLite或其他预览；由独立持久化任务调用。
cd "${WG_TEST_ROOT:-/home/i/wvn-platform-20261029/source}"
test "$(hostname)" = localhost
if [ -z "${TMUX:-}" ]; then
  echo '请通过本任务remote.py job/tmux运行，断线后先查询原任务状态。' >&2
  exit 1
fi
exec node --import tsx scripts/platform-qa.ts "$@"
