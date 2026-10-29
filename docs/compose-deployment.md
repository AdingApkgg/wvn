# WVN Compose 部署（SQLite 阶段历史参考）

2026-10-29 主应用已迁到 PostgreSQL。本文和仓库根 `compose.yaml` 的账号/目录 SQLite 编排属于迁移前方案，不能直接用于当前主应用；现行基础服务配置为 `ops/platform/compose.yaml`，部署及回滚以 [平台指南](platform-postgres.md) 和 [生产切换记录](production-platform-20261029.md) 为准。独立 Umami 和原私有正文服务继续保留。

本轮目标是覆盖主站、私有后台、B2 预览、资源与存档存储服务、统计服务和验收浏览器。先在 Linux 专用远程主机的新项目中验证，现有生产进程、数据和资源保持原状。

## 实施与验收计划

- [x] 增加锁定 Node 基础镜像的应用镜像、浏览器目标和构建上下文排除规则。
- [x] 提供默认主站/后台/统计服务，以及 B2、存储和浏览器 profiles；复用已有统计 Compose。
- [x] 新状态目录生成独立密钥与 localhost 证书；重复初始化保留既有秘密和数据库，拒绝覆盖陌生目录。
- [x] 只为全新目录初始化目录库；首次配置新统计实例并关闭默认管理员密码。
- [x] 在 Arch 新建隔离项目，构建镜像；167 项 TypeScript 测试和 43 项针对性 MJS 测试通过，7 个服务健康，持久化重启与存档读写通过。
- [x] 执行真实浏览器验证并保存结果：主站、私有后台、B2 ONS 启动与重进通过；共享 RenPy 因 B2 引擎文件完整读取超时未通过，保留失败回执，等待链路恢复后复验。
- [x] 核对原生产服务、原 B2 预览和原统计容器未变；保存回执及本地提交。

本轮完成的是部署编排覆盖及上述范围的隔离验证。原资源上游连通性和共享 RenPy 资源完整读取仍有阻塞，不能据此认定全部游戏可玩；生产继续沿用现有服务。

## 部署选择

应用沿用 Linux host 网络，保持现有回环/Tailscale 监听、HTTPS origin 和地址限制。统计服务继续使用自己的 bridge 网络，PostgreSQL 不发布端口。主应用镜像以普通用户运行，根文件系统只读，持久目录单独挂载；数据库、密钥、游戏资源和浏览器回执不打入镜像。

常规生产资源路径和 B2 预览分别配置。B2 profile 只挂载部署侧已验收的预览入口、只读网关和共享引擎清单，不包含原资源盘或生产账号库。引擎仍在浏览器沙箱中执行。

## 服务与目录

| 服务 | Profile | 默认监听/用途 | 持久状态 |
| --- | --- | --- | --- |
| `web` | 默认 | HTTPS `127.0.0.1:18891`，分享管理另用 `18894` | `web/`、`catalog/` |
| `manager` | 默认 | HTTP `127.0.0.1:18893` 私有后台；`18892` 为原目录监听 | `manager/`、`catalog/` |
| `postgres`、`umami` | 默认 | 数据库不发布端口；统计后台 `127.0.0.1:18961` | 项目独立的 `pgdata` 卷 |
| `catalog-init` | 默认一次性 | 只为不存在的目录库 seed；既有目录仅核对完整性 | `catalog/` |
| `analytics-init` | 默认一次性 | 初始化本实例管理员与站点；陌生凭据拒绝重置 | `analytics/` |
| `b2-preview` | `b2` | HTTPS `127.0.0.1:18895`，分享管理另用 `18898` | 独立 `b2/` 与秘密 |
| `resources` | `storage` | 指定 Tailscale IPv4 `:18896`，只读游戏资源 | 外部资源目录只读挂载 |
| `blobs` | `storage` | 指定 Tailscale IPv4 `:18897`，令牌和客户地址限制 | `blobs/` |
| `browser` | `qa` 一次性 | 专用 Chromium 验收，不发布调试端口 | `reports/` |

`WVN_RESOURCE_ROOT` 是原游戏目录；`WVN_MEDIA_ROOT` 是站点封面与截图；`WVN_PLAYER_MEDIA_ROOT` 是已转换的片头媒体目录。三个目录分别挂载，不能把空的适配目录当成原资源已恢复。远程资源模式通过 `WVN_RESOURCE_UPSTREAM` 对接已确认的服务地址。

账号 SQLite、删除/分享账本和本地存档对象位于各自的 `web/` 或 `b2/` 中。主站与 B2 使用不同 cookie 前缀及账号秘密。后台只共享目录库；验收浏览器只取得本轮后台启动令牌和公开证书，不挂载账号数据库。

## 首次准备与构建

以下命令在专用 Linux 远程主机执行。需要 Docker Compose 2.27.1 以上、Buildx、Node 24 以上和 OpenSSL；本轮实测 Compose 5.6.1、Node 24.18.0。Mac 仅用于编辑、传输与 SSH 隧道。

```sh
node ops/compose/prepare.mjs state/compose
```

准备器生成权限受限的 `compose.env`、独立秘密和 30 天 localhost 证书，不打印秘密。再次运行保留原内容；陌生非空目录和缺少秘密的已初始化目录均拒绝继续，不会悄悄生成替代密钥。生成中断的目录需先人工核对，不自动覆盖。

在原机编辑 `state/compose/compose.env`：

- 为项目设置独立的 `WVN_COMPOSE_PROJECT`，为发布设置独立的 `WVN_IMAGE`、`WVN_BROWSER_IMAGE` 标签。
- `WVN_BUILD_PROXY` 和 `WVN_RUNTIME_PROXY` 填该远程机器已有代理。构建器同时传递大小写代理变量；host 网络可访问宿主的回环代理。
- 配置真实的资源上游或完整只读目录，以及封面和媒体适配目录。空目录仅供启动配置检查，不能证明游戏可玩。
- 使用 `storage` 时，填写本机 `WVN_TAILSCALE_IP` 和 `WVN_STORAGE_CLIENTS` 白名单；不要填写公网监听地址。

