# 浏览器 CAS 资源清单

本模块只提供数据库元数据，不读取或转发正文；浏览器直接请求 `https://wg-b2.saop.cc/<sha256>.bin`。

## 挂载接口

```ts
import {CasManifestService, createCasManifestApp, RENPY_RELEASE} from './src/player/cas-manifest.server.ts';
const service = new CasManifestService(versionResources, resourceRepository, {
  document: controlBundle,
  namespace: 'b2/web-visual-novel/snapshot-20261028',
  inventorySha256: 'fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01',
  engineReleaseId: RENPY_RELEASE,
});
app.route('/', createCasManifestApp(service));
```

`ControlBundle` 是现有控制源 `{schema:1,entries:{[pilot]:{source,sha1,bytes}}}`，每次请求校验所选 source 的 SHA1 和 UTF-8 大小。此步骤不修改数据库或运行迁移；传入现有 `VersionResources` 和 `ResourceRepository` 实例。此次实现不挂载主服务，供后续播放器集成使用。

GET / HEAD `/api/player/:id/resources`：id 必须是现有 `players` 注册的 pilot，不能传任意版本 ID。唯一可选查询 `engine` 必须等于该作品登记引擎（RenPy 为配置的 `RENPY_RELEASE`）。重复、未知参数或不合法 engine 返回 400；未知作品、未发布/撤销版本或未发布依赖快照返回 404；数据库、映射完整性或配置异常返回通用 503，不包含数据库信息。

响应 `{schema:1,delivery:'cas',pilot,versionId,inventorySha256,resourceOrigin,resources,engineResources:{id,files},ons?}`。每个资源只有 `{path,key,url,sha256,bytes,contentType}`。path 保留数据库相对路径的大小写、Unicode、空格、#、%；不是 URL 编码。`resources` 按作品绑定范围分页取完，最多 60000 项，完整 JSON 不超过 32 MiB；重复路径、重复分页 cursor、清单摘要变化均拒绝。全部元数据校验 SHA、UUID、完整固定域 URL、非负安全整数大小和 MIME 语法。最终再次检查版本和共享快照发布状态；无服务端清单缓存，所有响应 `no-store, no-transform`。

共享资源固定来自同一已发布 namespace/inventory：

- ONS：`releases/20261027-01/games/clannad/onsyuri.js`、`onsyuri.wasm`，WASM SHA 必须匹配登记的引擎摘要。
- RenPy：`releases/20261027-01/engines/<RENPY_RELEASE>/renpy-pre.js`、`renpy.js`、`renpy.wasm`、`renpy.data`。
- Artemis / Tyrano 的引擎已在本作资源中，`engineResources.files` 为空。
- 媒体替代只使用 `ops/b2/public-assets.mjs` 的静态 media 表。按 `pilot + NUL + lowercase(path)` 找到唯一现有游戏路径，再读取 `releases/20261027-01/media/<登记文件名>` 的 PG 元数据覆盖该路径。不存在或多义即拒绝；其他作品媒体不会返回。

ONS 额外返回与旧控制清单同结构的 `ons`（pilot/title/versionId/engine/gamedir/savedir/args/resourceOrigin/files）。每个 file 保留原始 path、lazyload（默认 true），url 替换为所选游戏 PG 资源的根级 SHA URL；过滤 `.nomedia`，校验所有路径存在，禁止重复及跨路径控制 URL。旧资源端点不作修改。

`Accept-Encoding` 支持 gzip（含 q=0 禁用），设置 Vary 与精确 Content-Length。HEAD 仍执行全部发布和完整性校验，但不带正文，不支持条件请求复用已撤销清单。
