# SHA-256 资源命名与 SQLite 映射实施计划

用户已确认采用完整 SHA-256，并追加要求使用 `.bin` 后缀，最终对象名为 `{sha256}.bin`；数据库的 `sha256` 仍只保存 64 位原始摘要。当前范围只包含重命名和 SQLite 记录，API、CF 缓存、播放器和生产切换随后处理。

## 设计

- 提供独立、无第三方依赖的 Node 24 迁移命令。源文件保留，在独立输出目录生成 `{sha256}.bin` 对象，随后可以原样上传到 `web-visual-novel` 桶根。
- 对完整文件流式计算 SHA-256，不截断、不转码。同内容去重，原目录和原文件名保存在 SQLite。
- `resource_objects(sha256 PRIMARY KEY, bytes)`；`resource_paths(namespace, original_path, sha256 REFERENCES resource_objects, content_type, PRIMARY KEY(namespace, original_path))`。类型属于路径映射，兼容相同字节使用不同原扩展名。
- 每个命名空间标识一个游戏版本或资源批次；已有路径不允许被不同内容静默替换。所有映射在一个事务中提交。失败时已生成的不可变对象可留待重跑，原文件不动。
- 默认预演，不创建输出目录和数据库；`--apply` 才写入。源目录、对象目录和数据库不得相互污染；拒绝符号链接及非普通文件。
- 已存在的目标必须重新校验完整摘要和大小，不覆盖同名损坏对象。拒绝将账号库、作品目录库等已有数据库误用为本次独立映射库。

## 实施与验证

1. [x] `tests/resource-cas.test.mjs`：先在构建机观察命令不存在的失败，再测试预演、同名不同内容、同内容不同名、重复运行、旧映射冲突、损坏对象、事务回滚、目录隔离、符号链接、Unicode 原路径、SQLite FK/CHECK 与陌生数据库保护。
2. [x] `scripts/migration/resource-cas.mjs`：实现流式暂存、完整摘要、禁止覆盖的对象发布、SQLite 事务、CLI 参数和 JSON 汇总；不调用任何云服务，不修改生产数据。
3. [x] `docs/sha256-resources.md`：记录数据库结构、预演和执行命令、失败恢复方式与阶段边界；远程运行专用测试及必要回归，自审后按功能提交。

## 进度

- 已建立独立分支 `codex/sha256-assets`；远程构建机 `localhost-1.tailac9c6f.ts.net` 的实际 hostname 为 `localhost`，Node v24.19.0。
- 实现沿用现有 JavaScript ESM 和 `node:sqlite`，不引入依赖；本阶段不建立 API 或通用存储提供商层。
- 专用测试先确认功能缺失时 8 项失败，实现后远程 8/8 通过；补充跨读取块二进制及源文件独立性验证后，最终远程 9/9 通过，`--help` 入口正常。
- `.bin` 规则调整先确认旧实现有 4 项命名或保护测试失败，修改实现后远程再次 9/9 通过；哈希列、原路径和 MIME 记录保持原语义。
- 已自审完整暂存差异，`git diff --cached --check` 无空白问题；独立脚本未改任何应用入口。测试日志保存在构建机 `reports/resource-cas-tests.txt`。
- 已确认 WebGAL 本地归档与转存清单均为 290,665 个文件，无缺失、无多余项；已启动该批次的全量只读摘要预演。真实数据 apply 和 B2 写入范围等待用户选择。
