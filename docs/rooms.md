# WVN 房间连接基础

生产的房间 HTTP / WS 和 SDK 已于 2026-10-29 上线；公网 TURN / WT 及游戏联机界面仍为后续步骤。详情见 [生产切换记录](production-platform-20261029.md)。

本轮实现创建、加入、退出、关闭与踢出房间；房主发布服务端权威状态，成员以定向 offer / answer / ICE 建立 WebRTC DataChannel。没有游戏剧情同步界面，也没有让已有游戏自动具备联机能力。SDK 不索取摄像头或麦克风。

## 接入现有账号服务

`src/rooms/index.ts` 导出 `roomMigrations`（`005-rooms-postgres`）、`mountRooms(app, options)`、`RoomActor`。先把迁移加入现有 PG 迁移列表，再在账号 Hono app 挂载路由，并将返回对象的 `attachWebSocket(server)` 接到实际 HTTP / HTTPS Server；退出时调用 `close()`。`handler` 就是传入的 Hono app，不需要再套一次 `/api/rooms` 路径。

```ts
const rooms = mountRooms(accountApp, {
  db, redis, origin: accountPublicOrigin,
  authenticate: async c => {
    // 必须使用现有登录 cookie 与 x-wg-binding 验证后的身份。
    const player = await accountService.player(c);
    return player ? { userId: player.userId, sessionId: player.sessionId,
      displayName: player.displayName, authVersion: player.authVersion } : null;
  },
  isSessionActive: async actor => {
    // 查PG：会话存在、未过期/撤销，账号未删，authVersion仍有效。
    return checkExistingPlayerSession(actor);
  },
  isPublishedVersion: async id => checkPublishedCatalogVersion(id),
  turnUrls: ['turn:turn.example.invalid:3478?transport=udp',
    'turns:turn.example.invalid:5349?transport=tcp'],
  turnSecret: process.env.ROOMS_TURN_SECRET,
  webTransportUrl: process.env.ROOMS_WEBTRANSPORT_URL,
});
rooms.attachWebSocket(server);
```

示例的账号字段需要按既有 `player(c)` 返回类型映射；本模块不读取任何信任用户 ID 的请求头。测试通过注入 `authenticate` 回调提供身份。`redis` 使用已连接的 node-redis 客户端。`redisPrefix` 可隔离不同环境，默认 `wvn:rooms:`；`sessionCheckMs` 默认 1000ms。

登录状态在 REST、票据消费、每条 WS 消息与周期检查时重验。会话退出后，旧 ticket 无法建立连接，已连接 socket 会被关闭。踢出是该房间永久禁止重新加入；本轮没有解除踢出入口。房主退出须先关闭房间。

## REST

统一前缀 `/api/rooms`。写请求必须携带与配置完全一致的 `Origin`，以及现有账号认证与绑定。JSON 请求体上限 16KiB。接口统一返回 `{error: code}`，鉴权失败 401、越权 403、冲突/满员 409、房间已关闭 410、限流 429、依赖不可用 503。

| 方法与路径 | 请求 | 结果 |
|---|---|---|
| `POST /api/rooms` | `{versionId}` | 201；房主自动加入，返回快照 |
| `GET /:id` | — | 有效成员读取快照 |
| `POST /:id/join` | — | 加入并返回快照，最多 8 人 |
| `POST /:id/leave` | — | 非房主退出 |
| `POST /:id/close` | — | 房主关闭，重复关闭幂等 |
| `POST /:id/kick` | `{userId}` | 房主踢出其他成员 |
| `GET /:id/sync?after=N` | — | 快照、事件页、`cursor` 与 `head` |
| `POST /:id/events` | `{id,kind,data,target?}` | 服务端分配序号并返回事件 |
| `POST /:id/ticket` | — | 30 秒一次性 ticket、WS 路径、可选 WT URL |
| `POST /:id/turn` | — | 600 秒 TURN REST 临时凭据 |

