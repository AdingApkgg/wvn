#!/usr/bin/env bash
set -euo pipefail
# 分享验收统一使用有真实PG/Redis/Meili及来源回执的平台QA，避免旧入口缺少隔离fixture。
# 需在构建机本任务持久化job中加载私有services.env；不安装、不构建、不操作旧SQLite。
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec bash "$script_dir/../tests/e2e/run-remote.sh" "$@"
