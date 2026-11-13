# 第1组待核实版本补查（2026-11-14）

核查时间：2026-11-13T21:27:21Z。仅覆盖上一轮未定的6作9版本。未修改主分类或运行时。

## 结论

9个版本的研究决定仍为unknown。用户明确要求“待核实的直接按sfw”，由主任务统一应用展示默认；该默认不能记成已确认无色情。没有新证据的项目保留原歧义，未为增加完成数而升级。

## 本轮新增信息

- 君彼：简中RenPy条目r38393为hasEro=true；两个曾用于冲突判断的RenPy条目r124825/r127992都是俄文。语言差异已校正，但现有控制快照未记录包内语言或来源，仍不能只用中文标题确认移植。
- eden：补读r125816为含append的简中mini改编，但记录未标RenPy，不能绑定当前包。
- 大图书馆：搜索索引新增4GB ONS和本篇/FD合集说明，实际打开页未返回该资源正文；只记提示，不据此升级。
- NinNinDays补丁、雪女0.91/0.93、君彼RenPy精确检索未取得新资源证据；雪女+RenPy中的无关模板结果已排除。

## 访问边界

复用本任务已取回的公开VNDB完整发行索引，未重复整批API查询。旧KUN失败/NSFW确认入口不反复尝试，不进入登录或年龄门禁。未请求生产CAS、未下载游戏或补丁、未向外发送消息。

## 逐版本记录

### eden*（legacy-2bc9744f4a39fda45c162027）

研究决定：**unknown**。未找到当前RenPy转换版明确含PLUS+MOSAIC附加内容或明确去除成人内容的社区标记，继续unknown。

本轮发现：补读r125816备注：这是含append的简中mini改编，版本0.2/0.32；记录未标RenPy，不能把mini与当前转换包等同。新增精确检索未命中。

对应候选：[r2461](https://vndb.org/r2461)、[r4050](https://vndb.org/r4050)、[r35705](https://vndb.org/r35705)、[r35710](https://vndb.org/r35710)、[r63325](https://vndb.org/r63325)、[r107883](https://vndb.org/r107883)、[r125816](https://vndb.org/r125816)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- 基础eden*发行hasEro=false，PLUS+MOSAIC/R18与mini附加版hasEro=true。

- KUN作品条目合并eden*与PLUS+MOSAIC；旧RenPy网页版示例不说明附加内容。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/22)：R18（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/topic/1263)：RenPy网页版示例（索引）（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### NinNinDays（legacy-0a8a7282eb43a670959e29ae）

研究决定：**unknown**。Artemis引擎内同时有删改完整本体与18+完整本体，未找到当前版本已打R18补丁的资源说明，继续unknown。

本轮发现：针对作品名+R18补丁的KUN检索未命中；没有新发行/资源绑定证据。

对应候选：[r65403](https://vndb.org/r65403)、[r65404](https://vndb.org/r65404)、[r69822](https://vndb.org/r69822)、[r71865](https://vndb.org/r71865)、[r110546](https://vndb.org/r110546)、[r135915](https://vndb.org/r135915)、[r168865](https://vndb.org/r168865)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- r65403删改版与r69822无色情；r71865/r135915成人版与r65404官方R18补丁有色情。

- 原控制清单无补丁文件或来源标记，KUN作品R18不能区分当前Artemis分支。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/481)：R18；Artemis Engine（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### NinNinDays2（legacy-9eec48bf553b29f80a0cf3b6）

研究决定：**unknown**。NinNinDays2存在无色情本体、R18本体和独立补丁；新检索只返回原作品级引擎信息，不能确认当前包补丁状态，继续unknown。

本轮发现：KUN作品名+Artemis检索返回既有481/482作品条目，只增加/重复作品级信息，没有资源级补丁说明。

对应候选：[r84675](https://vndb.org/r84675)、[r85902](https://vndb.org/r85902)、[r86437](https://vndb.org/r86437)、[r86438](https://vndb.org/r86438)、[r87161](https://vndb.org/r87161)、[r168865](https://vndb.org/r168865)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- r84675/r85902无色情，r86438/r87161成人本体有色情，r86437为R18补丁。

- KUN同页R18及Artemis属于作品级；不能证明当前包应用了补丁。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/482)：R18；Artemis Engine（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 万华镜系列 · 万华镜6 demo（legacy-fe2406e269b2dc19be3a75ba）

研究决定：**unknown**。仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

本轮发现：新搜雪女demo0.91/demo0.93均无结果；雪女+RenPy只返回系列通用模板的无关作品，排除该结果。既有发行索引没有这四个demo版本。

对应候选：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- 日文/简中完整成人发行hasEro=true，未来简中Steam版r131795=false。

- KUN作品NSFW确认页是作品级展示门禁；没有进入门禁，不能据此逐版断言。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/99)：NSFW确认页（prior_round_nsfw_confirmation）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/39710)：未取得正文（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 万华镜系列 · 万华镜6 demo0.91（legacy-c193d7dd6680727121b1f9d6）

研究决定：**unknown**。仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

