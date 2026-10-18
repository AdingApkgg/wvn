# WG Manager

React Router 8 framework SSR、Hono、Vite 8、TypeScript 与 SQLite 的作品/版本目录。原游戏文件保留在 Windows `H:\wg`，应用只保存元数据和资源映射。当前为隔离预览，未切生产。

## 路由与数据

作品 `/27448/`，版本 `/27448/1/`。首次导入按旧首页顺序分配；编号只增不减，删除登记不复用。修复版、视频替换版是独立版本；续作、FD 使用独立 VNDB 作品编号。展示排序与 URL 编号分开。

`data/catalog.json` 是 reviewed seed；`data/vndb-evidence.json` 保存查询证据。79 个原始条目中，78 个版本已映射到 63 部作品；《死宅天使》在 Bangumi 作者列表核实为《尼特与天使与色色家族》（PC / 3D，2020-03-06），VNDB 未确认，保留 pending，不虚构数字编号。详见 `data/metadata-exceptions.json`。

目录查询、版本页和启动器由公开 listener 提供；原始执行入口保持同路径并在数字版本页 iframe 内运行，避免改变存档命名。**预览与正式域名是不同 origin，存档不自动互通。** 不宣称所有作品完整可玩。

## 开发与验证

Mac 只编辑；安装、构建、类型检查、完整测试与浏览器回归在远程。Linux 构建机为 `build.example.invalid`，工作目录 `/home/wvn/wg-manager-preview`；确认 `hostname` 后，通过已有 11090 代理安装。

```sh
HTTPS_PROXY=http://127.0.0.1:11090 HTTP_PROXY=http://127.0.0.1:11090 npm ci --include=dev --legacy-peer-deps
npm test
NODE_ENV=development npm run typecheck
NODE_ENV=production npm run build
sh tests/e2e/run-remote.sh
```

测试 worker 上限为 1；跨进程编号测试明确只启动两个小进程。Windows Node 24 运行构建产物，内置 `node:sqlite`，不依赖原生 SQLite 扩展。Drizzle 提供 schema 与类型化 SQL 编译；当前锁定版没有文档中所述 node-sqlite adapter，因此由 DatabaseSync 执行已编译查询。

## 远程预览

Windows 独立目录 `H:\wg-manager-preview-20261019`；公开预览 `127.0.0.1:8281`，私有管理 `127.0.0.1:8282/manage`。所有 listener 强制绑定回环，不开放局域网端口，不改原 CaddyWG。

```sh
ssh -N -L 18281:127.0.0.1:8281 -L 18282:127.0.0.1:8282 storage.example.invalid
```

然后访问 `http://127.0.0.1:18281/`、`http://127.0.0.1:18282/manage`。管理令牌在远程 `state/admin-token`，只使用一次，交换 8 小时 HttpOnly/SameSite Strict 会话；不写进日志、URL 或仓库。使用 SSH 读取并在页面输入。重启预览会生成新令牌并清空会话。

管理支持显示名、别名、默认版本、版本语言/说明/排序/隐藏、不可复用的删除登记、纠正作品归属、待匹配确认、人工核实新作品登记与验证报告导入。不提供 shell、批量转换、源文件删除或服务操作。报告的自由文本只在私有接口中返回。

## 检查与回滚

`node scripts/verify-preview.mjs` 逐条检查作品页、固定版本页、旧资源入口、SSR 数据路由与公开/私有隔离。`scripts/browser-preview.ps1` 在 Windows 启动自有独立 Chrome profile 检查 ATRI、CLANNAD；使用现有代理，调试端口仅回环，检查结束关闭自己的浏览器。

浏览器通用 IndexedDB 探针与游戏内保存/读档是两项不同证据。公开切换还必须验证正式 origin 下已有存档、完整映射和每个引擎兼容性。详见 [验收记录](docs/preview-acceptance.md) 和 [回滚](docs/rollback.md)。
