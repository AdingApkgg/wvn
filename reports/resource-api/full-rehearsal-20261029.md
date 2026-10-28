# 正式公共索引的全量隔离演练

2026-10-29（北京时间）在专用构建机 `i@100.116.74.36`、`hostname=localhost` 执行。数据库仅使用专用 `wvn_qa` 角色/数据库，目标 schema 为 `resource_full_20261029`；namespace 为 `b2/web-visual-novel/snapshot-20261028`。

## 下载与只读源

任务 `wvn-platform-20261029-resource-full-download1` 于 `2026-10-28T21:23:27Z` 退出 0。代理采用构建机既有 11090 配置，HTTPS 校验票据提供的固定 CA，并核对响应 ETag。私有票据、认证头及证书内容未输出到日志或取回本机。

| 项目 | 实际结果 |
| --- | --- |
| gzip 大小 | 385,580,112 字节 |
| gzip SHA-256 | `663440a08172ae298c52c11444ba1040ddc3f702796dbf44d18da919a598fb1b` |
| SQLite 大小 | 1,786,675,200 字节 |
| SQLite SHA-256 | `2a04ee201a45363d073eb09f80c0d6ac93089ceeb0b90a5ca850084a18e0e7ee` |
| 下载/摘要核验 | 724.589 秒 |
| 解压/摘要核验 | 19.497 秒 |
| 总耗时 | 744.332 秒 |
| 临时服务完成回执 | 同源带认证 `POST /complete` 返回 204 |

原始 gzip、SQLite 留在构建机 `/home/i/wvn-platform-20261029/data/`，文件权限均为 0600。实际传输一次连续完成；脚本支持绑定 ETag 的 `.partial` / Range 恢复，此次未触发恢复。下载回执为 [full-download.json](full-download.json)。

## 全量 PG 导入和独立校验

任务 `wvn-platform-20261029-resource-full-rehearsal1` 于 `2026-10-28T21:31:50Z` 退出 0，总耗时 459.118 秒。

| 阶段 | 耗时 | 实际结果 |
| --- | --- | --- |
| 真实源统计 | 包含在总耗时中 | 1,420,065 路径、1,067,041 内容对象、239,205,984,120 逻辑字节、错误回执 0 |
| dry-run | 43.759 秒 | 全部 verified 映射一致，计划新增 1,420,065 路径 |
| apply | 322.336 秒 | 1421 批全部提交，新增 1,420,065，恢复跳过 0 |
| 独立 verify | 77.464 秒 | 再次完整读取源与 PG，摘要与数量一致，无额外目标路径 |
| 目标数量/唯一性 | 9.482 秒 | 1,420,065 唯一 UUID、1,067,041 对象，processed=total，published=true |
| 真实 HTTP/Redis | 0.150 秒 | 以下接口与缓存检查全部通过 |

导入 run ID：`2873e3a4-7404-4bc5-8ee3-c0e4d1016b38`。

- 冻结清单摘要：`fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01`。
- canonical 元数据摘要：`051416cf585d8241a35996811f093b7c24064b74b98a5b0feb39934d80f572bd`。
- dry-run、apply、verify 三次读取到的 SQLite 文件摘要都与下载回执一致。
- 全部批次落盘时 `published` 仍为 false；首次完整 PG 元数据摘要通过后才设为 true。此发布状态仅属于上述隔离 QA schema。

完整结构化回执为 [full-rehearsal.json](full-rehearsal.json)。

最后的只读审计任务 `wvn-platform-20261029-resource-full-final-audit1` 退出 0，独立确认数据库身份确为 `wvn_qa` / `wvn_qa` / `resource_full_20261029`，仅有上述一条成功导入记录，`error_code` 与 `error_path` 均为 NULL；两个源文件的实际大小和 0600 权限再次通过。回执为 [full-final-audit.json](full-final-audit.json)。

## 真实资源 API 与 Redis

独立服务临时监听构建机 `127.0.0.1:4270`，完成探测后已关闭，不保留占用端口的服务。

- 实际资源 UUID 的 GET 返回 200，URL 是固定域名与完整小写 SHA-256 `.bin`，MIME 与 PG 原记录一致。
- 按完整原路径查询得到相同 UUID。实际原名包含 `imports/webgal.moe/2026-10-27/...` 前缀，接入者不能省略它。
- 批量查询找到 2 项并明确返回 1 项 missing；两页 manifest 都返回 2 项且无重复；未知 UUID 404、非法 key 400、真实 PG health 200。
- Redis 实际写入 TTL=300 秒的元数据，值中不含 URL；PG 连接池关闭时仍命中相同资源缓存。
- Redis 不可用时实际 PG 回源耗时 22.493ms。测试键使用随机隔离前缀并自然过期，没有清空 Redis。

样例 key `97731e2b-6a25-43fa-822d-d82f7be0e5d6` 对应 `imports/webgal.moe/2026-10-27/cdn/Cherry-Petals-Fall-Like-Teardrops/artemis.data`。更多样例在结构化回执中。

## 接续使用与边界

程序必须使用 `WVN_TEST_DATABASE_URL` 加 `schema='resource_full_20261029'` 才能读取这批已验收数据；其他 schema 的资源表不会自动拥有这些 UUID 或映射。接续独立服务可运行：

```sh
DATABASE_URL="$WVN_TEST_DATABASE_URL" \
RESOURCE_DATABASE_SCHEMA=resource_full_20261029 RESOURCE_HOST=127.0.0.1 RESOURCE_PORT=4270 \
node_modules/.bin/tsx src/resources/server.ts
```

服务须沿用项目现有持久化任务启动规则。数据库和源 SQLite 均保留。此次没有上传、复制或删除 B2 对象，没有修改 B2/Cloudflare/生产配置，没有将生产站切换到这个 schema。生产 CORS 和播放器浏览器验收仍是独立工作。
