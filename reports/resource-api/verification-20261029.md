# 资源子系统专项验证记录

执行主机：`i@100.116.74.36`，远程工具校验 `hostname=localhost`。源码目录 `/home/i/wvn-platform-20261029/source`。任务均通过现有 `remote.py job` 持久化执行，使用本任务隔离 PG/Redis；没有读取或输出私有环境值。

## 红绿验证

| 任务 ID | 结果 | 证据 |
| --- | --- | --- |
| `wvn-platform-20261029-resource-red1` | 退出 1 | 资源表尚未实现，真实 PG 的资源表数量断言得到 0，预期 1；随后测试明确报缺表。 |
| `wvn-platform-20261029-resource-green1` | 退出 0，13/13 | 初始 API、导入和 Redis 真实专项通过，总耗时 1896.92ms。 |
| `wvn-platform-20261029-resource-red2` | 退出 1，11 通过 / 3 失败 | 新增独立校验返回 dry-run 而非 verified；多余目标路径未被拒绝；独立 HTTP 入口尚未实现。 |
| `wvn-platform-20261029-resource-green2` | 资源测试 16/16；任务退出 1 | 16 项真实专项通过，总耗时 2062.89ms；随后 TS7 拒绝指定文件而未传 `--ignoreConfig` 的检查命令（TS5112）。 |
| `wvn-platform-20261029-resource-types1` | 退出 0 | 修正命令，加 `--ignoreConfig` 后资源范围类型检查通过。 |

最终专项命令：

```sh
node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/resource-api.test.ts tests/resource-api-import.test.ts tests/resource-api-cache.test.ts

node_modules/.bin/tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler \
  --target ES2023 --lib es2023,dom --types node --allowImportingTsExtensions --strict --skipLibCheck \
  src/resources/*.ts scripts/migration/import-resources.ts tests/resource-api*.test.ts
```

## 已证明的行为

- 真 PG schema 中幂等迁移，UUID 逻辑 key、固定完整 SHA-256 地址、路径级不同 MIME、原路径服务端查询、未知 key 404、参数严格校验。
- 批量请求最多 100 项、明确 missing、请求正文有界；清单按 namespace/冻结版本限定，最多 500 项，使用绑定版本的 keyset 游标。
- 只读 SQLite 源文件导入前后字节摘要不变；只接受 verified 一致映射；源/目标 B2 版本与 SHA-1 审计保留。
- 真实对象字节数冲突不会被忽略，失败运行有错误代码/路径，已提交批次有检查点；修复冲突后保留已生成 UUID 并继续导入。
- 未完成导入不经 API 发布；发布前对全部 PG 路径元数据重新计算 canonical 摘要；独立 verify 检出损坏审计字段和多余路径。
- 真实 Redis 命中在 PG 已关闭时仍能返回资源；缓存值不含 URL、源版本或密钥，TTL 有界。Redis 连接失败与真实 TCP 握手卡住均在硬超时后回源 PG，没有无限离线队列或重连。
- 独立资源服务在回环端口提供真实 HTTP 资源请求和 PG health 检查。

PG fixture 为每项测试创建随机 schema，且限制专用 `wvn_qa` 数据库/角色；Redis 只清理随机测试前缀。未运行账号/目录/RTC 等其他子系统的测试，最终全套集成由主任务执行。

## 首轮专项之后补跑的验收

首轮 16 项专项时尚未取得正式 `resources.sqlite`。随后在主任务授权并提供临时只读下载票据后，已完成公共索引下载和双摘要核验，并在专用 `wvn_qa.resource_full_20261029` 完成 1,420,065 条路径的 dry-run / apply / 独立 verify 和真实 API/Redis 探测。最新结果见 [全量演练记录](full-rehearsal-20261029.md)、[结构化回执](full-rehearsal.json)。

本子任务未修改 B2/Cloudflare/生产配置，未上传或删除 B2 对象。生产 `wg-b2.saop.cc` CORS 是单独的待办；API URL 和元数据测试不构成浏览器跨域或播放器验收。
