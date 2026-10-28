# SHA-256 对象命名与 SQLite 原路径索引

本阶段只处理公共资源的命名和映射记录。采用完整文件内容的 SHA-256，生成 64 个小写十六进制字符加 `.bin` 后缀的对象名，不转码。原相对路径保存在独立 SQLite 数据库中。

脚本保留源文件，在独立目录生成新命名的对象；同内容只保留一个对象。例如：

```text
源目录：/srv/public-games/example-v1/
  background/title.png
  voice/001.ogg

对象目录：/srv/cas-objects/
  <title.png 的完整 SHA-256>.bin
  <001.ogg 的完整 SHA-256>.bin

未来上传的目标：s3://web-visual-novel/<完整 SHA-256>.bin
```

本命令不上传 B2/R2，不重命名已有远程对象，不改数据库 API、CF 缓存规则、播放器或生产配置。输出目录可以在后续阶段原样上传到桶根。

## 执行

要求 Node.js 24，使用内置 `node:sqlite`，无须安装额外依赖。计算整批文件摘要和批量生成对象需要在构建机执行。

先预演：

```sh
node scripts/migration/resource-cas.mjs \
  --source /srv/public-games/example-v1 \
  --objects /srv/cas-objects \
  --database /srv/resource-index/resources.sqlite \
  --namespace example/v1
```

预演只读取源文件、计算完整摘要、统计文件数量与去重后大小，不创建数据库和对象目录，也不校验远程已有对象。正式写入时增加 `--apply`：

```sh
node scripts/migration/resource-cas.mjs \
  --source /srv/public-games/example-v1 \
  --objects /srv/cas-objects \
  --database /srv/resource-index/resources.sqlite \
  --namespace example/v1 \
  --apply
```

`--namespace` 标识游戏版本或一次导入批次。同一个对象库和映射库可以重复接收不同命名空间，跨命名空间相同内容也会去重。不要将账号数据库、作品目录数据库作为 `--database`，脚本会拒绝已有的其他格式数据库。

标准输出是一份 JSON 汇总；大批量处理时，进度写到标准错误。`files`、`sourceBytes` 是本次源文件数量和总字节数，`uniqueObjects`、`uniqueBytes` 是本次内容去重后的数量和大小；`writtenObjects` 是本次新生成的对象数，`reusedObjects` 是本次重新核验并复用的既有唯一对象数。预演模式下后两个值为 0。

## SQLite 记录

```sql
-- 内容身份。对象 Key 由 sha256 加固定后缀 .bin 得到，不另存重复字段。
resource_objects(
  sha256 TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL
)

-- 逻辑路径身份。原文件名保留在 original_path 中。
resource_paths(
  namespace TEXT,
  original_path TEXT,
  sha256 TEXT REFERENCES resource_objects(sha256),
  content_type TEXT NOT NULL,
  PRIMARY KEY(namespace, original_path)
)
```

实际 DDL 使用 STRICT 表、SHA-256 格式与文件大小 CHECK、外键，以及哈希反查索引。`sha256` 列只保存摘要，不含 `.bin`。MIME 根据原扩展名记录，未知类型记作 `application/octet-stream`，不根据统一的 `.bin` 对象名猜测。

查找一个原路径对应的对象：

```sql
SELECT p.namespace, p.original_path, p.sha256 || '.bin' AS object_key,
       o.bytes, p.content_type
FROM resource_paths p
JOIN resource_objects o ON o.sha256 = p.sha256
WHERE p.namespace = 'example/v1'
  AND p.original_path = 'background/title.png';
```

## 重复执行和失败恢复

- 每个文件流式读取，不整包放入内存；哈希和输出来自同一次读取，并检查读取前后的文件状态。
- 同批相同内容去重；已有目标重新核验完整 SHA-256 和大小，校验失败会停止，不覆盖。
- 同一命名空间、同一原路径已对应不同内容时停止。更新资源应使用新的命名空间，旧记录保持不变；重跑不会删除源目录中已经消失的历史路径。
- 每批映射在一个事务内提交；失败则回滚本批数据库修改。文件系统与 SQLite 不是一个跨系统事务：失败前已生成的合法哈希对象可能保留，重跑会核验并复用。
- 进程正常结束会清理本轮暂存目录。异常断电或强制终止可能留下 `.sha256-*` 目录，后续上传对象时只应选取匹配 `^[0-9a-f]{64}\.bin$` 的文件名。
- 输出目录和源目录不能重叠，数据库不得放在任一资源目录内；符号链接和非普通文件会被拒绝。源目录只应指向明确选择的公共资源，脚本不负责判断文件是否可公开。

## 已验证范围

构建机 `localhost-1.tailac9c6f.ts.net`，实际 hostname `localhost`，Node.js v24.19.0：

```sh
node --test tests/resource-cas.test.mjs
```

专用测试覆盖预演无写入、完整摘要加 `.bin` 命名、空文件、中文路径、相同内容不同扩展名、同名不同内容、跨命名空间去重、幂等重跑、跨读取块的二进制完整性、源文件变化不影响对象、已有对象损坏、映射事务回滚、路径隔离、符号链接拒绝、SQLite 约束和其他数据库保护。
