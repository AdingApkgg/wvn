# RenPy 片头媒体预览适配

`renpy-v50789-1` 的四段中、日文片头使用 MPEG-2 视频和 MP2 音频。实际浏览器报告 `Unable to decode audio data`，重启后停在 `renpy.movie_cutscene()`。本轮在 H 盘建立独立资源副本，把这四段转换成 VP8 / Vorbis WebM；保留 ZIP 内原路径，游戏脚本、原包和存档目录不变。

准备脚本为 `scripts/prepare-renpy-media-preview.ps1`，输出目录是 `H:\wvn-renpy-media-preview-20261026`。脚本拒绝覆盖既有输出目录，保留 62 GiB 空间保护，并核对分辨率、时长和音轨。所有项目文件写入 H 盘，调用机器已安装的 FFmpeg。

本轮原包 77,113,049 字节，SHA-256 为 `956b46d4b5307ea27e72844a15c2515bc1612dc62b9de98edf568eca46f8e3b3`。副本 75,846,045 字节，SHA-256 为 `26ecec618261be9ecf79ccc8d4bc24722bc7d4fb4bf5e9f6bb50d5a7a3c3137c`。除四段媒体外，1,197 个 ZIP 条目逐项摘要一致。原包摘要保持不变；校验时 H 盘空闲 135,210,577,920 字节。

## 资源边界

`scripts/renpy-media-preview-gateway.mjs` 只提供此版本的 `game.zip`，支持 GET、HEAD、单段 Range 和 ETag。启动时核对原包与副本的大小、SHA-256；其他路径全部返回 404。它是本轮独立预览进程，不修改已有资源服务或生产启动配置。

Web 端仅通过 `WG_PREVIEW_RESOURCE_PROJECTIONS` 读取预览投影清单。示例：

```json
{
  "schema": 1,
  "entries": [{
    "id": "renpy-v50789-1",
    "path": "game.zip",
    "upstream": "http://192.0.2.20:18575",
    "sha256": "26ecec618261be9ecf79ccc8d4bc24722bc7d4fb4bf5e9f6bb50d5a7a3c3137c",
    "bytes": 75846045
  }]
}
```

仅允许已登记 RenPy 版本的精确 `game.zip`，上游限 Tailscale IPv4，响应须与预期 ETag 和总长度相符。普通资源、引擎四件套和其他游戏仍走原资源服务；代理不传递账号 Cookie 或 Authorization。生产模式拒绝加载这份预览配置。

## 实际验收

Arch 的独立旧引擎验证入口为 `https://localhost:18569`，候选入口为 `https://localhost:18573`，各自使用独立空账号库。旧回执 `reports/renpy-media-case-20261026/` 与 `renpy-final-media-body-20261026-v3/` 仅覆盖制作说明检查点，不能作为正文兼容通过的依据。新的正文链路已通过：基线与候选回执在 `reports/renpy-final-media-body-20261026-v4/`，实际关闭并重启 Chromium 的回执在 `reports/renpy-final-media-restart-20261026-v5/`。检查点为 a1.rpy 正文“我是雷夫。”，推进后为下一句年龄对白，原生读档准确恢复较早检查点，字节、mtime 与历史保留。最终主预览通过预览专用投影接入副本，实际激活与保护回执见 `renpy-expansion-and-stats-acceptance.md`。

独立验证结果不自动改变主预览范围、生产资源或候选云存档隔离策略。
