# NSFW 实施与远程验收

## 当前结论（2026-11-04）

实施与本次远程验收完成。独立源码复核的原11项P1/P2触发路径均已修复；CAS随后对齐线上域名，最终完整回归、类型检查、生产构建、16项浏览器验收、1项真实ONS和380条媒体访问边界通过。用户已授权以功能分支提交、推送并创建PR；未合并或部署生产。域名对齐与真实引擎交互修复详见 [本轮验收](cas-origin-alignment-20261104.md)。下方“历史过程记录”保留各轮当时状态，不代表当前待办。

- 工作区 `/Users/i/.codex/worktrees/nsfw-eligibility/wvn`，分支 `codex/nsfw-eligibility`，基线/远端main均为 `3e69d267e28b3bb6e1b442b7597799433a537026`。原 `/Users/i/Code/wvn` 仅保留原有设计草稿，未改业务代码。
- 已实施账号资格与会话主动开启，12题抽8题（4核心+4随机），全对通过，3次/滚动24小时，失败冷却30分钟，尝试24小时过期；不宣称年龄或心理成熟度验证。
- 作品页面、具体版本、逐张图片独立分类，搜索/统计/辅助目录/分享/启动统一投影。未知作品不进入发现列表，未知版本需要资格及本会话开启，未知媒体不展示。
- 页面审核对所见文本快照做指纹CAS，并在目录锁与分类锁内写入；公开分享只审核已发布且无pending的独立文案，修改会失效。
- 撤权/关闭时作品、目录、个人列表及分享即时收起，不等待loader；运行实例保留并遮挡、暂停/静音。可见窗口每15秒复查，资格GET 5秒超时转公共；失焦可见窗口也复查，隐藏页面即时锁定。
- 公共模式可修改书架阅读状态，省略note保留原值；隐藏备注不会被空值写回，PATCH回执同样投影。私人导出、恢复和删除不受浏览资格阻断。启用资格时不启动未接控制桥的旧引擎。

| 验证 | 远程持久化任务 | 已观察结果 |
| --- | --- | --- |
| 最终完整后端与播放器模块 | `wvn-nsfw-full-20261103T190639Z` | 退出0；315项TS、227项mjs全部通过 |
| 最终内容/预览增量 | `wvn-nsfw-content-20261103T181914Z` | 退出0；56/56通过，含真实PG、Passkey HTTP、并发与边界 |
| 最终类型检查与构建 | `wvn-nsfw-build-20261103T190640Z` | 退出0 |
| 最终完整浏览器验收 | `wvn-nsfw-browser-20261103T191009Z` | 退出0；16/16通过，46.8秒；含安全图库解码/剧透及同一iframe收起、静音、恢复、CAS Range206、资格撤销、保存退出协议 |
| 真实ONS与保存退出 | `wvn-nsfw-cas-browser-20261103T190935Z` | 退出0；新域名启动、画布焦点下一次点击捕获、本机快照保留及退出通过 |
| 安全媒体完整缓存及HTTP边界 | `wvn-nsfw-media-20261103T191011Z` | 退出0；355张安全图片HEAD200、25张受限图片HEAD403，0错误 |

## 预览、数据与验收边界

