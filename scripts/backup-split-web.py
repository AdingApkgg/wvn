#!/usr/bin/env python3
"""旧 SQLite 跨机自动备份入口已停用；使用原生 PostgreSQL 分步持久化流程。"""
import sys


def main() -> int:
    print(
        "旧 backup-split-web.py 已停用：它依赖 accounts.sqlite、阻塞式 SSH 和旧自动恢复协议。\n"
        "PostgreSQL 请按 docs/pg-backups.md 使用独立持久化任务执行：\n"
        "  Web：node --import tsx scripts/split-account-backup.ts prepare\n"
        "  传输：accounts.pgdump、secret、deletions.jsonl、share-revocations.jsonl、manifest.json、split-manifest.json\n"
        "  存档主机：node --import tsx scripts/split-account-backup.ts finalize <私有配置文件>\n"
        "  独立空 PG 目标：node --import tsx scripts/account-backup.ts apply\n"
        "finalize 只验证文件并准备恢复；必须完成 apply 和服务启动账本回放才算恢复验收。\n"
        "连接从私有环境文件加载，不把密码或数据库 URL 放在命令行或输出中。",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