本轮发现：新搜雪女demo0.91/demo0.93均无结果；雪女+RenPy只返回系列通用模板的无关作品，排除该结果。既有发行索引没有这四个demo版本。

对应候选：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- 日文/简中完整成人发行hasEro=true，未来简中Steam版r131795=false。

- KUN作品NSFW确认页是作品级展示门禁；没有进入门禁，不能据此逐版断言。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/99)：NSFW确认页（prior_round_nsfw_confirmation）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/39710)：未取得正文（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 万华镜系列 · 万华镜6 demo0.92（legacy-ad49d61a350643ebf45d85b5）

研究决定：**unknown**。仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

本轮发现：新搜雪女demo0.91/demo0.93均无结果；雪女+RenPy只返回系列通用模板的无关作品，排除该结果。既有发行索引没有这四个demo版本。

对应候选：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- 日文/简中完整成人发行hasEro=true，未来简中Steam版r131795=false。

- KUN作品NSFW确认页是作品级展示门禁；没有进入门禁，不能据此逐版断言。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/99)：NSFW确认页（prior_round_nsfw_confirmation）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/39710)：未取得正文（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 万华镜系列 · 万华镜6 demo0.93（legacy-31cf96913037760bf3f22036）

研究决定：**unknown**。仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

本轮发现：新搜雪女demo0.91/demo0.93均无结果；雪女+RenPy只返回系列通用模板的无关作品，排除该结果。既有发行索引没有这四个demo版本。

对应候选：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- 日文/简中完整成人发行hasEro=true，未来简中Steam版r131795=false。

- KUN作品NSFW确认页是作品级展示门禁；没有进入门禁，不能据此逐版断言。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/99)：NSFW确认页（prior_round_nsfw_confirmation）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/39710)：未取得正文（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 君与彼女与彼女之恋（legacy-ece0d0fae22a134abcbf8b22）

研究决定：**unknown**。补读语言字段后确认简中RenPy候选r38393为有色情，另两个RenPy候选为俄文且内容标记不同；当前控制快照未记录实际文本语言或移植来源，不能仅凭中文目录标题确认r38393，研究仍unknown。

本轮发现：新增字段核查区分了语言：r38393=zh-Hans/完整/RenPy/true，r124825=ru/RenPy/true，r127992=ru/RenPy/false。旧“同引擎冲突”并不发生在同一语言内，但当前包对应仍未唯一确定。KUN君彼+RenPy检索未命中。

对应候选：[r38393](https://vndb.org/r38393)、[r124825](https://vndb.org/r124825)、[r127992](https://vndb.org/r127992)、[r71526](https://vndb.org/r71526)、[r84524](https://vndb.org/r84524)、[r110554](https://vndb.org/r110554)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- r38393简中成人RenPy与俄文RenPy删改版是不同分支；不能混称同语言内容冲突。

- 本目录标题为中文，不等同包内语言或具体移植版证据；旧控制快照没有该字段。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/112)：R18（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/2973)：Steam无和谐补丁（索引）（prior_round_inaccessible）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

用户展示默认：SFW，标明未核实；不是已确认none。

### 大图书馆的牧羊人（legacy-eec29e88f9c64b1a6ba50d5c）

研究决定：**unknown**。新增搜索索引出现明确4GB ONS及本篇/FD合集说明，但实际打开的KUN作品页未返回这些资源正文；尚不能确认当前ONS对应成人本篇而非无色情移植/试玩，继续unknown。

本轮发现：KUN精确ONS+R18搜索索引曾列Meousck的4GB模拟器资源（备注ons）与本篇+FD合集；实际open/find的407行作品页没有Meousck/4gb，仍只确认作品R18。将索引提示与可读正文区分，不升级分类。

对应候选：[r16537](https://vndb.org/r16537)、[r22604](https://vndb.org/r22604)、[r22618](https://vndb.org/r22618)、[r26097](https://vndb.org/r26097)、[r36588](https://vndb.org/r36588)、[r139609](https://vndb.org/r139609)、[r151369](https://vndb.org/r151369)。这些链接是索引定位，不冒称本轮逐页打开。

已知冲突：

- PC成人本篇hasEro=true；全年龄试玩、Library Party及其内容移植hasEro=false。

- 原控制只证明ONS及nscript.dat路径；具体来源未记录。

来源与访问状态：

- [VNDB / release](https://api.vndb.org/kana/release)：逐条核对hasEro/engine/languages/patch/releaseType（existing_public_api_snapshot_read）。本轮读取仓库完整发行索引；没有重复请求API，未声称单独打开每个发行网页。

- [KUNGal / work](https://www.kungal.com/galgame/654)：R18（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/48825)：模拟器；泛称KRKR/Tyranor/ONS（prior_round_opened）。沿用前轮已记录的访问与限制；不重新尝试已失败两次/确认页入口。

- [KUNGal / work](https://www.kungal.com/galgame/654)：年龄字段R18；搜索索引ONS资源未在可读正文找到（current_round_opened）。新open及两次不同文本find用于验证新搜索结果，不是对旧失败入口重复重试。

用户展示默认：SFW，标明未核实；不是已确认none。