- 地址：`https://localhost-1.tailac9c6f.ts.net:24483`，需Tailscale。当前预览任务 `wvn-nsfw-preview-20261103T190924Z`。固定产物下16项常规与1项真实ONS验收后预览继续运行，未销毁QA状态。
- 远程实际hostname=localhost、目录 `/home/i/wvn-nsfw-preview-20261104/source`；仅使用 `wvn_qa` 与本任务拥有的schema、索引、private目录，未在Mac安装、构建、启动服务或跑浏览器回归。
- 静态快照72作品/94版本/380唯一图片：页面文案55 SFW、17 NSFW；94版本全部待核实，不把作品标签当作具体包证据。355唯一图片有VNDB原始双零评分及有效票数，25张仍未知；截图剧透未核实，默认折叠。详见 `docs/nsfw-classification-audit.md`。
- 预览原无媒体缓存，补查安全图片404后，通过既有代理只缓存355张已审核安全图片到本任务media目录；没有改写metadata或分类。随后完整检查380条媒体路径：355个200且image MIME，25个403，全部符合预期。缓存脚本为 `scripts/prepare-nsfw-media.py`，报告仅在本任务private/media-report.json。
- 工作副本客户端、服务端资源URL、CSP和工具已对齐公开生产清单的 `https://wvn-s3-zi0.saop.cc`。预览对清单做固定新域与SHA路径/ONS引用校验后原样返回，已取消旧域名回写；同SHA资源、映射和存档身份不变。真实ONS14条资源请求直达新域名，无旧域名或主站200/206游戏正文。没有更改生产存储或引入Worker。
- 清单约20MB，预览使用显式机器代理、压缩传输、32MiB及时间上限；只转发公开元数据，不转发游戏/引擎/媒体正文或Cookie。游戏字节仍由浏览器直连CAS，已交付公开字节无法撤回。
- 证书为本任务测试证书。自动化浏览器只定向信任该公钥，未全局忽略HTTPS错误；控制桥测试仅向隔离context授予 `local-network-access`，生产沙箱权限不变。普通用户 `tailscale cert` 被拒，`sudo -n` 也要求密码；未改operator、系统信任或生产证书。用户浏览器的Passkey体验需信任此测试证书；Chromium需允许该站点访问本地网络，不能声称默认浏览器开箱可用。
- 私有目录/资格管理仅监听127.0.0.1的24484/24485，令牌、密钥、Cookie不在仓库或本报告。控制桥验收使用可观测引擎夹具核对同一iframe、离屏Audio和本机快照；另用真实CLANNAD引擎补验启动、CAS来源与本机捕获退出，修复画布焦点导致工具栏点击丢失的问题。这不是94版本完整真实游玩、游戏内进度恢复或键盘从沙箱返回工具栏的验收。夹具结束恢复完整原分类payload，避免留下假的版本证据。
- 共享/tmp满额曾使Chromium字体服务ENOSPC/SIGABRT，现使用本任务private/tmp，未删除其他任务数据。曾有一轮在浏览器期间构建导致资产短暂404，已作无效环境轮次记录，后续固定产物后验收。
- 自动审批曾拒绝一处可能重置书架原note/status/revision的补丁，该写法未应用；已改为保留原记录并通过专门回归，无待审批动作。

## 历史过程记录

以下内容是各轮当时的工作日志；以本文件顶部的任务、退出码和验收边界为准。

日期：2026-11-04（Asia/Shanghai）。进行中，不是完成回执。

## 授权与工作区

- 用户已授权按设计实施，答题使用8题全对、3次/滚动24小时、失败30分钟冷却；允许远程验证和预览，明确暂不生产部署。
- 工作区 `/Users/i/.codex/worktrees/nsfw-eligibility/wvn`，分支 `codex/nsfw-eligibility`；原 `/Users/i/Code/wvn` 的main未做业务修改。
- 设计与计划分别在 `docs/superpowers/specs/2026-11-04-nsfw-eligibility-design.md` 和 `docs/superpowers/plans/2026-11-04-nsfw-eligibility.md`。

## 远程任务

- 已确认默认构建机 `hostname=localhost`，通过同机地址 `i@192.168.9.29` 连接。tmux、Node24、Chromium可用。
- 本任务目录 `/home/i/wvn-nsfw-preview-20261104/source`；依赖只读复用既有QA目录的node_modules，没有本机安装或构建。
- QA环境来自远程既有 `wvn-platform-20261029/private/services.env`，仅允许角色/库 `wvn_qa` 与回环25439，Redis/Meili均为既有QA服务。
- 每轮独立tmux在 `~/.local/state/ai-jobs/wvn-nsfw-<阶段>-<UTC时间>/`，保存 `run.sh/output.log/pid/host/cwd/started_at/finished_at/exit.code`。
- 本地临时调度器 `/private/tmp/wvn-nsfw-remote.py` 支持 sync/job/status；任务阶段脚本为仓库 `scripts/run-nsfw-checks.sh`。不得把异步SSH当远程持久化。

## 已观察的证据

