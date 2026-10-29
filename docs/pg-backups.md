# PostgreSQL 账号、私有存档备份与恢复

2026-10-29 生产切换前的原生账号归档已实际恢复到独立空库，38 张表的计数与全部行摘要一致；上线后另有三 schema 原生 PG 归档。详情见 [生产切换记录](production-platform-20261029.md)。

运行时只接受 PostgreSQL URL。私有存档正文仍保留在 BlobStore，按 `ownerHash/hash.bin` 保存，不能上传到公共资源域或 B2 公共对象。原 SQLite 源文件、旧归档和原 B2 对象均保留。

## 备份格式与一致性

普通备份为 `wvn-account-backup-v3`：

- `accounts.pgdump`：官方 `pg_dump --format=custom` 归档，仅包含明确指定的应用 schema。
- `manifest.json`：schema、dump 字节数及 SHA-256、逐表行数与行摘要、私有正文引用和独立账本的字节数与 SHA-256。
- `blobs/<ownerHash>/<sha256>.bin`：当前引用的正文，包括只由分享持有的引用。每个文件最多 32 MiB，复制前后全内容校验大小和 SHA-256。
- `deletions.jsonl`、可选的 `share-revocations.jsonl`：必须来自已经存在的独立账本，备份工具不会创建缺失的源账本。

数据库事务使用 `REPEATABLE READ READ ONLY` 和 `pg_export_snapshot()`；逐表行摘要、正文引用与 `pg_dump --snapshot` 使用同一快照。行摘要通过有界服务端游标计算，包含原账号 ID、profile/revision/generation/head、上传状态、分享、统计及其他 schema 内表的数据。原生归档负责保存表结构、外键、索引、默认值和序列；不通过 SQL 文本替换改 schema。

事务的空闲超时为 35 分钟，数据库备份查询和 `pg_dump` / `pg_restore` 子进程均有 30 分钟边界；失败不生成“完整备份”清单。进程通过 `execFile` 调用，无 shell 拼接。URL 拆解成 `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` 环境变量，密码和 URL 不进入 CLI 参数或操作回执。部署主机需要与数据库兼容的官方 PG 客户端；本次验证使用 PG 18.6。

文件为 `0600`、私有目录为 `0700`，文件写入后 fsync；POSIX 平台额外 fsync 目录。Windows 仍需沿用存档卷既有私有 NTFS ACL，POSIX mode 不能替代 ACL。工具保留 **62 GiB 加待写字节数** 的磁盘阈值，不能为了通过测试去掉它。不要在小型 `/tmp` tmpfs 创建真实备份；使用空间充足的私有数据卷。

普通备份不包含 cookie 签名 secret。原配置必须独立保管，恢复时保持原 origin、RP ID、cookie 名及 secret。split 备份单独包含 secret 文件，仅校验 SHA-256，不输出内容。

即使迁移预建了分享表，空表也不表示已启用分享；检测到分享记录或调用方显式 `sharingEnabled: true` 时必须提供独立分享撤销账本。

## 两阶段恢复

`prepareAccountRestore()` 仅做离线验证和准备：

1. 验证完整清单、归档哈希、`PGDMP` 标头、正文及账本，拒绝缺文件、错误大小、超限、损坏或重复引用。
2. 与当前独立删除账本、分享撤销账本合并。同一 ID 始终保留最大时间，旧备份不能覆盖更新的否定记录。
3. 在新的私有目录复制原生归档及正文，写出合并账本、更新后的清单和可审查的 `restore-plan.json`。

它返回 `status: prepared`，不会连接或写入恢复数据库。

`applyAccountRestore({prepared, database})` 是独立显式操作：

1. 再次验证准备目录和文件，检查目标**整个数据库**的所有非系统表均无记录。其他 schema 有数据也拒绝，不清空已有数据。
2. 通过 `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges --clean --if-exists` 恢复原 schema。`--clean` 只会在前述空库检查通过之后使用，兼容空数据库预建 `public` schema。
3. 逐表核对原计数和行摘要，并将恢复库实际正文引用与文件清单逐项比较，返回 `status: database-restored` 和 `ledgerReplayRequired: true`。
4. 在提供恢复服务之前，使用返回的 `databaseSchema`、`blobRoot`、`deletionLedger`、`shareLedger`，配合独立保管的原 secret 正常启动服务，等待删除与分享撤销账本重放完成，再执行验收。

目标必须是独立空数据库，且导入时保持离线、没有其他进程并发写入。若准备之后源站仍新增删除/撤销，切换前必须重新同步最新独立账本并准备；准备时的账本不能代替激活时的最新账本。导入或核验失败时保留隔离目标供诊断，不自动删库或启用服务。不要先启动应用迁移和初始化目标；dump 已含 schema 和迁移记录。准备阶段和数据库导入通过都不能替代服务启动后的业务验收。准备目录若被后续修改，必须重新校验；不要把正常服务追加的账本目录当作可重复使用的原始恢复包。

## CLI 操作

以下命令应放入该主机既有持久化任务执行器；没有执行器的 Linux 主机使用独立 tmux 会话、私有任务目录、日志和退出码。先确认 `hostname`，连接中断后查原任务状态，不重新投递。私有环境文件用 `0600`，加载后不要打印环境。

