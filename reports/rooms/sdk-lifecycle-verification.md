# SDK 连接生命周期修复回执

日期：2026-10-29。仅修改房间浏览器SDK、声明与专项测试；没有改账号入口、服务端房间、ops或共享文档。

## 行为修复

- 每次 `connect()` 拥有独立 AbortController 与尝试身份；`close()` 立即使尝试失效并中止取票fetch。
- 取票、WT握手、双向流、WS打开、认证写入和ready等待的每个异步边界都复查尝试身份；取消后不建传输、不取回退票、不发 `connected/fallback`，不重连。
- 读取流/数据报、WS消息与连接关闭回调同时检查传输generation和尝试身份；旧尝试的catch/finally不会清理新连接。
- WT应用层非限流error保留终止原因；401/403/410取票错误、WS4003和房间终止错误均停止重试并关闭peer。临时网络故障仍采用原有退避重连；再次显式 `connect()` 可以建立新尝试。
- WS直接连接复用首次票据，只有真正尝试WT后失败才重新取回退票。
- `request`增加可选 `{signal}`，声明说明close以AbortError取消尝试。

## RED → GREEN

`wvn-platform-20261029-rooms-sdk-cancel-red-02`：两个关闭竞态均失败，实际在close后构造了1条WS，预期0。测试精确控制pending ticket与pending WT，取消后仍让底层结果晚到，避免依赖随机定时。

`wvn-platform-20261029-rooms-sdk-terminal-red-01`：WT unauthorized后仍请求第二张票；自动重连收到401后，推进定时器产生5次请求，预期仅首次连接+首次合法重连的2次。手动定时器用于明确验证不会继续排入退避，而不是等待一段时间后推断。

`wvn-platform-20261029-rooms-sdk-lifecycle-final-01`：exit0，2026-10-28T21:31:29Z–21:31:30Z。

- `node --import tsx --test tests/rooms-sdk.test.ts tests/rooms.test.ts`：9/9，零失败/跳过；覆盖两个取消竞态、WT unauthorized/not_a_member/room_closed、HTTP401/403/410终止、临时网络成功重连，以及原PG/WS权限与真实WS回退/历史恢复。
- 限定文件严格TypeScript检查通过。
- QA监听端口与任务TURN容器均已清理。

## 真实浏览器回归

`wvn-platform-20261029-rooms-sdk-terminal-green-01`：exit0，2026-10-28T21:30:31Z–21:30:41Z；最终SDK源码与本次提交一致。执行真实回环 `scripts/room-qa-run.sh`：

- 双客户端WebTransport可靠流同步PG序号与状态；认证QUIC数据报经Node房间协议返回pong。
- 强制TURN选中relay/relay UDP，真实DataChannel数据送达。
- WS兼容链路的非relay直连，本轮选中srflx/srflx UDP，真实DataChannel数据送达。
- 未监听QUIC28449导致预期网络错误，仍重新取票并回退WS，权威状态同步通过。

原始脱敏回执：`sdk-lifecycle-browser.json`。以上均为同机回环，不是公网NAT或跨设备验收。全仓回归仍由主任务统一运行。
