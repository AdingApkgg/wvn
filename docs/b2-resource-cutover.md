# B2 公开游戏资源直链

游戏包、引擎、字体、图片和媒体由浏览器直接请求 `https://wg-b2.saop.cc`，经 Cloudflare 边缘读取固定的 B2 发布 `releases/20261027-01/`。账号站只提供本地控制清单、隔离入口 HTML 和存档桥接脚本。对象正文不经过账号服务或自建资源网关。

原资源盘、已上传对象、账号 SQLite、秘密、删除/分享账本和私人云存档后端均继续保留。公开资源切换不改变账号、云存档服务地址或已验证的引擎与存档兼容绑定。

## 控制与资源路径

- `ops/b2/prepare-controls.mjs` 是一次性准备器：通过远程主机已有代理读取 79 个公开入口，逐项核对 B2 SHA-1 和大小，生成本地控制文件。该文件不包含账号、密钥或私人存档。运行时不再向 B2 下载入口。
- `src/player/b2.server.ts` 校验本地控制文件，预编码 ONS 清单并协商 gzip / identity（含准确长度、Vary 和 HEAD），提供经过隔离的游戏 HTML。HTML 的 `<base>` 指向当前游戏的 CDN 路径，可信桥接脚本仍从账号站加载。
- `WG_B2_CONTROL_FILE` 启用直链模式。原 `WG_RESOURCE_UPSTREAM` 可保留供回退；直链模式不调用它，也不注册本地引擎正文服务。旧对象 URL 只返回空正文的 302 跳转。
- 沙箱保持不透明 origin，不授予 `allow-same-origin`；CSP 仅允许当前游戏目录和固定引擎目录。父页面校验消息、账号和存档身份的逻辑保持原有边界。
- 浏览器对固定引擎文件核对 SHA-256，脚本使用 SRI。已核验的 WASM 和 `.data` 字节传给 Emscripten 的 `wasmBinary` / `getPreloadedPackage`，避免初始化时重复下载。游戏包继续由浏览器直接请求 CDN。

## CDN

`ops/b2/cdn-worker.mjs` 和生成的 `public-assets.mjs` 把登记的虚拟路径映射到固定发布中的公开对象，包括转换后的媒体和不可变引擎。它只接受 GET/HEAD，不向 B2 转发 Cookie 或 Authorization，不写入 B2，也不提供账号或存档代理。

保留既有桶路径重写；路由同时覆盖原始和重写后的公开资源路径。Worker 设置正确的 JS、WASM、字体与媒体 MIME、CORS 和 CORP，并保留 Range、条件请求及来源回执。原始 HTML 按 `application/octet-stream` 和 `no-transform` 传输，避免中间层注入；一次性准备器核验后，由账号站按隔离规则提供本地入口。

完整的小对象（不超过 32 MiB）在边缘流式收齐后才返回响应头，断流可限次重试；错误和 206 响应不写成完整缓存。大游戏包和 Range 由 CDN 直接流式传输。这里的边缘缓存不占用账号服务器的出口带宽。

## Compose

仅在远程专用主机执行，长任务必须使用可重连的持久化执行器。先从当前源码构建应用镜像，再准备公开控制文件：

```sh
node ops/compose/build.mjs state/compose/compose.env web
node ops/b2/prepare-controls.mjs state/compose/b2-direct-control.json
```

在部署侧环境文件中设置 `WVN_B2_CONTROL_FILE` 为该文件的绝对路径。附加配置只给 `web` 增加只读控制文件和直链开关：

```sh
docker compose --env-file state/compose/compose.env \
  -f compose.yaml -f ops/b2/compose.direct.yaml config --quiet
docker compose --env-file state/compose/compose.env \
  -f compose.yaml -f ops/b2/compose.direct.yaml \
  up -d --no-deps --no-build --pull never --wait web
```

现有生产 systemd 服务的资源切换与 Compose 编排迁移分别管理；不能因启用直链就顺带迁移账号服务。新的预览必须使用独立账号目录、秘密和 cookie 前缀，禁止挂载真实账号库进行浏览器验收。

## 验收与回退

`ops/b2/verify-browser.mjs` 在远程专用浏览器运行。`WVN_VERIFY_ORIGIN` 指定入口，`WVN_B2_RELEASE_FILE` 提供公共引擎元数据，`WVN_QA_CERT` 指定公开 localhost 证书，`WVN_QA_PROXY` 使用主机已有代理；`WVN_QA_OUTPUT_ROOT` 和 `WG_B2_BROWSER_RUN` 指定本轮独立回执目录。

默认覆盖缘之空及 CLANNAD（ONS）、ATRI（Artemis）、Tyrano 和共享 RenPy。先验独立 HTTPS canary，再验正式域名：

- 实际 B2 来源和对象路径、可信驱动摘要，账号站对象 200/206 响应必须为零；
- 不透明沙箱、父页面和存储隔离、无启动错误；
- ONS/Artemis 出现实际画面，Tyrano 到达标题场景，RenPy 推进真实正文；
- 保存退出、重进及网络错误回执，另测 CDN MIME、完整读取和 Range。

四类抽样通过不代表 79 个版本全部通关或私人云存档已验收。`health` 成功或对象全量校验也不能代替真实启动。

切换前在原主机做一致性 SQLite 快照，保存原代码、构建、配置摘要和引擎绑定。回退只恢复本轮公开代码、构建及本轮 systemd drop-in，保留最新账号数据库和全部存档；不自动回灌切换前数据库。CDN 回退仅撤销本轮拥有的 Worker 路由，不删除/覆盖 B2 对象，不改旧 DNS 或桶路径重写。私人云存档后端的可达性与读写验收单独报告。

本次发布、四类真实浏览器抽样、网络重验及私人状态保留情况见 [2026-10-29 验收记录](b2-direct-acceptance-20261029.md)。

控制清单压缩、具体版本复核及原始协议错误的证据边界见 [ONS 清单传输复核](ons-manifest-transport-20261029.md)。