快照包含 `id / ownerUserId / versionId / status / seq / state / stateSeq / members`。事件包含 `seq / id / actor / kind / target / data`。`kind=state` 只允许房主提交、更新 PG 快照；`offer / answer / ice` 必须指向同房有效成员，内容只对发送方与接收方可见。状态/信令内容最大 10KiB。同一个成员在同房重复提交同一 message ID 和相同内容，返回同一事件；内容不同返回 409。服务器成员事件使用 `room.created / member.joined / member.left / member.kicked / room.closed`。

每页最多检查 16 条全局事件；定向私有事件会被过滤，所以可见序号允许有间隔，客户端应使用服务器 `cursor` 继续请求直到 `cursor===head`，不能自行推断缺失权限。快照与事件页持有同一 PG 房间行锁，避免成员/序号错配。完整历史目前保留在 PG；投入长期运营前需要独立制定留存与归档策略。

## WS 与 WebTransport 协议

`/api/rooms/ws` 只允许精确 Origin、无 query 的升级。先经受鉴权 POST 取得 ticket，再以首条文本消息发送，ticket 不进入 URL：

```json
{"type":"auth","ticket":"一次性票据","after":0}
```

Redis `GETDEL` 原子消费票据；重放失败。服务器返回 `{type:"ready",userId,snapshot,events,cursor,head}`，随后以 `{type:"event",event}` 推送持久化事件。客户端可发 `{type:"event",event:{id,kind,data,target?}}`，服务器返回 `{type:"ack",id,event}`；或发 `{type:"sync",after}`、`{type:"ping"}`。错误返回 `{type:"error",code}` 并关闭连接。

每连接认证窗口 3 秒、输入帧 16KiB、待处理消息队列 32 条、发送背压阈值 256KiB。每进程最多 128 条连接（包括待升级连接），每会话 Redis 在线租约最多 4 条连接；会话消息和升级入口均有限流。PG 行锁与唯一约束负责跨进程序号、成员上限和幂等；进程 Map 只保存当前传输连接。Redis PubSub 只唤醒同步，丢通知后周期查询 PG 补历史，PubSub 不承担事件保存。

Redis 限流、票据或 presence 不可用时明确拒绝并关闭相关连接，不凭缓存缺失放行。PG 会话/成员查询失败也拒绝。Redis presence 是连接租约，不是房间权限来源。

`services/webtransport` 是真实 Go HTTP/3 / QUIC 网关（webtransport-go v0.13.0、quic-go v0.62.0），将一条双向换行 JSON 流转成固定受控上游 WS。它转发原票据，复用 Node 的会话、成员、速率、序号与历史，没有第二套房间权威。网关不接收用户指定上游地址；URL query、额外双向流、单向流均拒绝。会话数 128，首次流等待 3 秒、帧 16KiB、读写超时与清理有界，单会话最长 15 分钟后允许 SDK 重连。

QUIC 数据报只支持认证后的 `{type:"ping"}`，仍由 Node 检查会话/成员/速率后返回数据报 `pong`；不承载权威状态或任意用户数据。网关限制数据报 1200 字节和每秒 16 条。可靠的状态与信令走双向流。

## 浏览器 SDK

```js
import { RoomClient } from '/player/room-client.mjs';
const room = new RoomClient({ roomId,
  // baseUrl 指向账号服务；同源时可以省略。
  baseUrl: location.origin,
  headers: () => ({ 'x-wg-binding': currentBinding }),
});
room.addEventListener('event', e => applyServerSequencedEvent(e.detail));
room.addEventListener('peerdata', e => showEphemeralPeerData(e.detail));
await room.connect();
await room.publishState({ chapter: 3 }); // 仅房主
await room.openPeer(otherMemberUserId);
room.sendPeer(otherMemberUserId, { cursor: [0.3, 0.8] });
```

SDK 先探测 WebTransport；不支持、握手失败或超时后重新申请 ticket 并回退 WS。网络断开采用有上限的退避，重连附带已见序号；失效会话错误不会无限重连。`close()` 停止自动重连并关闭 peer。声明在 `room-client.d.mts`。