```sh
node ops/compose/build.mjs state/compose/compose.env
docker compose --env-file state/compose/compose.env config --quiet
docker compose --env-file state/compose/compose.env up -d --no-build --pull never
```

构建器使用 Compose 自己解析私有环境，只把构建字段交给 Buildx，不输出服务秘密；显式授予本次 `network.host` 构建许可，不更改 daemon。它适用于本轮 Compose/Bake 需要额外网络许可、不能直接透传授权的环境。可在最后追加 `web` 或 `browser` 只构建其中一个目标。

应用镜像只复制生产依赖、构建产物和运行源码。浏览器镜像包含完整测试依赖，使用独立 `/opt/wvn` 目录并显式重置入口。默认使用锁定的 Debian/Node 24 基础镜像，通过宿主已有代理安装 Chromium；也可用 `WVN_QA_BASE_IMAGE` 指定已有、经过审查且包含 Chromium 和 Node 22 以上的验收镜像。保留该基础镜像原生的 Node 与系统库，不跨 glibc/musl 复制二进制。应用服务始终使用 Node 24，浏览器镜像不负责数据库或业务服务。

## B2 预览

部署侧 `WVN_B2_CONFIG_ROOT` 放置以下已验收文件；代码与清单不混入秘密或账号数据库：

- `b2-entry.ts`：已经接入只读 B2 网关的账号服务入口，导入路径相对于应用根目录。
- `b2-resources.mjs`：已验收的预览专用网关。
- `candidate.json`：固定共享引擎与明确版本绑定，符合 `src/engines/candidate.ts` 的预览格式。
- `WVN_STATE_ROOT/b2/runtime.json`：网关需要的公共 `release` 元数据，须与候选清单对应。

这些文件作为只读挂载进入容器，缺件就拒绝启动。本轮容器继续复用已有 B2 预览成果，没有复制生产账号库、真实存档或原资源盘。候选未知兼容存档保持独立空间，云同步限制沿用既有规则。

```sh
docker compose --env-file state/compose/compose.env --profile b2 up -d --no-build --pull never
```

## 私有存储

```sh
docker compose --env-file state/compose/compose.env --profile storage up -d --no-build --pull never
```

主站默认使用自己持久目录下的本地存档对象。若使用独立或既有私有存档服务，设置 `WVN_BLOB_UPSTREAM`，并启用额外配置：

```sh
docker compose --env-file state/compose/compose.env \
  -f compose.yaml -f compose.storage-client.yaml \
  up -d --no-build --pull never web
```

该覆盖文件仅向主站增加存档服务令牌。使用既有服务时，`WVN_BLOB_TOKEN_FILE` 必须指向原令牌文件，不能用新生成的令牌替换。B2 预览继续使用独立存储。资源目录只读，存档目录可写；原有大小、摘要、空闲空间和白名单检查继续生效。

## 验收与日常管理

```sh
docker compose --env-file state/compose/compose.env --profile b2 --profile storage ps --all
docker compose --env-file state/compose/compose.env logs --tail 80 web manager
```

`healthy` 只说明服务健康。验收还要核对实际网页、管理认证、游戏来源、原生正文、退出重进、持久数据及重启后恢复。使用 B2 浏览器回归时设置 `WVN_QA_B2_ORIGIN=https://localhost:18895`：

```sh
docker compose --env-file state/compose/compose.env --profile b2 up -d --no-build --pull never
docker compose --env-file state/compose/compose.env up -d --no-deps --force-recreate --no-build --pull never --wait manager
docker compose --env-file state/compose/compose.env --profile qa run --rm --no-deps browser
```

浏览器会检查主站页面和账号入口、管理登录与引擎登记；启用 B2 验收时另检查 ONS、共享 RenPy 原生正文及退出重进。仅在远程机器运行，回执写入状态目录的 `reports/`。

管理启动令牌只能使用一次。每轮验收前，上述命令只重新创建本轮独立项目的 `manager` 并等待健康，以生成新令牌；已有管理会话随之失效。不要把该步骤用于生产管理实例。B2 候选策略按版本自动启用，不能把已验证运行时的 `?engine=` 参数混入候选验收。

## 数据与回退

停止服务时使用对应环境文件和 profiles 的 `stop`，保留目录与统计卷。数据库备份使用既有[备份与回退流程](rollback.md)，生成一致性 SQLite 快照，同时保留账号秘密、删除/分享账本和存档对象；不能直接把运行中的单个 SQLite 文件当作完整备份。

回退时恢复经过验收的镜像标签与配置，保留最新持久数据，再核对健康、原生存读档和历史。镜像回退不自动回灌旧数据库，也不覆盖新存档。

`ops/compose/production.env.example` 只提供生产覆盖项。真正切换前需单独授权，先把原数据、秘密和存储连接恢复到候选环境并完成验收，再调整入口代理。此轮不接管原 systemd 服务、Windows 存储进程、Tailscale、宿主代理或 Cloudflare 配置。

## B2 资源直链

后续公开资源切换使用 `ops/b2/compose.direct.yaml`，仅增加本地公开控制清单；浏览器直接向 `wg-b2.saop.cc` 获取游戏和引擎对象，账号服务不转发对象正文。配置、实际游戏验收和回退边界见 [B2 公开游戏资源直链](b2-resource-cutover.md)。前文 B2 profile 记录的是初次隔离预览，保留原部署，不作为此次直链发布路径；账号服务和私人存档的 Compose 迁移仍需分别安排。
