# ONS 清单传输复核（2026-10-29）

生产补丁版本：`b2-direct-gzip-20261029-9013d6cb6819`。只更新 `src/player/b2.server.ts` 和本轮版本标记，前端构建、沙箱权限、B2 对象、账号及存档身份均保持原状。

用户报告 `GET /__ons/manifest/ons-v1194-1` 出现 `ERR_HTTP2_PROTOCOL_ERROR 200`。这代表收到状态码后，完整响应传输仍可能失败。本轮未稳定复现该协议错误：修补前源站、公开 HTTP/1、HTTP/2 都能读完清单，且独立浏览器已能启动缘之空。因此不能把扩展的 postMessage 错误或资源缺失当作已确认的根因。

确定可改善的是清单传输体积：原清单未压缩，缘之空 2,426,713 字节，CLANNAD 4,706,388 字节。现在在启动时预编码，按 Accept-Encoding 协商 gzip，返回 Vary 和准确长度，保留 identity 与 HEAD。生产实测如下：

| 清单 | 原始 UTF-8 字节 | gzip 传输字节 | 解压后 SHA-256 |
| --- | ---: | ---: | --- |
| 缘之空 | 2,426,713 | 124,130 | 与修补前完全相同 |
| CLANNAD | 4,706,388 | 260,412 | 与修补前完全相同 |

这是约 95% 的传输减重；没有更改清单条目、缓存/存档标识，也没有让游戏正文经过主站。网络耗时会随代理和边缘节点变化，体积减少是本轮确定的改进，不据此宣称所有 HTTP/2 连接问题均已根治。

验证包括：

- Debian 上先失败再通过的 gzip/identity、q=0、UTF-8、HEAD 路由回归；
- 真实项目 `npm test` 170 项全部通过，`npm run typecheck` 通过；
- 独立 canary 和正式域名上的缘之空、CLANNAD 均完成实际画面、保存退出、重进和沙箱隔离检查；
- 正式域名 HTTP/1、HTTP/2、编码及重复完整读取共五项通过，解码摘要与修补前一致；
- 修补前后 13 张私人关键表、路径、秘密/证书元数据、账本、15 个引擎兼容绑定、原后台及统计服务保留，无旧数据库回灌。

首次在精简运行镜像中跑完整回归时，38 项因缺少临时 state 目录或 git、python3、ss 等测试条件失败；原失败按名称保留在本地 `reports/ons-manifest-20261029/regression-environment-failures.md`，随后使用 Debian 完整环境重跑原测试，未跳过或放松断言。最终任务位于 Debian `/home/i/wvn-b2-direct-qa-20261029-debian/manifest-full-suite-01/`；生产浏览器回执位于 `reports/ons-manifest-gzip-production-01/`。

原机回退资料为 `state/ons-manifest-gzip-20261029/`。`rollback.py` 仅撤回本次源文件和版本 drop-in，保留当前账号和存档。若还要撤回之前整轮 B2 直链切换，先撤回本补丁，再使用原 B2 切换回退资料。

`origin=null` 仍是游戏不透明沙箱的预期隔离。沉浸式翻译等扩展向该沙箱使用自身消息桥接时报错，属于另一层兼容问题；本补丁不放开沙箱，也不改变账号与游戏之间的专用消息通道。
