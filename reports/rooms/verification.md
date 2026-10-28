# 房间专项验证回执

日期：2026-10-29（Asia/Shanghai）。主机：`localhost`，任务目录 `/home/i/wvn-platform-20261029`。本机仅编辑、同步和 Git 操作；安装、编译、类型检查与浏览器全部在远程独立任务中运行。

## RED → GREEN

| 范围 | RED 任务 | 有效失败 | GREEN 任务 |
|---|---|---|---|
| 房间PG/WS | `wvn-platform-20261029-rooms-red-01` | 缺失路由返回404，鉴权断言要求401 | `wvn-platform-20261029-rooms-green-01`，2/2 |
| 浏览器SDK | `wvn-platform-20261029-rooms-sdk-red-01` | `Room transport not implemented` | `wvn-platform-20261029-rooms-sdk-green-01`，1/1 |
| 真实WT网关 | `wvn-platform-20261029-rooms-browser-red-01` | 两客户端实际WS，断言要求WT | `wvn-platform-20261029-rooms-browser-green-04` |

最终 Node 专项：`wvn-platform-20261029-rooms-final-01` 的 `node --import tsx --test tests/rooms.test.ts tests/rooms-sdk.test.ts` 已 4/4、零失败；之后类型检查第一次因 TypeScript 7 需显式 `--ignoreConfig` 而中止，没有误记为整体通过。

最终验收任务：`wvn-platform-20261029-rooms-final-02`，`exit-code=0`，2026-10-28T21:08:02Z–21:08:09Z。依次执行：

1. 仅房间源文件、测试和QA入口的严格 TypeScript 检查（`tsc --ignoreConfig --noEmit --strict ...`）通过。
2. Go `gofmt`、`go test ./...`、`go build` 通过。
3. `bash scripts/room-qa-run.sh` 实际双浏览器验收通过，回执见 `browser-connectivity.json`。

主任务统一执行最终整库 typecheck、全套测试、构建与账号接线后的浏览器回归，本专项没有把限定检查当成整仓通过。

## 实际连通

- WT双端真实 `transport=webtransport`，可靠QUIC双向流同步PG权威状态（seq=3）。
- 两客户端的真实QUIC数据报 `ping` 经过Node现有房间鉴权/限流后回到浏览器 `pong`，不是独立echo端点。
- 强制 `iceTransportPolicy=relay`：选中candidate为 `relay/relay`、UDP，DataChannel临时JSON数据在两浏览器间送达。
- WS兼容链路：选中candidate为 `host/host`，真实DataChannel数据送达。
- 浏览器实际尝试未监听的QUIC端口28449，得到预期网络错误后，重新取票并回退WS；权威状态同步仍通过。日志中的这两条QUIC错误属于故障注入预期。

中途修复了真实验收发现的HTTP/3 TLS ALPN配置缺失，以及coturn镜像文件capability与128核宿主下认证线程配额；最后一次运行没有使用早期失败的配置。

## 隔离与边界

- 只监听 `127.0.0.1`；Node 28439、HTTPS 28444、WT UDP28443、TURN 28440、relay 28450–28469。
- PG随机测试schema、Redis随机前缀；测试仅清理自身schema/前缀，不执行FLUSHALL。
- TURN secret在任务 `private/rooms.env`（0600），临时证书私钥在同一私有目录；均未提交、未打印。
- Go1.27.3经官方SHA256校验，安装仅在任务tools。coturn4.6.3镜像摘要 `sha256:71c3c990283385567f11794ee692e3a47b66fd9b0bb39e42afbe776e331dd888`。
- QA启动脚本退出后停止并删除自身TURN容器，关闭Node/Go进程，并清理自身PG schema与Redis keys。
- 所有证据为同机回环：未验证公网NAT、跨设备、不同运营商/移动网络、生产可信证书或完整游戏剧情同步。未推送、未部署生产、未改DNS/Cloudflare/CDN/防火墙。