普通备份环境包含 `WG_ACCOUNT_DATABASE_URL`（兼容 `WG_ACCOUNT_DATABASE`）、可选 `WG_ACCOUNT_DATABASE_SCHEMA`、`WG_ACCOUNT_BLOBS`、`WG_ACCOUNT_DELETION_LEDGER`、可选 `WG_ACCOUNT_SHARE_LEDGER`、新的 `WG_ACCOUNT_BACKUP_DIR`：

```sh
set -a
. /安全路径/backup.env
set +a
node --import tsx scripts/account-backup.ts backup
```

准备恢复时配置 `WG_ACCOUNT_BACKUP_FROM`、当前独立的 `WG_ACCOUNT_DELETION_LEDGER` / `WG_ACCOUNT_SHARE_LEDGER`、新的 `WG_ACCOUNT_RESTORE_DIR`：

```sh
node --import tsx scripts/account-backup.ts restore
```

审查 `restore-plan.json` 后，在私有环境文件中把 `WG_ACCOUNT_RESTORE_DATABASE` 设为独立空 PG 目标，显式执行：

```sh
node --import tsx scripts/account-backup.ts apply
```

`apply` CLI 不打印数据库 URL。随后正常启动服务并等待账本回放，验收原账号/Passkey、存档字节和历史 ID、删除账号、撤销分享、反应统计。没有明确生产切换授权，不改生产连接或服务。

## Web 与存档主机分离

元数据格式升级为 `wvn-split-metadata-v2`。旧 `backup-split-web.py` 已明确停用：它依赖 SQLite 文件和旧跨主机阻塞恢复协议，不适用于 PG；不会再悄悄停止服务或把文件哈希通过当数据库恢复通过。

Web 主机私有环境：`WG_ACCOUNT_DATABASE_URL`（兼容 `WG_ACCOUNT_DATABASE`）、可选 `WG_ACCOUNT_DATABASE_SCHEMA`、`WG_ACCOUNT_SECRET_FILE`、`WG_ACCOUNT_DELETION_LEDGER`、`WG_ACCOUNT_SHARE_LEDGER`、新的 `WG_SPLIT_STAGE`。在持久化任务中执行：

```sh
node --import tsx scripts/split-account-backup.ts prepare
```

安全传输以下六个文件到存档主机的独立私有 staging 目录，禁止上传公共 CDN：

```text
accounts.pgdump
secret
deletions.jsonl
share-revocations.jsonl
manifest.json
split-manifest.json
```

存档主机创建 `0600` 私有配置（Windows 使用等价私有 ACL），示例路径必须换成实际私有目录：

```json
{
  "stage": "H:/private/stage/backup-unique-id",
  "blobRoot": "H:/private/account-blobs",
  "destination": "H:/private/backups/backup-unique-id",
  "restoreDirectory": "H:/private/restore-check/backup-unique-id"
}
```

通过存档主机已经验证的持久化执行器执行：

```sh
node --import tsx scripts/split-account-backup.ts finalize /安全路径/finalize.json
```

`finalize` 验证元数据和 secret、从私有 BlobStore 合并正文并准备恢复目录，不连接数据库，不要求存档主机安装 PG 客户端。回执是 `files-verified-restore-prepared`、`databaseRestored: false`。

接着把准备目录完整安全复制到可连接独立空 PG 目标的恢复验收主机，用其私有环境执行前述 `account-backup.ts apply`。绝对路径配置须按验收主机重设；然后使用新路径正常启动服务回放账本。数据库恢复证据与 `split-verification.json` 分开记录。不要在 Windows 上临时拼未经验证的后台进程或定时任务来冒充持久化执行器。

## V1 / V2 SQLite 旧归档

旧 `wg-account-backup-v1`、`wg-account-backup-v2` 只能通过显式离线准备入口处理：

```sh
node --import tsx scripts/account-backup.ts legacy-prepare
```

它验证原 SQLite SHA-256 和 `PRAGMA quick_check`、正文，合并当前独立账本并复制到新目录，返回 `legacy-conversion-required`。原 SQLite 源保持不变。不会启动 SQLite 运行时，也不会把 PG URL 当文件路径创建目录。

旧格式不含账本的完整性哈希，工具无法补造当年的来源证明；需保留并独立审查旧账本和当前独立账本。有分享记录的旧归档还必须提供旧分享撤销账本和当前账本。

在独立的空应用 schema 完成当前 PG 表结构初始化后，使用现有离线迁移器；`DATABASE_URL` 从私有环境加载，先执行不带 `--apply` 的核对，再审查后显式导入：

```sh
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /安全路径/prepared/accounts.sqlite --schema 应用schema
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /安全路径/prepared/accounts.sqlite --schema 应用schema --apply
```

最后通过当前 PG 服务重放准备目录中的合并账本，验证删除账号和撤销分享没有复活。迁移源的表/列若不被当前显式迁移器支持，导入会拒绝，应先处理明确的离线映射，不能忽略表或丢弃历史字段。

## 验证范围

专项记录放在 `reports/pg-backups/`。仅在专用 QA 角色和数据库中创建合成账号、独立 schema 及独立物理恢复库；不连接生产，不推送，不删除迁移源。

官方机制参考：[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)。备份来源必须可信；归档哈希校验不等于给不可信 SQL 归档提供安全沙箱。
