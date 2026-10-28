# 信令重连后的 peer 生命周期

2026-10-29：临时信令断线触发resetTransport时，明确关闭并清空上一generation的所有peer。新ready后调用方可以重新openPeer；不会复用回调仍绑定旧attempt而永久静默的RTCPeerConnection。

RED：`wvn-platform-20261029-rooms-peer-reconnect-red-01`先用实际SDK建立peer，再模拟临时WT断线，发现旧PC关闭数0，预期1。

GREEN：`wvn-platform-20261029-rooms-peer-reconnect-green-01`，exit0，2026-10-28T21:51:01Z–21:51:07Z。

- rooms-sdk+rooms 13/13，零失败/跳过，包含旧peer被关闭/Map清空、自动重连成功、重新openPeer创建不同可用PC、最终关闭回收全部PC。
- 同时覆盖close期间取票/WT/TURN、排队信令、同成员并发peer复用、鉴权终止和HTTP401/403/410停止重试。
- 限定严格TypeScript检查通过。
- 修改后的最终SDK再次通过真实浏览器WT流/数据报、relay/relay DataChannel、host/host直连和真实不可达QUIC入口回退WS。回执见`peer-reconnect-browser.json`。

只验证同机隔离回环；实际整站账号接线另见platform-browser回执，公网NAT与完整游戏剧情同步没有由此获得验收。
