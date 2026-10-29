# WVN

**Web Visual Novel · 在线视觉小说**

WVN 用浏览器运行视觉小说，并统一管理作品目录、引擎版本、账号、云存档和存档分享。

- **作品与版本**：通过 VNDB / Bangumi 整理标题、封面、截图、简介和标签；作品使用 `/27448/`，版本使用 `/27448/1/`。没有确认 VNDB 编号时使用 `b` 前缀的 Bangumi 编号。
- **统一播放器**：接入 ONScripterYuri、Artemis、Ren’Py 和 Tyrano；游戏运行在隔离沙箱中，与账号接口分开。
- **存档**：Passkey 账号、私人云存档、历史版本、旧档导入、公开分享及链接分享。
- **加载体验**：启动阶段和游玩过程的资源加载反馈，按实际可测数据展示百分比、大小与速度；ONS 支持有容量限制的 IndexedDB 缓存和空闲预加载。
- **引擎管理**：登记 Emscripten SDK、源码构建配方、不可变产物和逐版本兼容验收；保留旧引擎及存档身份。
- **统计**：阅读、点赞、收藏汇总，以及独立的 Umami 访问分析。

线上站点：[wg.saop.cc](https://wg.saop.cc/)。本仓库提供应用源码、目录元数据和构建配方，不包含游戏资源包、账号数据库、私人存档、部署密钥或引擎构建产物。目录与启动检查不等于所有作品、全部剧情均已验收。

## 技术栈

React 19、React Router 8、Hono、Vite 8、TypeScript、PostgreSQL、Redis、Meilisearch、shadcn/ui、Tailwind CSS、Better Auth / Passkey、Emscripten / WebAssembly、WS / WebRTC / coturn / WebTransport。

## 开发与构建

需要 Node.js 24 或以上。以下命令在自己的构建或部署机器执行，依赖下载使用该机器配置的代理：

```sh
npm ci --include=dev --legacy-peer-deps
# 先配置独立 wvn_qa PG / Redis / Meili，测试不会使用业务数据库。
npm test
node --test --test-concurrency=1 tests/*.test.mjs
NODE_ENV=development npm run typecheck
NODE_ENV=production npm run build
```

首次创建独立目录数据库时，可运行 `npm run seed` 导入仓库中的示例目录和来源元数据。不要用初始化导入替代现有数据库的增量更新、备份和迁移。

目录服务通过 `npm start` 启动，默认公开 listener 与私有管理 listener 都只绑定回环地址。游戏资源位置由 `WG_RESOURCE_ROOT` 提供；需要自行准备兼容且有权使用的资源。管理侧转换来源清单通过 `WG_INVENTORY_FILE` 指向私有文件，仓库默认只提供空模板。

账号服务入口为 `npm run start:accounts`，需要单独配置 HTTPS origin、TLS 文件、数据库、存档对象目录、服务端密钥文件及审核后台。参考 [配置示例](.env.example) 和 [账号说明](docs/accounts-preview.md)。示例没有可直接使用的服务端密钥，正式环境也不应沿用预览凭据。

## 目录结构

| 目录 | 用途 |
| --- | --- |
| `src/` | 页面、账号、目录、分享、统计及资源接口 |
| `public/ons/`、`public/player/` | 统一播放器、存档协议与引擎适配 |
| `engines/` | SDK 锁、构建配方、产物登记与版本绑定 |
| `scripts/` | 初始化、验证、受控引擎构建与部署工具 |
| `tests/` | 行为、协议、HTTP 与浏览器回归 |
| `ops/analytics/` | 独立 Umami / PostgreSQL 容器配置 |
| `docs/` | 功能说明、历史验收边界和部署参考 |

代码中的 `WG_*` 环境变量及部分 `wg-*` 内部标识沿用历史兼容名称，产品名称统一为 WVN。

## 功能与部署说明

- [PostgreSQL 平台、迁移与回滚](docs/platform-postgres.md)、[生产切换记录](docs/production-platform-20261029.md)、[资源 key API](docs/resource-api.md)
- [Meilisearch 搜索](docs/search.md)、[PG 备份恢复](docs/pg-backups.md)、[房间与联机基础](docs/rooms.md)

- [公开仓库与私有配置边界](docs/public-repository.md)
- [SQLite 阶段 Compose 历史参考](docs/compose-deployment.md)；当前 PG 基础服务使用 `ops/platform/compose.yaml`
- [账号与云存档](docs/accounts-preview.md)、[存档分享](docs/save-sharing-preview.md)
- [Emscripten 统一管理](docs/emscripten-management.md)、[Ren’Py 云存档兼容](docs/renpy-cloud-saves.md)
- [启动加载反馈](docs/player-loading.md)、[ONS 资源缓存](docs/ons-resource-cache.md)
- [统计](docs/public-stats.md)、[封面布局](docs/cover-gallery.md)

历史部署脚本保留环境校验；其中的主机、地址和个人目录已替换为示例值，使用前需要按自己的环境适配。旧档路径属于游戏运行时兼容协议，不能因为目录整理而随意改名。预览与生产是不同 origin，浏览器存档及 Passkey 凭据不会自动迁移。