- `wvn-nsfw-baseline-20261103T171039Z`：基线账号、PG目录与搜索10/10通过，退出0。
- `wvn-nsfw-red-account-20261103T171040Z`：账号新增测试按缺失仓储/接口失败，退出1。
- `wvn-nsfw-red-classification-20261103T171042Z`：分类新增测试按unknown缺失/模块缺失失败，退出1。
- `wvn-nsfw-content-20261103T171440Z`：账号9项、初版分类5项及策略5项通过；新HTTP模块当时不存在，整体退出1，不能当整套通过。
- `wvn-nsfw-metadata-20261103T171125Z`：首轮官方查询400，已确认停止；修正filters后才重试。
- `wvn-nsfw-metadata-20261103T171442Z`：71个VNDB作品的官方逐图评分证据采集成功，退出0；结果回传 `data/content-image-evidence.json`。
- `wvn-nsfw-content-20261103T171818Z`：统一HTTP保护5项通过；新增文案指纹用例按预期失败。
- `wvn-nsfw-red-account-20261103T171930Z`：新增私有管理2项RED，原9项通过。
- `wvn-nsfw-red-classification-20261103T171928Z`：私有分类管理及文本复审RED。
- `wvn-nsfw-browser-red-20261103T172101Z`：真实远程Chromium、TLS正常，游客新页面标题不存在而失败，保留trace；UI代理随后开始实现。
- `wvn-nsfw-content-20261103T172619Z`：账号11项、HTTP5项、策略5项通过；分享分类2项、版本文案复审及搜索3项RED。
- `wvn-nsfw-content-20261103T172641Z`：预览只读元数据桥因模块缺失RED，随后实现。
- 最近启动任务：`wvn-nsfw-content-20261103T172933Z`、`wvn-nsfw-build-20261103T172934Z`；必须读取实际退出码后再判断。
- 两个本机允许的轻量单文件测试：`node --test tests/content-policy.test.ts` 5/5；`node --test tests/content-visibility.test.mjs` 1/1，各自已观察先失败再通过。远程全量仍待执行。

## 当前预览与限制

- 隔离HTTPS地址 `https://localhost-1.tailac9c6f.ts.net:24483`，当前运行任务是 `wvn-nsfw-preview-20261103T171932Z`，仍为UI RED基线构建，不能作为新功能验收结果。
- `wvn-nsfw-preview-20261103T172024Z`被已有服务保护拒绝重复启动，未覆盖原进程。
- Schema为 `preview_nsfw_20261104_catalog/accounts/resources`，索引 `preview_nsfw_20261104_works`，账号、证书、密钥、账本均在本任务private目录。
- 后续先完成新构建，再按原任务记录核对并停止自己的预览进程，只重启本任务；禁止影响其他预览和生产。
- 新预览拟只读取得现有公开CAS元数据、浏览器继续直连公开SHA资源，不代理正文；这一路径仅允许preview且不转发Cookie。

## 已作实现裁决

- 页面分类绑定当前公开文本指纹，涵盖作品文案与全部已发布版本title/notes/language；修改后有效分类unknown，人工原证据保留，复审后恢复。
- 独立分享的审核绑定metadata_revision，修改文案后旧审核失效。
- 已应用到QA的迁移也不改checksum，新增字段均用追加迁移。
- API最外层统一保护，内部目录直接读可信Store；通用资源索引在启用资格时不公开。
- 退出/关闭时保留已运行播放器实例，以同页设置恢复资格，音频控制走绑定nonce/port；不能承诺撤回已交付公开字节。

## 待完成

- 观察最新内容/构建日志，修复真实失败；所有已新增RED需有后续GREEN。
- 账号代理补分享分级方法/私有接口；分类代理补搜索/版本文本指纹；UI代理补独立个人列表与分享的旧数据即时收起，仍需其新增2条浏览器RED后实现。
- 首次完整成功构建后替换自己的预览，再跑桌面/移动、Passkey、答题、模式、跨标签页、直接链接、图库、搜索和播放器边界。
- 私有分类/资格接口的管理UI、SFW分享投影和资源清单权限需完整复核；保留私人导出/恢复/删除。
- 远程整库测试/类型检查/构建、独立全分支审阅及必要修复、最终验收回执。不要推送/合并/生产部署。

## 后续进展

- `wvn-nsfw-build-20261103T173433Z` 首次完整类型检查与生产构建退出0；不是最终验收构建。
- `wvn-nsfw-content-20261103T173547Z` 35项中34通过，新增数字作品API用例以200!=401按预期RED；已统一规范化编号修复，待GREEN。
- 最新调度：content `wvn-nsfw-content-20261103T173729Z`、build `wvn-nsfw-build-20261103T173730Z`、full `wvn-nsfw-full-20261103T173731Z`。
- UI现导出同页 ContentSettings，播放器实例CSS隐藏而非销毁；仍待真实浏览器验证恢复、保存与跨标签页。
- 新发现分享moderate批准pending时不递增metadata_revision：账号代理正在补先发布再独立分级的回归和约束，不能接受待审旧approved上的SFW结论。
