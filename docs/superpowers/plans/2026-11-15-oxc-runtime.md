# TypeScript 运行器迁移到 Oxc

用户同意保留 Vite / Rolldown，并处理引入 esbuild 的 tsx 执行链。本轮只修改代码与独立远程验证，不发布或重启生产。现有未提交的统计和 oRPC 改造保留。

## 选择

采用 `node --import @oxc-node/core/register`。Node 原生类型擦除不支持 TSX，项目还使用构造器参数属性，因此不直接改为裸 Node 执行。Oxc 加载器负责 TS/TSX 转换，Vite 8 继续负责应用构建，Biome 负责格式与 lint，TypeScript 继续独立类型检查。

## 实施与验收

1. 先写运行器兼容性测试，覆盖 TSX、无扩展名相对引用、tsconfig 路径别名、参数属性、JSON 导入与子进程。远程确认新加载器尚未安装导致失败，再安装并运行。
2. 移除 tsx，增加精确版本的 Oxc core。同步 npm 命令、Docker/Compose、测试子进程、Linux/Windows 启动与 QA 脚本。Windows 旧进程归属检查兼容旧 tsx 与新加载器，保留原有路径、父进程等约束。
3. 仅在独立目录安装依赖并生成锁文件。核对锁文件、安装树与生产依赖不再包含 esbuild/tsx；不把后缀 `.tsx` 或组件生成器的 TSX 选项当作运行器依赖删除。
4. 专用测试库运行全量测试及补充 mjs 测试；类型检查、应用构建、OpenAPI 输出；用独立预览验证实际账号服务、后台图表和导航。Docker/Compose 配置验证，Windows 仅静态核对，明确真实 Windows 运行证据边界。
5. 复核代码，记录实际结果和剩余限制，不覆盖其他会话工作、不改生产。

## 验收结果

已完成代码迁移，尚未发布生产。锁定 `@oxc-node/core@1.0.2` 为生产依赖，删除 tsx；安装树和锁文件包条目中不再包含 tsx / esbuild / @esbuild 平台包。Vite 自带的可选 peer 声明仍保留，未篡改依赖元数据。

远程根目录 `/home/i/wvn-oxc-runtime-20261115`，主机 `localhost-1.tailac9c6f.ts.net`（hostname `localhost`）；所有长任务由专用 tmux 运行，脚本/日志/退出码位于 `jobs/<任务ID>/`：

- `red-01`：安装前新运行器测试因缺少加载器失败；`install-01` 安装后通过。
- `regression-01`：独占 PostgreSQL 18.6 测试库；类型检查、应用构建、OpenAPI 生成通过；376 项 TS 测试、248 项 mjs 测试全部通过。
- `image-01`：使用已缓存 Node 24 slim 基础镜像（`node@sha256:6642ef280aebc09c4541bee0b15c9f89f0f3f3c247ddee79ae1d37eddfdcbbaa`）覆盖构建参数，完成 runtime 镜像。裁剪 devDependencies 后，在 UID 1000、只读文件系统、无网络容器内成功加载账号服务模块及 tsconfig 路径别名。未替换 Dockerfile 默认基础镜像摘要，未部署镜像。
- `checks-01`：Shell 语法及 Compose storage/b2 配置通过（仅配置验证，使用合成密码，无服务启动）；锁文件实际包条目无旧运行器；`final-checks-01` 新测试文件 Biome 无错误/警告，最终运行器兼容测试通过，`npm ls esbuild tsx --all` 为空。
- `bootstrap-01`：新的 Oxc HTTPS 预览成功注册测试账号；`browser-01` 10 项浏览器测试全部通过，覆盖管理员动态授权/撤销、个人主页公开/关闭及无 JS、后台 320/390/768/1440px、编辑冲突与审计、失败重试、图表切换和按需加载。
- Windows 脚本完成静态审查：scoped 模块参数引用及旧进程正则兼容已修正。真实 Windows 上尚未执行，不能用 Linux 验收代替。
- 代码审查的重要问题均已修复并复核，无剩余 Important / Critical。独占测试库已停止，保留数据和日志；独立开发预览保留运行。

剩余 npm audit 为既有 Hono / node-server 两项 moderate；移除旧 esbuild 后其 low 项消失。本轮未进行无关框架升级。历史归档中的 tsx 执行记录保留，不作为当前运行命令；当前命令以 package.json / Dockerfile 和本说明为准。
