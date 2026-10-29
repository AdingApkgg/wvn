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

`ControlBundle` 是现有控制源 `{schema:1,entries:{[pilot]:{source,sha1,bytes}}}`，每次请求校验所选 source 的 SHA1 和 UTF-8 大小。此步骤不修改数据库或运行迁移；传入现有 `VersionResources` 和 `ResourceRepository` 实例。`accounts-server.ts` 在 B2 控制模式挂载该服务并接入播放器。

GET / HEAD `/api/player/:id/resources`：id 必须是现有 `players` 注册的 pilot，不能传任意版本 ID。唯一可选查询 `engine` 必须等于该作品登记引擎（RenPy 为配置的 `RENPY_RELEASE`）。重复、未知参数或不合法 engine 返回 400；未知作品、未发布/撤销版本或未发布依赖快照返回 404；数据库、映射完整性或配置异常返回通用 503，不包含数据库信息。

响应 `{schema:1,delivery:'cas',pilot,versionId,inventorySha256,resourceOrigin,resources,engineResources:{id,files},ons?}`。每个资源只有 `{path,key,url,sha256,bytes,contentType}`。path 保留数据库相对路径的大小写、Unicode、空格、#、%；不是 URL 编码。`resources` 按作品绑定范围分页取完，最多 60000 项，完整 JSON 不超过 32 MiB；重复路径、重复分页 cursor、清单摘要变化均拒绝。全部元数据校验 SHA、UUID、完整固定域 URL、非负安全整数大小和 MIME 语法。最终再次检查版本和共享快照发布状态；无服务端清单缓存，所有响应 `no-store, no-transform`。

共享资源固定来自同一已发布 namespace/inventory：

- ONS：`releases/20261027-01/games/clannad/onsyuri.js`、`onsyuri.wasm`，WASM SHA 必须匹配登记的引擎摘要。
- RenPy：`releases/20261027-01/engines/<RENPY_RELEASE>/renpy-pre.js`、`renpy.js`、`renpy.wasm`、`renpy.data`。
- Artemis / Tyrano 的引擎已在本作资源中，`engineResources.files` 为空。
- 媒体替代只使用 `ops/b2/public-assets.mjs` 的静态 media 表。按 `pilot + NUL + lowercase(path)` 找到唯一现有游戏路径，再读取 `releases/20261027-01/media/<登记文件名>` 的 PG 元数据覆盖该路径。不存在或多义即拒绝；其他作品媒体不会返回。

ONS 额外返回与旧控制清单同结构的 `ons`（pilot/title/versionId/engine/gamedir/savedir/args/resourceOrigin/files）。每个 file 保留原始 path、lazyload（默认 true），url 替换为所选游戏 PG 资源的根级 SHA URL；过滤 `.nomedia`，校验所有路径存在，禁止重复及跨路径控制 URL。旧资源端点不作修改。

`Accept-Encoding` 支持 gzip（含 q=0 禁用），设置 Vary 与精确 Content-Length。HEAD 仍执行全部发布和完整性校验，但不带正文，不支持条件请求复用已撤销清单。

## 播放器与同产物验收

`WG_B2_CONTROL_FILE` 模式现在挂载上述 API，并向播放器 loader 标记 `resourceDelivery: 'cas'`。父页面使用 omit credentials、no-store、redirect error 有界读取清单；经现有 nonce/专用 MessagePort 初始化 opaque iframe。旧 ONS manifest/data/engine、游戏正文和共享引擎端点在 CAS 模式返回 404，不跳转或回退。

非 ONS 原始入口放在惰性 template，直到清单验证完成才恢复 DOM、样式和按序脚本。同步映射覆盖 fetch/Request、原生同步/异步 XHR、Emscripten locateFile、属性赋值与 setAttribute、HTML 插入、内联样式及 CSSOM。外链 CSS 在浏览器按清单 URL 取得，解析 url()/@import 并处理循环后交回原生 link 的 Blob stylesheet；保留 link.sheet、media、disabled 和原生加载事件。原始远程对象从不改写或重新上传。CSS import 的 layer/supports 条件当前明确失败（实际外链样本仍须验收覆盖）；不以旧路径或网络代理掩盖不支持的语法。

未选择共享引擎时，RenPy 四文件取游戏 resources，保留原引擎及 legacy 存档身份；明确选择已登记共享 release 才使用 engineResources.files 和现有独立存档身份。本次只更换下载地址，不暗中更换引擎。ONS 虚拟文件名不变，缓存 URL 与 SHA 来自 CAS 清单，支持逻辑路径中的 Unicode、空格、#、%。现有 Range、原生事件、取消、readiness progress 和持久存档消息协议继续使用。

