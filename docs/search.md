# PostgreSQL 与 Meilisearch 公开搜索

Meilisearch 是可重建的公开目录投影，PostgreSQL 是事实来源。账号、私人存档、房间、资源存储地址、磁盘路径、报告明细不进入搜索文档。浏览器只访问 WVN 后端，不能接触 Meili master/write key。

## 接线

先执行 `catalogMigrations`，再执行 `searchMigrations`（`004-search-postgres`）。后者在当前 schema 安装 outbox、目录变更触发器，并将已有作品排队；不会改账号迁移。

```ts
import { migrate } from './src/database/migrations.ts';
import { catalogMigrations } from './src/database/catalog.ts';
import { searchMigrations } from './src/search/migrations.ts';
import { MeiliClient } from './src/search/meili.server.ts';
import { createSearchApp } from './src/search/http.server.ts';

await migrate(db, [...catalogMigrations, ...searchMigrations]);
const meili = new MeiliClient({ url: meiliUrl, apiKey: serverSearchKey });
app.route('/', createSearchApp({ db, meili, indexUid: 'wvn_public_works' }));
```

模块均使用 `.server.ts`，只在后端导入。查询服务可使用只允许 `search` 的服务端密钥；索引进程需要索引创建、文档增删、设置、任务读取、交换与删除权限。master key 仅作为隔离测试/初始运维回退，不传到客户端。现有目录和账号服务边界保持不变。

每个 PG schema 配置一个固定的 live index；多个 worker 必须使用同一 `indexUid`。一个 outbox 不支持同时维护多个不同投影；测试使用独立 schema 和随机 `wvn_qa_search_*` 索引。

## 公开 API

`GET /api/search?q=团子&engine=ONS&tag=校园&state=passed&offset=0&limit=20`

参数均可省略；重复参数、未知参数和非法值返回 HTTP 400。

| 参数 | 约束 |
| --- | --- |
| `q` | 去除首尾空白，最多 200 个 UTF-16 字符，不接受控制字符 |
| `engine` | 空、`ONS`、`Artemis`、`RenPy`、`Tyrano` |
| `state` | 空、`passed`、`failed`、`incomplete`、`unchecked` |
| `tag` | 精确标签，最多 100 个 UTF-16 字符，不接受控制字符 |
| `offset` | 原始 Meili 候选偏移，0–10000 |
| `limit` | 1–50，默认 20 |

```json
{
  "ids": ["v4"],
  "offset": 0,
  "limit": 20,
  "nextOffset": null,
  "indexEstimatedTotalHits": 1,
  "filteredOut": 0,
  "source": "meilisearch"
}
```

`ids` 仅包含有已发布版本的公开作品，顺序保留 Meili 相关性。页面按这些 ID 查询公开目录信息，并依次渲染；不要将全量目录原顺序覆盖搜索顺序。文档 ID 始终为 `v数字` 或 `b数字`，编号字段同时包含去前缀作品编号和公开版本编号。

`state` 沿用目录现有语义：作品只要有一个公开版本包含该检查状态，就能匹配；`unchecked` 表示至少一个公开版本没有检查记录。

每页命中均重新查询 PG，检查发布状态以及 engine/tag/state。旧索引里的隐藏作品、旧标签或旧引擎不会通过。过滤后继续取候选，单次请求最多检查 500 个候选；可能得到不足 `limit` 的一页。下一页必须使用返回的 `nextOffset`，不能自行使用 `offset + ids.length`。`nextOffset=null` 表示在 10000 个候选窗口内已无后续候选。

`indexEstimatedTotalHits` 是 Meili 索引估算，可能包含尚未消费的隐藏/旧筛选结果，也受 10000 个候选窗口影响；不能显示成“可见结果总数”。当前响应的可见命中数为 `ids.length`，`filteredOut` 仅描述这次请求剔除的候选数。API 不声称提供 PG 校验后的全量精确总数。

Meili 故障、尚未建立索引、PG 回查失败时返回 HTTP 503：`{"error":"search_unavailable"}`，并设置 `Retry-After: 5` 和 `Cache-Control: no-store`。前端应展示搜索暂不可用，不应把失败转换为空结果。未做静默 SQL 降级。目录基础浏览可以由页面单独提供。

## 事务 outbox 与 worker

`works`、`versions`、`work_metadata` 和 `reports` 的行级触发器在业务事务内写入 `search_outbox`。事务回滚会一起撤销事件。版本改归属对旧、新作品分别排队；报告状态变化会更新 `state`。同作品事件合并为一行，并递增 `generation`。outbox 没有作品外键，因此作品物理删除后仍可删除旧索引文档。

