# WebGAL 2026-10-27 归档导入

本轮仅接入 Alice 隔离预览，尚未发布生产。归档源站品牌为 WebGAL，实际 15 个可获取转换包均为 Artemis。

转存记录：290,665 个对象、58,961,797,257 字节，原全量 SHA-1 校验无差异。复用已冻结 CAS 映射，不重传或删除正文。资源请求由浏览器直达 `https://wg-b2.saop.cc/{sha256}.bin`，应用只承载目录、存档协议、元数据和可信启动 HTML。

新增 8 部作品，为 7 部既有作品追加独立版本，总计 72 部作品、94 个版本。保留原 79 版本的全部种子字段和引擎/存档身份，既有默认入口不变。新旧转换版存档互不自动混用。

| 游戏 | 作品 | 新版本 | 预览 |
|---|---|---|---|
| 宿星Girlfriend · WebGAL 2026-10-27 | v22880 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/22880/1/) |
| 宿星Girlfriend2 · WebGAL 2026-10-27 | v23290 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/23290/1/) |
| 宿星Girlfriend3 · WebGAL 2026-10-27 | v23772 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/23772/1/) |
| 常轨脱离Creative · WebGAL 2026-10-27 | v27449 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/27449/2/) |
| 常轨脱离 Creative 凸 · WebGAL 2026-10-27 | v33205 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/33205/2/) |
| 常轨脱离Creative Re:Re:call · WebGAL 2026-10-27 | v53590 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/53590/1/) |
| 树莓立方体 · WebGAL 2026-10-27 | v22847 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/22847/2/) |
| SELECT OBLIGE · WebGAL 2026-10-27 | v47175 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/47175/1/) |
| FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜 · WebGAL 2026-10-27 | v37021 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/37021/1/) |
| FLIP＊FLOP ～RAMBLING OVERRUN～ · WebGAL 2026-10-27 | v39197 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/39197/1/) |
| 繁花落舞恋如樱 · WebGAL 2026-10-27 | v1115 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/1115/2/) |
| 樱之诗 · WebGAL 2026-10-27 | v562 | 3 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/562/3/) |
| 樱之刻 · WebGAL 2026-10-27 | v20431 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/20431/2/) |
| ATRI · WebGAL 2026-10-27 | v27448 | 2 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/27448/2/) |
| 千之刃涛，桃花染之皇姬 · WebGAL 2026-10-27 | v15708 | 1 | [打开](https://localhost-1.tailac9c6f.ts.net:19482/15708/1/) |

《圣女不死心》（Saint-Necromancer）源站核心 JS/WASM/数据包缺失，只保留归档记录，不发布为可玩版本。

## 重复执行与校验

导入计划见 `data/imports/webgal-20261027.json`；作品身份来自 VNDB 官方公开 API，新增证据保存在 `data/vndb-evidence.json`。版本 UUID 由冻结来源决定，已有编号冲突会拒绝；版本资源路径绑定不可覆盖。

先导入已复核的资源快照，显式配置 `webgal_` 前缀 QA schema 和 `WG_DEPLOYMENT_MODE=preview`，执行：

```sh
node --import tsx scripts/import-webgal.ts
node --import tsx scripts/import-webgal.ts --apply
```

默认入口拒绝生产模式。已授权生产发布须显式添加 `--production --plan-sha256 <冻结计划文件的 SHA-256>`，且只接受 `catalog` / `resources` 正式 schema；未加 `--apply` 时仍仅预演。既有版本、默认入口和资源前缀均逐项比对；从原 79 版目录追加、再重复执行的远程演练已通过。没有读取、复制、修改用户账号或云存档。

可信启动控制包可单独生成，输出文件必须不存在：

```sh
node ops/b2/webgal-control.mjs --input original-control.json --output imported-control.json
```

这会核验并原样保留旧 79 项，为新 15 项生成最小启动 DOM；再次导入结果不变。远程生成的 94 项已与实际预览控制包逐项比较一致。

## 加载与兼容

- 启动包无 ETag 时按冻结摘要与大小分段读取；完整 SHA-256 验证通过后才交给引擎。失败片段有限重读，不串接未校验正文。
- CAS 地址统一使用 `.bin`；原生预载接口仍按原文件名复用已经验证的包，避免再下载整包。
- 每个转换包单独登记原生存档目录。保留源站扩展名别名与缺失探测的 404/error 分支；不执行上游预加载 IndexedDB、站点配置、Cloudflare 注入或统计脚本。
- 缺失的可选片头只触发媒体错误回退；已登记视频保持严格 CAS 读取，不生成成功占位资源。
- 两部 FLIP＊FLOP 和《樱之诗》的冻结包使用 Direct3D FX。只对三个版本、已核对的 WASM 和 28 个完整文本摘要进行浏览器内 GLSL 转换，保留纹理、坐标、透明度与滤镜运算。28 个程序均通过 WebGL 编译和链接，另有纹理像素校验；未知程序保持原样。

## 验收状态

远程 `validation-v8` 的 217 项 MJS 测试、258 项 TS/API 测试、构建和类型检查均通过。目录实际显示 72 部作品 / 94 个版本；“宿星”搜索返回 3 部，15 个作品的版本入口和资源清单均已在浏览器核对。

15 款均已通过启动画面、独立存档通道回写、退出重进、旧 pilot 隔离、严格 B2 直连以及启动包分段复用检查。逐批结果位于远程任务目录的 `reports/browser-final-all-v1`、`reports/browser-select-final-v1` 与 `reports/browser-graphics-release-v3`；失败首测也保留，最终按每个版本的复测结果判断。受图形兼容改动影响的三款均在最终构建复测，实际着色器编译错误为零。

新 ATRI 的 `native-atri-v10` 已通过真实菜单保存 `save0001.dat`、保存并退出、重新进入、槽位字节与时间戳保留、原生读取和同句剧情文字恢复。人物入场动画会改变整幅画面，验收比较带描边的剧情文字，并同时核对槽位字节；不会把菜单扫描文件或片头画面算作读档通过。原生与存档通道测试分别记录。

全部验收均在隔离预览与全新测试浏览器上下文执行，没有读取或修改用户历史存档。未声称全剧情、所有路线或全部设备均已验证。预览保留在 `https://localhost-1.tailac9c6f.ts.net:19482`，生产未发布。

远程任务根目录为 `/home/i/wvn-webgal-import-preview-20261029`，汇总记录位于 `reports/acceptance-summary.json`。其中包含每款游戏的截图指标、B2 请求数、分段复用和存档隔离结果，以及功能源文件与构建产物一致性复核。
