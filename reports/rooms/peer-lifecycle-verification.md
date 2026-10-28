# Peer 异步生命周期修复

2026-10-29，修改限定为SDK、声明和rooms-sdk专项测试。关闭/终止后，TURN响应、SDP操作与排队signal不能再构造peer或发送信令。

- `peer/openPeer/signal`携带当前attempt、AbortSignal和传输generation；TURN和每个SDP await之后复验，并校验peer仍是Map中当前对象。
- `resetTransport`丢弃signalChain引用；已经排队的回调也先检查原attempt/generation，过期工作不请求TURN，取消不产生误导的peer_signal_failed。
- ICE、datachannel与连接事件回调检查当前peer，迟到的datachannel立即关闭。
- 同成员的本地主动连接和入站offer可同时请求TURN，TURN返回后第二次检查Map，复用先完成的peer，避免两次构造后被覆盖的孤立对象。

RED：`wvn-platform-20261029-rooms-peer-cancel-red-01`捕获关闭后实际构造1个peer（预期0）、排队signal实际请求1次TURN（预期0）。

RED：`wvn-platform-20261029-rooms-peer-concurrent-red-01`捕获同时openPeer与入站offer实际构造2个peer（预期1）。测试也断言close回收全部构造对象。

最终GREEN：`wvn-platform-20261029-rooms-peer-final-01`，exit0，2026-10-28T21:45:21Z–21:45:22Z；rooms-sdk+rooms 12/12，零失败/跳过。限定严格TypeScript检查覆盖SDK测试、新平台launcher、platform.spec与PG分享fixture，均通过。

取消实现的真实浏览器回归：`wvn-platform-20261029-rooms-peer-cancel-green-01` exit0，真实WT可靠流/数据报、强制relay/relay DataChannel、host/host直连与QUIC不可达后WS回退全部通过。脱敏回执见`peer-lifecycle-browser.json`。最后追加的Map复用由上述并发RED→GREEN测试验证；该浏览器回执不冒称覆盖最后追加的两行源码。

真实整站Passkey/SDK接线验收另由platform-browser任务记录，不将同机回环传输验证当成公网NAT、跨设备或完整游戏联机验收。