worker 使用 `FOR UPDATE SKIP LOCKED` 领取到期事件，记录 UUID 租约、到期时间与重试次数。真正发送文档前取得同作品 PG advisory transaction lock，并重新读取最新 PG 数据；同作品任务串行，租约过期后被其他进程重领也不会让旧写入覆盖新写入。不同作品可由多个 worker 并发处理。

每次写入、删除和设置请求都等待 Meili task 进入 `succeeded`，HTTP 202 只代表入队。`failed`、`canceled`、网络错误或等待超时均保留事件。失败采用 1 秒起、最高 5 分钟的指数退避；`last_error` 只保存错误代码，不保存可能含凭据的数据。没有自动丢弃或无限期死信；修好服务/数据后会继续重试。

确认事件时同时比较 `generation` 与租约 token；写入索引期间有新修改则保留事件，下一轮重新投影。重复执行 add/replace/delete 均安全。worker 崩溃后，租约到期可继续领取。网络超时可能留下 Meili 已入队任务，因此重试始终生成最新完整文档，不依赖客户端是否收到上次响应。运行中的同作品锁由 PG 连接持有，进程退出后自动释放。

PG 事务只长期持有 advisory 锁，不在等待 Meili 时锁住 outbox 行，避免阻塞正常目录写入。索引进程在该事务内关闭普通 PG 空闲事务超时，Meili 每个 HTTP 请求默认超时 10 秒、task 等待默认 120 秒；锁等待上限 180 秒。服务端终止 PG 连接时本次处理不确认，随后重试。

## CLI 与运行方式

服务器环境需要 `DATABASE_URL`、`MEILISEARCH_URL`、`MEILI_WRITE_KEY`；隔离测试可回退到 `MEILI_MASTER_KEY`。`MEILI_INDEX_UID` 默认 `wvn_public_works`。

```sh
node --import tsx scripts/search-index.ts init
node --import tsx scripts/search-index.ts rebuild
node --import tsx scripts/search-index.ts consume 100
```

`init` 创建索引并安装设置；`rebuild` 全量重建；`consume` 单次领取 1–1000 个事件（默认 100），完成后退出。输出 JSON 汇总；有失败则退出码为 1。生产常驻执行/定时器由服务运维显式接入，需要反复执行 `consume`；仅执行一次并不构成持续同步。

所有索引操作只针对显式配置的 live UID 和该 UID 下的随机 staging UID，不清空 Meili 实例，不修改其他索引设置。

## 全量重建与恢复

重建取得当前 schema/live index 的排他 advisory 锁，等待已经运行的增量处理完成。它在 `liveUID_rebuild_UUID` 独立索引里安装设置、分批写入公开文档，逐个等待 Meili task 成功，并核对文档总数，最后使用原子 `POST /swap-indexes` 交换 live 与 staging。交换成功后删除持有旧数据的 staging 索引。

重建不会确认或清空 outbox。目录在重建期间仍能写入；这些修改留下事件，交换后通过增量消费修正快照。重建完成后至少再执行一次 `consume`，并持续运行 worker。

在交换前失败时，live 仍然可用，失败 staging 保留。交换请求超时或进程中断时，交换是否完成需要通过对应 Meili task 与两个索引状态核查；不要盲目交换第二次，否则会切回旧数据。确认后可以重新运行全量重建，或仅消费 outbox。只删除已确认属于本次任务且不再需要的 `liveUID_rebuild_*` 索引。若交换已成功但旧索引清理失败，live 已是新内容，残留索引可在核实后单独清理。

## 实际专项验证

`tests/search-postgres.test.ts` 使用专用 `wvn_qa` 数据库角色、每测试随机 PG schema，以及本测试随机 Meili 索引。覆盖事务回滚、版本改归属、中文别名、多语言标题、编号、标签/引擎/检查状态筛选、隐藏与陈旧筛选回查、真实异步任务失败、重试及重复消费、竞争消费、租约过期、重建期间写入、分页和故障 503。

专项命令在远程构建机执行：

```sh
node --import tsx --test --test-concurrency=1 tests/search-postgres.test.ts
```

本机不安装依赖、不构建、不运行服务。全项目验收由主任务统一执行，本文的专项结果不代表生产已部署或浏览器验收已完成。

官方接口依据：[异步任务监控](https://www.meilisearch.com/docs/learn/async/asynchronous_operations)、[搜索 API](https://www.meilisearch.com/docs/reference/api/search)、[原子交换索引](https://www.meilisearch.com/docs/reference/api/indexes#swap-indexes)。实现使用 REST，已通过 Context7 核对当前官方文档与任务状态语义。
