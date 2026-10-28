# PG 备份专项验证回执（2026-10-29）

范围：账号及私有存档元数据、独立删除/分享撤销账本、原生 PG 归档、分离存储的文件合并、旧 SQLite V1/V2 离线准备及转换。只在专用 `wvn_qa` 账号/数据库的独立 schema 和本测试创建的 `wvn_restore_<uuid>` 物理库运行；未触碰生产、未推送、未删除旧 SQLite 或 B2 对象。

执行主机：`i@100.116.74.36`，核验 `hostname=localhost`，源码 `/home/i/wvn-platform-20261029/source`。所有远程长命令均通过已有 `run-job.py` 持久化至独立 tmux 任务，记录日志和退出码；使用源码下 `state/` 的真实磁盘，未在 26 GiB `/tmp` tmpfs 创建真实备份。

最终任务：`wvn-platform-20261029-backup-final-02`，开始 `2026-10-28T21:15:33Z`，完成 `2026-10-28T21:15:50Z`，退出码 **0**。本专项所有任务均已结束，交回整仓验证时没有遗留活动重任务。

环境版本见 `versions.txt`：Node 24.19.0；官方 pg_dump/pg_restore 18.6；服务器 PostgreSQL 18.6 Alpine。客户端参数不带数据库 URL 或密码，回执不含 secret。

## 最终检查

```sh
node node_modules/typescript/bin/tsc -p reports/pg-backups/tsconfig.json
node --import tsx --test --test-concurrency=1 tests/backup-postgres.test.ts tests/account-backup.test.ts tests/account-share-backup.test.ts tests/split-backup.test.ts tests/account-deletion.test.ts tests/work-stats-http.test.ts
```

备份专项严格类型检查退出 **0**，输出见空的 `typecheck.txt`。专项 **18/18 通过**，无失败/跳过，完整输出见 `tests.txt`。未代替主代理执行整仓测试、生产构建、浏览器验收或生产恢复。

覆盖：

- `pg_dump --format=custom` 真归档，`PGDMP` 标头与文件 `0600`，指定 schema 之外没有混入其他 QA 数据。
- `pg_restore` 真还原到新物理库，逐表计数/全行摘要、原账号 ID 和 bigserial 序列一致；已有数据的目标拒绝重放且数据保留。
- 原生空库预建 `public` schema、带双引号的表名、JSONB 和 bytea 均正常。
- 导出快照后另一连接提交新账号；源库变成两行，归档、证明和恢复目标仍一致为快照中的一行。
- 现有私人存档字节、历史 revision、profile/generation/head 由全表摘要核验；share-only 引用没有漏备份。
- 新独立删除账本阻止旧快照复活账号、其私人存档和反应统计；新分享撤销账本阻止旧快照复活分享和分享引用。
- 同 ID 最大否定时间合并；缺失/格式错误/篡改账本和 dump、缺少独立分享账本均拒绝。
- 对 dangling 私有引用拒绝生成完整备份；恢复后实际引用与 manifest.files 逐项比较，清单意外删文件时拒绝验收。
- split 备份保存并核验 secret，文件合并只报 `files-verified-restore-prepared`；用另一步真实 PG apply 核验数据库历史和分享。
- 旧 V1/V2 归档显式离线准备后接现有 `importSqlite` 导入真实 PG，保留原 ID、原 SQLite SHA-256，并在服务启动时重放新删除账本。

## 红测证据与决定

- `backup-red-01`：新显式 apply 导出不存在，测试先失败，再实现原生 PG 接口。
- `backup-edges-red-01`：dangling wg_save_refs 被旧 join 静默省略，观察到 `Missing expected rejection`；改成显式拒绝。
- `backup-guard-red-01`：`LIKE 'pg_%'` 的 `_` 通配符误排除了 `pgx_private` 等用户 schema，空库检查遗漏真实行；观察失败后改用系统保留前缀正则 `^pg_`。`backup-edges-green-01` 三项全部通过。
- `backup-reference-red-01`：清单删去文件引用但保留原 dump，旧 apply 会报成功；观察失败后加入恢复事务中的数据库引用对照。最终用例通过。
- 审查删除回放时发现 `deleteOwner` 迁为 async 后未等待，已通知主代理修复。本专项补“删除账号自身也有存档”断言并验证四组存档元数据均已移除。
- 决定：旧跨主机 Python 编排失败即停止，并给出中文替代命令。原脚本依赖 SQLite、阻塞 SSH 和旧自动恢复协议；未经验证的 Windows 后台任务不能冒充持久化执行器。主代理已确认此处理。
- 决定：POSIX 额外 fsync 目录，Windows 仅 fsync 文件并沿用存储卷的私有 ACL；不调用 Windows 不支持的目录文件描述符 fsync。
- 决定：恢复校验不通过时保留独立失败目标供诊断，不自动删库或清洗数据，不启用服务。

## 边界

普通备份不带原 cookie 签名 secret，需独立保管原配置。旧 V1/V2 格式没有账本哈希，不能补造当年的真实性证明；旧表/字段必须由现有离线迁移器显式支持。分离存储未执行真实 Windows 跨机备份，验收是 Linux 隔离模拟存储卷加真实 PG 客户端/服务器。未安装工具、未创建 Windows 调度任务、未操作生产。

恢复目标必须保持离线且没有并发写入。若准备后源站又新增删除/撤销，切换前必须重新同步最新独立账本并准备，不能把准备时的账本当作永远最新。恢复服务必须等待账本回放完成后才开放访问。