新增静态运行模块 `/player/cas-resources.mjs`、`/player/cas-dom.mjs` 已加入服务器 allowlist；React Router/Vite public 目录复制到 `build/client/player/`。部署必须使用同一次构建的 `build/client`、`build/server`，以及对应 `accounts-server.ts`、`src`、`public`、`ops/b2/public-assets.mjs` 和既有公开控制 JSON/引擎凭证。无需新增 Worker/SW/正文服务或存储 namespace。

严格验收驱动 `ops/b2/verify-browser.mjs` 要求 `WVN_CAS_EXPECTED_MANIFESTS`（独立 SQL 导出 `{ [pilot]: manifest }`），逐项核对 schema、版本、inventory 与 path/key/url/SHA/bytes/MIME。任何真实 CDN 请求不为已登记根级 SHA.bin，或游戏 iframe 向主站请求正文，都失败；禁用 canary 改写且不拦截/重写游戏流量。原生画面/正文、保存退出、重入的原有验收保留。合成 `tests/cas-dom.browser.mjs` 只用于单元夹具验证，不算真实游戏验收。

构建机同产物命令（由主流程在持久任务中加载隔离环境，证书路径按 QA 环境设置）：

```sh
cd /home/i/wvn-browser-direct-20261029/source
WVN_VERIFY_ORIGIN=https://localhost:28981 \
WVN_QA_CERT=/home/i/wvn-browser-direct-20261029/private/tls.crt \
WVN_CAS_EXPECTED_MANIFESTS=/home/i/wvn-browser-direct-20261029/reports/expected-browser-manifests.json \
WVN_B2_RELEASE_FILE=/home/i/wvn-browser-direct-20261029/private/runtime.json \
WVN_QA_OUTPUT_ROOT=/home/i/wvn-browser-direct-20261029/reports \
WVN_QA_PROXY=http://127.0.0.1:11090 \
WG_B2_BROWSER_RUN=browser-cas-direct \
node ops/b2/verify-browser.mjs
```

命令默认覆盖 ONS 两例、Artemis、Tyrano 和显式共享 RenPy；可追加这五个登记 ID 的子集进行失败诊断。完整79版本元数据对齐、无 Worker 的 CF 配置与 HTTP/MIME/Range/CORS验收仍由隔离 QA 主流程完成。启动命令或通过合成夹具不等于真实游戏通过。

## 实际 HTTP MIME 证明导入

公开 `contentType` 优先取物理对象的 `wvn_resource_objects.http_content_type`；未知时仍取各逻辑路径原有 `wvn_resources.content_type`。按 UUID、原路径、namespace、版本以及播放器依赖的查询采用同一规则。原始记录的 MIME、UUID、源/目标版本ID、路径、摘要、大小与创建时间均不改，根级 SHA URL 也不变。Redis 使用 schema=2 的负载信封；旧格式即使配置了自定义 prefix 也视为未命中。按key读取缓存时每批向PG核对当前公开MIME及发布状态；预热原MIME或并发迟到的旧写回均无法掩盖已提交的canonical类型，PG不可用时拒绝返回未经验证的缓存。

证明文件为 UTF-8 JSON，摘要必须针对完整文件原始字节计算：

```json
{"schema":1,"bucket":"web-visual-novel","namespace":"b2/web-visual-novel/snapshot-20261028","inventorySha256":"fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01","objects":[{"sha256":"<64位小写hex>","bytes":123,"contentType":"application/octet-stream","versionId":"<冻结B2精确版本ID>"}]}
```

每个 SHA 只能一行，可提交本次22个选定哈希的子集证明；只补写所列对象，未选对象保持原值。数据库按所选SHA聚合其在当前namespace的全部引用，每一条对应原记录的目标版本ID及大小均需吻合。文件由独立流程读取冻结精确 B2 版本的 HTTP 元数据产生；CLI 本身不请求 B2。只接受上述固定桶、namespace 和 inventory；证明中未知、多余、重复、未引用对象、版本/大小冲突、未发布快照或既有不同证明均拒绝。

```sh
npx tsx scripts/import-resource-http-metadata.ts \
  --proof /absolute/path/http-metadata-proof.json \
  --expected-proof-sha256 <完整文件SHA256> \
  --schema <明确PG_schema> \
  --namespace b2/web-visual-novel/snapshot-20261028 \
  --inventory fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01
```

连接从 `WG_RESOURCE_DATABASE_URL`（兜底 `WG_DATABASE_URL`、`DATABASE_URL`）读取；不写进命令或输出。默认 dry-run，旧 schema 也不执行迁移、不写数据库。审阅差异后显式追加 `--apply`：在同一事务内锁定成员表、对象表及快照，重新完整验证后应用新增007迁移并只写两个对象 HTTP 元数据字段；同一文件重复 apply 为零更新，冲突整笔回滚。003迁移保持原文。输出包括 status、namespace、inventorySha256、proofSha256、objects、resources、changed，失败只输出固定通用信息。生产写入须先完成隔离演练和差异审阅。
