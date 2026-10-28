# B2 全桶 SHA-256 命名迁移

用户已确认范围为 `web-visual-novel` 桶内全部公共资源，新对象名为 `{完整 SHA-256}.bin`。本阶段只处理资源身份与 SQLite 原路径映射，应用 API、CF 缓存和生产入口另行处理。

## 数据流

1. 通过 `b2_list_file_names` 固定当前可见对象清单，保存原 Key、大小、MIME、SHA-1 及不可变 `fileId`。不包含已隐藏对象、历史旧版本或未完成的上传。
2. 有已核验的历史 SHA-256 时，先核对历史逐文件校验回执，再绑定冻结清单和不可变 `fileId`，通过只读缓存复用。没有可信缓存时优先读取已有本地副本，以冻结清单中的大小和 SHA-1 验证它对应当前源版本；本地没有对应副本或内容不符时，按 `fileId` 从 B2 流式读取。所有对象名均来自完整字节的 SHA-256，不由 SHA-1 或文件名推导。
3. 相同内容只保留一个目标，调用 `b2_copy_file` 在 B2 内部复制到 `{sha256}.bin`。不调用上传接口，也不把归档重新传到 B2。大文件使用 `b2_start_large_file`、`b2_copy_part`、`b2_finish_large_file` 并核对每段摘要。
4. 目标保留源 MIME 与元数据，额外记录 `wvn-sha256` 和源版本 ID。`.bin` 不表示转码，也不会把 PNG/WASM 的实际类型全部改成 `application/octet-stream`。
5. 复制回执通过大小和内容传输摘要核验后，增量提交 SQLite 原路径映射；失败项记录错误，不创建已就绪映射。重跑时通过源与目标版本 ID 识别已完成项。
6. 处理结束后重新列举哈希目标，逐项核对 SQLite 中记录的目标版本、大小、SHA-1 与 FK 完整性，全部通过才报告 `complete`。这项是云端元数据和服务端复制回执复核，不等同于再次下载全部目标做 SHA-256 回读。

源对象始终保留。对象存储普通的改名采用“服务端复制到新 Key，再删除旧 Key”的方式；本轮只执行复制，旧对象清理需要单独决定，因此过渡期会增加存储占用。

同一份字节被不同原路径解释为不同 MIME 时，SQLite 保留各路径的类型，B2 单个对象只能存一个 `Content-Type`。后续访问 API 需要按路径映射交付相应类型，不能只依赖去重后对象的头部；本阶段尚未切换访问 API。

## 执行

脚本使用 Python、SQLite STRICT 表和 `requests`，默认继承已配置的 HTTPS 代理，没有代理时拒绝执行。只有用户明确授权具体执行机直连 B2 后才使用 `--allow-direct`；该参数仅改变本进程访问 B2 的会话，不修改系统代理。向新增执行机传递敏感配置需要有对应授权，配置文件仅供任务所有者读取，不写入回执、公开日志或仓库。

```sh
python3 scripts/migration/b2-cas.py \
  --inventory /srv/migration/source-inventory.jsonl \
  --database /srv/migration/resources.sqlite \
  --config /srv/private/rclone.conf \
  --remote wvn-b2 \
  --bucket-id '<已核对的桶 ID>' \
  --namespace b2/web-visual-novel/snapshot-20261028 \
  --progress /srv/migration/progress.json \
  --local-roots /srv/migration/local-roots.json \
  --workers 32 \
  --apply
```

`--apply` 显式允许创建云端新对象；命令没有删除选项。`--limit N` 可仅处理清单前 N 项，用于独立数据库中的小批验证。再次运行同一批次必须使用同一份冻结清单，不能在相同命名空间下悄悄更换清单。

本地缓存映射文件格式：

```json
[
  {"prefix":"imports/webgal.moe/2026-10-27/","root":"/srv/webgal/objects"},
  {"prefix":"releases/20261027-01/games/example/","root":"/srv/public-games/example"}
]
```

已有未知 `.bin` 目标必须完整读取并核对 SHA-256 后才能首次复用。SQLite 已核验目标的版本 ID、大小和传输摘要均未变时，可以直接供本轮其他原路径复用。复制写请求响应丢失时先查询目标回执，不盲目重试创建版本。权限或配额拒绝会停止任务，普通文件级失败可以在重跑时补齐。独立数据库旁的锁文件阻止同一任务并发写入。

百万级对象的内存缓存只保留目标 Key、版本 ID、大小和归一化传输摘要，避免把完整云端元数据长时间留在小内存机器中。源内容始终流式处理，不要求磁盘能放下整个桶。

