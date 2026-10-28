# B2 全桶 SHA-256 命名迁移

用户已确认范围为 `web-visual-novel` 桶内全部公共资源，新对象名为 `{完整 SHA-256}.bin`。本阶段只处理资源身份与 SQLite 原路径映射，应用 API、CF 缓存和生产入口另行处理。

## 数据流

1. 通过 `b2_list_file_names` 固定当前可见对象清单，保存原 Key、大小、MIME、SHA-1 及不可变 `fileId`。不包含已隐藏对象、历史旧版本或未完成的上传。
2. 优先读取已有本地副本，以冻结清单中的大小和 SHA-1 验证它对应当前源版本；本地没有对应副本或内容不符时，按 `fileId` 从 B2 流式读取。所有对象名均来自完整字节的 SHA-256，不由 SHA-1 或文件名推导。
3. 相同内容只保留一个目标，调用 `b2_copy_file` 在 B2 内部复制到 `{sha256}.bin`。不调用上传接口，也不把归档重新传到 B2。大文件使用 `b2_start_large_file`、`b2_copy_part`、`b2_finish_large_file` 并核对每段摘要。
4. 目标保留源 MIME 与元数据，额外记录 `wvn-sha256` 和源版本 ID。`.bin` 不表示转码，也不会把 PNG/WASM 的实际类型全部改成 `application/octet-stream`。
5. 复制回执通过大小和内容传输摘要核验后，增量提交 SQLite 原路径映射；失败项记录错误，不创建已就绪映射。重跑时通过源与目标版本 ID 识别已完成项。
6. 处理结束后重新列举哈希目标，逐项核对 SQLite 中记录的目标版本、大小、SHA-1 与 FK 完整性，全部通过才报告 `complete`。这项是云端元数据和服务端复制回执复核，不等同于再次下载全部目标做 SHA-256 回读。

源对象始终保留。对象存储普通的改名采用“服务端复制到新 Key，再删除旧 Key”的方式；本轮只执行复制，旧对象清理需要单独决定，因此过渡期会增加存储占用。

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

已有 `.bin` 目标必须完整读取并核对 SHA-256 后才能首次复用。复制写请求响应丢失时先查询目标回执，不盲目重试创建版本。权限或配额拒绝会停止任务，普通文件级失败可以在重跑时补齐。独立数据库旁的锁文件阻止同一任务并发写入。

百万级对象的内存缓存只保留目标 Key、版本 ID、大小和归一化传输摘要，避免把完整云端元数据长时间留在小内存机器中。源内容始终流式处理，不要求磁盘能放下整个桶。

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

当前专用回归 15 项通过；另有 20 个真实小资源的服务端复制与云端元数据复核通过。新执行机仅需保存任务清单、SQLite 和日志，不需要保存整桶资源内容。