WebRTC 是浏览器之间的临时数据通道，TURN 负责无法直连时中继；WebTransport 是浏览器到服务端的传输，两者可同时使用。P2P 包最大 4KiB、无序、允许丢失，`peerdata.detail.authoritative` 永远为 `false`，不能用于决定账号权限或取代 PG 权威状态。`openPeer(...,{relayOnly:true})` 与客户端 `relayOnly:true` 可用于强制 TURN 验收。SDK 不主动请求媒体设备。

## TURN 与未来公网入口

TURN 凭据只向有效房间成员签发，格式为 `expiry:opaque-user-room-hash`，密码为 `Base64(HMAC-SHA1(secret,username))`，静态 secret 只留在 Node 与 coturn 私有配置。600 秒到期由 coturn 拒绝；已签发凭据不能逐个即时撤回，退出/踢出会立即阻止后续签发与房间信令。

生产模板是 `ops/platform/realtime/turnserver.production.conf.example`：不允许匿名、中继配额/带宽受限，禁止回环、私网、链路本地、保留地址及 IPv4-mapped IPv6 peer，关闭 TCP relay 与管理 CLI；TLS 证书/私钥通过受限文件挂载。不能把 `turnserver.qa.conf` 搬到生产：只有回环隔离测试才启用 `allow-loopback-peers`。

公网部署需要另行授权与验收：WT 独立域名、可信证书与 UDP 443（或指定 QUIC 端口）；TURN 独立域名、UDP/TCP 3478、TLS TCP 5349 及受控 relay UDP 范围，NAT 外网映射须逐端口保持对应。Node WS 继续使用现有账号 HTTPS 域名。当前模板默认监听回环，未开放公网，也没有修改现有 CDN、DNS、防火墙或 Cloudflare。

[Cloudflare 官方 HTTP/3 文档](https://developers.cloudflare.com/speed/optimization/protocol/http3/) 当前明确不支持 HTTP/3 回源，因此普通橙云不能承载此 WT 源站连接；独立入口规划不得改动 `wg-b2.saop.cc`。实现参考：[webtransport-go](https://github.com/quic-go/webtransport-go)、[coturn 官方配置](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf)、[Chrome WebTransport 语义](https://developer.chrome.com/docs/capabilities/web-apis/webtransport)。

## 已验证与未验证

远程主机 `localhost` 的任务独占 QA 环境只绑定 `127.0.0.1`，端口为 Node 28439、HTTPS 28444、WT UDP 28443、TURN 28440、relay UDP 28450–28469。PG 使用独立随机 schema，Redis 使用随机前缀；不执行 FLUSHALL。

- `tests/rooms.test.ts`：双实例并发成员上限、owner 权限、定向信令不可泄漏、幂等/冲突、踢出/关闭、票据重放/撤销、历史恢复、临时 TURN HMAC、Origin、大帧、Redis 故障拒绝。
- `tests/rooms-sdk.test.ts`：真实 WS 连接、WT 失败后新票据回退、权威状态、跨页历史下最新快照不被旧事件覆盖。
- `scripts/room-qa-browser.mjs`：两真实浏览器使用 WT 流同步 PG 状态、认证 QUIC 数据报、强制 TURN 时选中 `relay/relay` candidate 后 DataChannel 数据送达；另测 WS + `host/host` 直连、真实不可达 QUIC 入口回退 WS。

测试通过持久化任务运行 `scripts/room-qa-run.sh`；脚本只接受本任务远程目录，不在本机启动任何预览服务。证书是任务私有、两天有效的 ECDSA QA 证书，浏览器使用 SHA256 pin；生产需可信证书。Go 与模块只安装在本任务 tools 目录。回执见 `reports/rooms/browser-connectivity.json` 和 `reports/rooms/verification.md`。

以上是同机回环证据；公网 NAT、跨网络/跨设备、生产域名证书、真实账号入口和既有游戏剧情联机仍不在此专项已验收范围。账号接线后的整仓类型检查、全套测试、构建与账号浏览器回归由主任务统一执行。