复制阶段按摘要分成 4096 个锁组，减少不同内容在网络请求期间互相等待；相同内容仍由同一把锁保护，避免并发创建重复版本。

## 历史 SHA-256 缓存

`--hash-cache /srv/migration/hash-cache.sqlite` 接受已审核的只读摘要缓存。它是可信输入，构建时必须有完整证据链，不能只依据原路径和大小猜测内容：

1. 原始 SHA-256 来自完整文件字节的历史清单，并有本地源逐文件 SHA-256 校验通过记录。
2. 历史 B2 全量检查逐路径匹配源副本的 SHA-1，检查结果文件的 SHA-256、覆盖路径集合、数量及字节数均与完成回执相符。
3. 冻结对象版本的上传时间不得晚于那次全量检查开始时间；大小、桶和原路径必须一致。之后上传的新版本退回完整读取。该证明沿用 B2 传输 SHA-1 校验边界，不能用于不可信来源或只有目录汇总的旧清单。
4. 缓存最终绑定整个冻结清单的 SHA-256，并逐条记录准确的 `fileId`、原路径、大小、B2 SHA-1 和完整 SHA-256。

缓存包含 `cache_snapshot(inventory_sha256 TEXT, ...)` 和 `source_hashes(file_id TEXT PRIMARY KEY,file_name TEXT,bytes INTEGER,sha1 TEXT,sha256 TEXT)`。迁移脚本以只读方式打开它；冻结清单摘要不符时停止，条目版本、路径、大小或 SHA-1 不符时回退完整读取。大于单次复制上限的对象仍完整计算分段摘要，SSE-C 的现有保护不变。

缓存只省去源内容的重复读取。已有未知 `.bin` 的完整 SHA-256 检查、复制回执检查、SQLite 外键约束和最后的云端复核仍然执行。进度新增 `cachedHashFiles`、`cachedHashBytes` 和 `resumedFiles`，分别区分摘要复用与已完成断点恢复。

已有本地副本也可先计算完整 SHA-256、SHA-1 和字节数，再与冻结版本的传输 SHA-1、大小核对后生成相同格式的绑定。由可信构建器在事务中追加通过核验的行，迁移的只读连接会在后续查询中读取新绑定，无需重启；未命中的文件继续完整读取。不得只使用本地文件的名字、修改时间或大小填充摘要。

收到 `SIGINT` 或 `SIGTERM` 后，脚本停止分配新任务，等待在途任务结束并提交 SQLite，再报告 `paused`；此状态不能视为全量完成。协调器也应在 `paused` 时退出，避免自动拉起任务。

## SQLite

沿用 `resource_objects` 和 `resource_paths` 的摘要、大小、原路径及原 MIME 记录。新增表：

- `b2_cas_sources`：命名空间、原 Key、冻结源版本 ID、摘要、核验状态与错误。
- `b2_cas_locations`：摘要对应的已核验 B2 目标版本 ID 和传输 SHA-1。
- `b2_cas_snapshots`：命名空间对应的冻结清单 SHA-256，防止断点任务混入另一份清单。

SHA-256 用于内容身份和对象命名，B2 的 SHA-1 用于传输回执与源副本一致性检查，两者用途不同。

```sql
SELECT p.original_path, p.sha256 || '.bin' AS object_key,
       p.content_type, o.bytes, l.file_id AS target_file_id
FROM resource_paths p
JOIN resource_objects o ON o.sha256=p.sha256
JOIN b2_cas_locations l ON l.sha256=p.sha256
JOIN b2_cas_sources s ON s.namespace=p.namespace AND s.original_path=p.original_path
WHERE p.namespace='b2/web-visual-novel/snapshot-20261028'
  AND s.status='verified';
```

## 回归

```sh
python3 -m unittest discover -s tests -p b2_cas_test.py -v
node --test tests/resource-cas.test.mjs
```

测试覆盖内容去重、真实 MIME、源版本绑定、旧对象保留、断点恢复、已有目标损坏、复制失败、本地副本失效、整文件与分段摘要、服务端复制协议、丢失响应处理、云端最终缺失/替换检测，以及陌生数据库保护。

当前 23 项专用回归通过，覆盖历史缓存命中、错误版本回退、跨清单拒绝、已有目标损坏、暂停续传、只读缓存追加可见性及断点目标跨路径复用。另有 64 个冻结源版本的 SHA-256 回读、64 项真实缓存复制及目标元数据复核通过；这项小批验收不代表全桶已完成。新执行机仅需保存任务清单、SQLite、摘要缓存和日志，不需要保存整桶资源内容。
