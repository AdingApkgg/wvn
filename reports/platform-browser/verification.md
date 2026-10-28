# 实际整站平台验收

最终结果：第三轮完整 **25/25通过，零失败/跳过**；所有自有服务正常code0退出，无SIGKILL。CDN读字节仍为独立`blocked_missing_cors`，未把它冒称为资源可读或生产已验收。

`wvn-platform-20261029-platform-browser-03`：exit0，2026-10-28T22:09:20Z–22:09:45Z，Playwright 20.3秒。最终脱敏回执目录`platform-0ebdfc52269f47d7/`：`run.json`、`playwright-results.json`、`cdn-cors.json`、`cleanup-audit.json`。

所有安装、构建、服务与浏览器均在专用构建机`localhost`执行；本机只编辑、同步与Git操作。QA通过持久化tmux任务运行真实`server.ts`与`accounts-server.ts`，未使用测试用户头或伪造登录入口。

## 隔离编排

`scripts/platform-qa.ts`只接受本任务远程目录和独立PG角色/数据库`wvn_qa`（回环25439），还查询数据库实际身份。每轮创建随机`e2e_*`目录/账号/资源三个schema、独立Meili index、Redis key前缀。账号默认目录provider直接读取实际PG。

TLS、账号签名密钥、删除/分享账本与存档正文均在本任务`source/state/platform-qa/<run>`，目录0700、密钥/证书0600，存档写入保留62GiB安全阈值。只信任本轮localhost证书，不忽略全局HTTPS错误。浏览器境外访问通过既有11090代理，localhost回环绕过代理。

监听仅为127.0.0.1:4281（public）、4282（private admin）、4283（HTTPS账号）、4284（HTTPS审核）；占用时拒绝启动，不停止其他项目。退出发送SIGTERM给本轮创建的child PID，再只删除本轮schema/index/Redis前缀。每轮保留脱敏run与测试回执，不清数据库或其他索引。

## 首轮真实反馈

`wvn-platform-20261029-platform-browser-01`：2026-10-28T21:46:13Z–21:49:48Z，16通过、9失败，零跳过。回执目录`platform-63d06fce0a6a40c2/`。

新增四项均通过：public与账号实际UUID资源/版本manifest；Meili中文搜索与错误UI；双真实Passkey会话的RoomClient WS、权威事件、账号删除后socket和旧票据失效；COEP账号页通过实际代理fetch已给CDN样本。TLS正向与只信任错误证书时拒绝也通过。

9项失败均定位到既有测试与当前UI基线不符：账号默认登录tab而旧测试直接找昵称、匿名页heading变化、账号安全/存档/分享分区，以及目录主按钮和BGM链接文字。没有据此修改产品UI或删减业务断言。主任务对齐账号/目录选择器，本专项对齐分享分区并将分享分页fixture从SQLite改为受限PG异步查询。

首轮已清理自身3个schema、1个Meili index和2个Redis key，没有强停或修改其他项目。

## 第二轮反馈

`wvn-platform-20261029-platform-browser-02`：2026-10-28T21:55:02Z–21:55:47Z，24通过、1失败。回执目录`platform-57a881cf70e648eb/`。账号、目录、平台接线、TLS、PG分页分享全部通过；审核登录后因真实HTTP层漏await，将异步queue当JSON结构返回，审核页崩溃，已由主任务修复产品代码。

短轮清理同时发现catalog进程SIGTERM后15秒未退出，编排器仅对自身catalog child执行SIGKILL并记录；其他入口/worker正常code0，自身3个schema/index/Redis仍清理。根因线索为SSR bundle与tsx入口各自拥有模块级目录PG实例，主任务统一同进程runtime。后续launcher将任何强停记为非零`cleanup_failed`，不能把它作为正常退出通过。

## 第三轮最终通过

修复真实审核队列await和SSR/监听入口共享Store后，完整运行既有accounts、shares、preview-tls、catalog与新增platform五个文件，25项全部通过。全部业务断言保留，没有skip或缩减。

- 真实Passkey注册/登录、恢复、身份切换、撤销、账号删除、私人书库与云备份/中断恢复通过。
- 链接/公开分享、审核、领取、撤回、来源失效、跨页版本/进度筛选通过；分页fixture是真实PG，不再写SQLite。
- 桌面/移动目录、搜索、版本/旧资源路径、私有管理revision冲突、TLS指定证书信任与错误证书拒绝通过。
- public/account两个真实入口的UUID资源与版本manifest、Meili中文搜索/错误UI、双Passkey RoomClient WS/权威事件及删除失效通过。
- catalog-server、account-server、search-worker均code0且signal=null，正常SIGTERM清理；3个本轮schema、1个Meili index、8个Redis keys已清理。
- 独立audit再次确认4281–4284端口已释放、3个schema/index/Redis前缀不存在、私有目录/密钥权限正确；既有`resource_full_20261029`保留。

运行入口：在本任务remote.py持久化job内，加载既有私有services.env后执行`bash tests/e2e/run-remote.sh`。脚本不构建；需要先完成主任务实际生产构建。可选`--grep <pattern>`用于定位失败，其余参数明确拒绝。

## CDN读取边界

首轮实际浏览器回执明确是`blocked_missing_cors`：账号页COEP `require-corp`且`crossOriginIsolated=true`，请求小PNG时浏览器报告`No 'Access-Control-Allow-Origin' header`。这独立于资源UUID API成功；需要另行生产CORS授权，本轮没有修改CF/B2/CDN。

样本SHA256：`00001b15352958962673bb4cc446601b948a2c9eaebb1540a92a9f00cbabe7b8`，预期11638B。没有把CORS阻止写成CDN字节读取或游戏资源兼容通过。

## 证据范围

同机回环实际入口/浏览器验收不代表公网NAT、跨设备、所有现有游戏可联机或迁移生产完成。WS/WebRTC/TURN/真实QUIC专项证据在`reports/rooms/`单独记录，不能替代整站账号/存档/分享验收。
