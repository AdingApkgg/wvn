# 39版续查与用户指定SFW默认策略

北京时间：2026-11-14T05:31:02+08:00。只更新隔离预览，未修改生产。

## 结果

- 续查39个未决版本，2个由社区移植分支标记确定为含成人性内容：绘缘蜜恋、飞鸟会长不肯认输。
- 其余37个仍缺唯一的版次/补丁对应证据。按用户明确指令“待核实的直接按sfw”，本轮默认SFW；不是确认无成人内容。
- 94版最终生效分类：44个NSFW、50个SFW。其中SFW为原有13个社区无成人标记，加37个用户指定未核实默认值。未核实研究结论仍为37，不因默认策略清零。

## 策略与证据分别保存

- 生效字段 `sexualContent=none` 用于执行本轮SFW默认；`source=user-default:sfw-unverified:...` 和理由保留用户指定、未核实及原歧义。逐版审计另存 `researchDecision=unknown`，没有伪造社区或官方无成人内容结论。
- 两个新确定项使用 `community:VNDB:` 来源；Artemis Windows/Android完整分支为成人标记，旧冲突来自Switch。属于社区版次推定，没有声称与本站文件逐字节相同。
- 详情页与管理列表对默认值显示“默认 SFW · 未核实”；筛选选项显示“SFW（含默认）”。不会显示为“已确认不含成人性内容”。
- 只处理本轮39条；已明确成人的42条、其他已决13条未被SFW默认覆盖。页面/图片独立审核与未知记录的通用访问规则未改。年龄字段与版本标题审核不变。

## 证据入口

- [本轮逐版生效与研究结果](../data/version-followup-20261114.json)。
- [第1组补查](version-followup-group-1-20261114.md)、[第2组补查](version-followup-group-2-20261114.md)、[第3组补查](version-followup-group-3-20261114.md)。
- [前轮94版社区审计](version-nsfw-review-20261114.md)与[发行事实索引](../data/version-release-index-20261114.json)保留历史，不将当前默认值反写为历史研究结论。

## 逐版本结果

| 版本 | 研究结论 | 当前处理 | 依据/剩余歧义 |
| --- | --- | --- | --- |
| [eden*](#legacy-2bc9744f4a39fda45c162027) · `legacy-2bc9744f4a39fda45c162027` | `unknown` | 默认SFW，未核实 | 未找到当前RenPy转换版明确含PLUS+MOSAIC附加内容或明确去除成人内容的社区标记，继续unknown。 |
| [NinNinDays](#legacy-0a8a7282eb43a670959e29ae) · `legacy-0a8a7282eb43a670959e29ae` | `unknown` | 默认SFW，未核实 | Artemis引擎内同时有删改完整本体与18+完整本体，未找到当前版本已打R18补丁的资源说明，继续unknown。 |
| [NinNinDays2](#legacy-9eec48bf553b29f80a0cf3b6) · `legacy-9eec48bf553b29f80a0cf3b6` | `unknown` | 默认SFW，未核实 | NinNinDays2存在无色情本体、R18本体和独立补丁；新检索只返回原作品级引擎信息，不能确认当前包补丁状态，继续unknown。 |
| [万华镜系列 · 万华镜6 demo](#legacy-fe2406e269b2dc19be3a75ba) · `legacy-fe2406e269b2dc19be3a75ba` | `unknown` | 默认SFW，未核实 | 仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。 |
| [万华镜系列 · 万华镜6 demo0.91](#legacy-c193d7dd6680727121b1f9d6) · `legacy-c193d7dd6680727121b1f9d6` | `unknown` | 默认SFW，未核实 | 仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。 |
| [万华镜系列 · 万华镜6 demo0.92](#legacy-ad49d61a350643ebf45d85b5) · `legacy-ad49d61a350643ebf45d85b5` | `unknown` | 默认SFW，未核实 | 仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。 |
| [万华镜系列 · 万华镜6 demo0.93](#legacy-31cf96913037760bf3f22036) · `legacy-31cf96913037760bf3f22036` | `unknown` | 默认SFW，未核实 | 仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。 |
| [君与彼女与彼女之恋](#legacy-ece0d0fae22a134abcbf8b22) · `legacy-ece0d0fae22a134abcbf8b22` | `unknown` | 默认SFW，未核实 | 补读语言字段后确认简中RenPy候选r38393为有色情，另两个RenPy候选为俄文且内容标记不同；当前控制快照未记录实际文本语言或移植来源，不能仅凭中文目录标题确认r38393，研究仍unknown。 |
| [大图书馆的牧羊人](#legacy-eec29e88f9c64b1a6ba50d5c) · `legacy-eec29e88f9c64b1a6ba50d5c` | `unknown` | 默认SFW，未核实 | 新增搜索索引出现明确4GB ONS及本篇/FD合集说明，但实际打开的KUN作品页未返回这些资源正文；尚不能确认当前ONS对应成人本篇而非无色情移植/试玩，继续unknown。 |
| [少女理论及其周边](#legacy-2a67a4d4f50f9f8b69621a75) · `legacy-2a67a4d4f50f9f8b69621a75` | `unknown` | 默认SFW，未核实 | 新找到2024年安卓/Tyranor资源帖，确认这种移植确实存在，但正文未写成人补丁或删减状态；VNDB简中Artemis本体为false、另有18+补丁true，目录版本无法区分。 |
| [常规脱离creative凸](#legacy-c89356e75eb8577e08dda1e1) · `legacy-c89356e75eb8577e08dda1e1` | `unknown` | 默认SFW，未核实 | 已核对同为Artemis的日文成人发行和简中Steam剪辑DLC，以及独立18+补丁；KUN的Tyranor资源与合集存在，但没有可把当前两个目录版本对应为已打补丁的新增说明。 |
| [常轨脱离 Creative 凸 · WebGAL 2026-10-27](#c8005fb2-d1bc-5392-b97a-0f305c97fb2b) · `c8005fb2-d1bc-5392-b97a-0f305c97fb2b` | `unknown` | 默认SFW，未核实 | 已核对同为Artemis的日文成人发行和简中Steam剪辑DLC，以及独立18+补丁；KUN的Tyranor资源与合集存在，但没有可把当前两个目录版本对应为已打补丁的新增说明。 |
| [常轨脱离Creative](#legacy-79060b38748739bd8e64e718) · `legacy-79060b38748739bd8e64e718` | `unknown` | 默认SFW，未核实 | 逐条复核发现解密移植补丁r96548自身虽false，但备注明确把Steam中文译文移到原始R18游戏；这能证明存在成人中文移植路线，仍不能证明当前目录版本采用此路线还是未打18+补丁的Steam版。 |
| [常轨脱离Creative · WebGAL 2026-10-27](#6a43fdcc-d01c-5754-9bd0-dd660ea6d80f) · `6a43fdcc-d01c-5754-9bd0-dd660ea6d80f` | `unknown` | 默认SFW，未核实 | 逐条复核发现解密移植补丁r96548自身虽false，但备注明确把Steam中文译文移到原始R18游戏；这能证明存在成人中文移植路线，仍不能证明当前目录版本采用此路线还是未打18+补丁的Steam版。 |
| [拔作岛1](#legacy-156b1273e3d67dc3ec603fd2) · `legacy-156b1273e3d67dc3ec603fd2` | `unknown` | 默认SFW，未核实 | 新查到KUN 1&2 PC/Ty移植帖，索引称小鳥遊暁移植、第一部有官中/民汉双版本；原页面本轮超时，不再重试。帖中文字没有成人补丁已应用信息，现有Artemis版本仍无法排除剪辑版。 |
| [拔作岛2](#legacy-589e8be3f37d376dd02787fe) · `legacy-589e8be3f37d376dd02787fe` | `unknown` | 默认SFW，未核实 | 同一KUN PC/Ty 1&2帖子提供新增移植线索，但未说明第二部成人补丁应用；VNDB明确存在约一小时剪辑版和完整成人版且均可关联Artemis，因此继续待核实。 |
| [树莓立方体](#legacy-3ab8194b66d726bd4279e3b4) · `legacy-3ab8194b66d726bd4279e3b4` | `unknown` | 默认SFW，未核实 | 针对Artemis、Tyranor、18+ DLC和资源补丁作了定向搜索，结果仍仅作品级R18/引擎资料；发行表有Steam剪辑、主机非色情与原PC/安卓成人分支，两个目录版本均未增加版次或补丁标记。 |
| [树莓立方体 · WebGAL 2026-10-27](#cbc04bd1-9eaa-51db-906e-d434742211f8) · `cbc04bd1-9eaa-51db-906e-d434742211f8` | `unknown` | 默认SFW，未核实 | 针对Artemis、Tyranor、18+ DLC和资源补丁作了定向搜索，结果仍仅作品级R18/引擎资料；发行表有Steam剪辑、主机非色情与原PC/安卓成人分支，两个目录版本均未增加版次或补丁标记。 |
| [樱之刻](#legacy-f71101d6acb2871ade48bcec) · `legacy-f71101d6acb2871ade48bcec` | `unknown` | 默认SFW，未核实 | 重新区分完整PSV移植、中文基础译补与H场景译补。检索绿茶/Ty/H场景后仍未找到可把两个目录版本对应至特定分支的新增资源说明；18+评级不能覆盖PSV移植has_ero=false。 |
| [樱之刻 · WebGAL 2026-10-27](#d6b4fc84-a347-5a28-9184-579085dadfa1) · `d6b4fc84-a347-5a28-9184-579085dadfa1` | `unknown` | 默认SFW，未核实 | 重新区分完整PSV移植、中文基础译补与H场景译补。检索绿茶/Ty/H场景后仍未找到可把两个目录版本对应至特定分支的新增资源说明；18+评级不能覆盖PSV移植has_ero=false。 |
| [樱之诗 · WebGAL 2026-10-27](#33224257-9a7b-5d77-b690-2c0fd9643a48) · `33224257-9a7b-5d77-b690-2c0fd9643a48` | `unknown` | 默认SFW，未核实 | 本轮只补查仍unknown的Artemis/WebGAL目录版，不重查已决RenPy两版。针对PSV/Artemis/WebGAL后，仍有完整PSV无色情标记、周年成人版及剪辑恢复补丁三路；没有来源指出本站2026-10-27转换采用哪路。 |
| [死宅天使](#legacy-1b0a56130aa4fb6a5d073fdf) · `legacy-1b0a56130aa4fb6a5d073fdf` | `unknown` | 默认SFW，未核实 | 本轮又用死宅天使、日文原名检索VNDB/KUN，仍未找到可确认的作品映射；没有新增内容标记。标题不能替代证据，研究结论继续unknown。 |
| [甜蜜夏日](#legacy-a045f2a8a2d68503bd00418c) · `legacy-a045f2a8a2d68503bd00418c` | `unknown` | 默认SFW，未核实 | Artemis Windows分支确实同时有删减版r120379和成人版r120388，另有成人恢复补丁r120386；中文汉化r107145为成人标记，但没有当前版本采用哪条支线的新资料。旧KUN439作品R18未增加版次信息，继续unknown。 |
| [真实动漫情境体验2](#legacy-0749431b49cb164e3a98470d) · `legacy-0749431b49cb164e3a98470d` | `unknown` | 默认SFW，未核实 | Artemis Windows中r118656为删减版、r118657为成人版，r124424为成人补丁；KUN检索仍主要为此前失败的12602/12607资源摘要，无法确认当前Artemis包采用成人原作还是删减版。没有新增正文确证，继续unknown。 |
| [神社里的猫巫女](#legacy-7f849d5bf9b1405c681b5df4) · `legacy-7f849d5bf9b1405c681b5df4` | `unknown` | 默认SFW，未核实 | 同一Artemis引擎存在r61791删减版及r63067成人版，中文Windows补丁r81886标true，Switch中文补丁r126235标false且平台不同。未取得当前资源成人恢复状态的新正文；原有KUN245的R18是作品级，继续unknown。 |
| [秽翼的尤斯蒂娅](#legacy-5d0fc085f59f8b32b0607d9a) · `legacy-5d0fc085f59f8b32b0607d9a` | `unknown` | 默认SFW，未核实 | 新增可读KUN话题385确认社区有ONS移植，另由小鳥遊曉跨引擎移植Tyranor；话题没有成人保留/删减说明。新发现资源246的PC+ONS仅可见搜索摘要，open失败。VNDB中文Windows译补true与主机false仍不能直接锁定本站ONS资源，继续unknown。 |
| [繁花落舞恋如樱](#legacy-be3af7162b3b095755065f3f) · `legacy-be3af7162b3b095755065f3f` | `unknown` | 默认SFW，未核实 | 同Artemis的Re:BIRTH日文完整版和多语言删减版r113495共存，r123732为对应成人补丁。原作/完全版/重制版还共用作品编号。两个站点版本都未新增具体补丁状态或汉化来源正文，继续unknown。 |
| [繁花落舞恋如樱 · WebGAL 2026-10-27](#933436a8-85f5-5a76-9568-5f29faff9785) · `933436a8-85f5-5a76-9568-5f29faff9785` | `unknown` | 默认SFW，未核实 | 同Artemis的Re:BIRTH日文完整版和多语言删减版r113495共存，r123732为对应成人补丁。原作/完全版/重制版还共用作品编号。两个站点版本都未新增具体补丁状态或汉化来源正文，继续unknown。 |
| [绘缘蜜恋](#legacy-eb649752b9b3b9ec088e1b24) · `legacy-eb649752b9b3b9ec088e1b24` | `present` | NSFW（社区版次标记） | 细分既有VNDB索引后发现，原先混合值只来自Switch版r106645；完整Windows/Android的Artemis主游戏r82859/r88669/r100137均hasEro=true，中文Windows译补r95812也为true。未发现同平台删减分支。按用户接受社区标记的口径，可将本站Artemis中文版本推定为present；这是平台/引擎分支推定，未声称包内实测。 |
| [虚之少女HD](#legacy-33474c5ab851410a1da3491a) · `legacy-33474c5ab851410a1da3491a` | `unknown` | 默认SFW，未核实 | Windows Artemis成人版r108126与Steam/GOG删减部分版r108187共存，另有成人DLC r122059；中文Artemis Vita移植r125264又为false。站点HD标题不能证明已包含成人DLC，也不能仅因complete过滤排除可能部署的部分删减版。本轮没有新增对应资源正文，继续unknown。 |
| [野良与皇女与流浪猫之心1](#legacy-503f16b56d7c648804d85b51) · `legacy-503f16b56d7c648804d85b51` | `unknown` | 默认SFW，未核实 | Artemis安卓r100126标true，Artemis Switch/PS4版r57708/r60261标false；Windows中文原作r56340则为KiriKiri，Steam版r61773也为KiriKiri且false。当前Artemis转换来源没有新标记，不能单凭引擎等同安卓成人版，继续unknown。 |
| [野良与皇女与流浪猫之心2](#legacy-8675748d868a788562284aaa) · `legacy-8675748d868a788562284aaa` | `unknown` | 默认SFW，未核实 | Artemis安卓r100127标true，而主机Artemis r61855为false；Steam Windows r65571为KiriKiri且false，中文原作译补为true。旧KUN1381正文是KRKR安卓资源，与本站Artemis不直接相同。本轮没有新的成人状态对应，继续unknown。 |
| [青空下的约定](#legacy-b2daa513541305560c3fcbae) · `legacy-b2daa513541305560c3fcbae` | `unknown` | 默认SFW，未核实 | 原作中文译补r7558标true，PSP中文译补r10915及Refine中文r134678标false；没有ONS发行记录。新搜到KUN34276的摘要称原作+重制+ONS/TY合集，但open失败且本身混合版次；不能把合集标题当本站ONS内容。继续unknown。 |
| [飞鸟会长不肯认输](#legacy-78cfdb60c00f9fe6d0dd1e44) · `legacy-78cfdb60c00f9fe6d0dd1e44` | `present` | NSFW（社区版次标记） | 细分既有VNDB索引后，唯一false主游戏是Switch版r104712；Artemis Windows/Android完整发行r94944/r100670/r104480/r104965均hasEro=true，中文Windows译补r104941也为true。没有同平台删减分支，按社区引擎/平台分支推定本站Artemis中文版本为present；KUN261本轮超时未作新增佐证。 |
| [宿星Girlfriend · WebGAL 2026-10-27](#ef49dd01-c904-518f-aba7-50a36d46c596) · `ef49dd01-c904-518f-aba7-50a36d46c596` | `unknown` | 默认SFW，未核实 | Artemis Windows的多语言删减版r112087与成人版r116696并存，另有成人DLC r114252；中文译补r63497为true。WebGAL日期只是迁移标题，不能替代成人补丁状态；旧KUN902作品R18没有提供新版本绑定，继续unknown。 |
| [宿星Girlfriend2 · WebGAL 2026-10-27](#2db31864-3a96-519e-be67-b75cac750691) · `2db31864-3a96-519e-be67-b75cac750691` | `unknown` | 默认SFW，未核实 | 多语言Windows成人版r120834和删减版r120835并存，成人DLC为r120836；中文原作译补r65252为true。当前Artemis/WebGAL转换没有新增版本/补丁描述，旧KUN903缓存未见独立成人状态，继续unknown。 |
| [宿星Girlfriend3 · WebGAL 2026-10-27](#8949d767-3c75-5d50-ac5d-1e0693108a6a) · `8949d767-3c75-5d50-ac5d-1e0693108a6a` | `unknown` | 默认SFW，未核实 | 多语言Windows删减版r124632、成人版r124633与成人DLC r124634并存；Artemis安卓r82606虽为true，也不能覆盖当前WebGAL转换。此次KUN检索仍只得到作品聚合标签和旧904索引，无新增正文确证，继续unknown。 |
| [SELECT OBLIGE · WebGAL 2026-10-27](#d872fbdb-a9a4-550e-8699-928cacc9750e) · `d872fbdb-a9a4-550e-8699-928cacc9750e` | `unknown` | 默认SFW，未核实 | Artemis Windows成人原作r113440/r125675及完整多语言版r129116为true，但Steam删减部分版r125601为false，成人内容补丁r129115另列；中文译补亦有多条。即使完整发行过滤后只剩true，仍不能排除当前包就是部分删减版。本轮没有补丁状态新证据，继续unknown。 |
| [千之刃涛，桃花染之皇姬 · WebGAL 2026-10-27](#476a1807-cfd5-5e67-8772-5ca53e9b616c) · `476a1807-cfd5-5e67-8772-5ca53e9b616c` | `unknown` | 默认SFW，未核实 | Artemis主机PS4/Vita/Switch发行r52690/r56201/r89038等均false；原PC成人版、中文译补r60169与后续英文/中文版r146548为true，但原PC并非这些主机Artemis记录。当前WebGAL转换没有明确保留性场景标签，旧KUN408的R18为作品级；继续unknown。 |

## 修订明细

### legacy-2bc9744f4a39fda45c162027

eden*（v1286，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：未找到当前RenPy转换版明确含PLUS+MOSAIC附加内容或明确去除成人内容的社区标记，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-2bc9744f4a39fda45c162027`；修订 2 → 3。
- 社区发行参考：[r2461](https://vndb.org/r2461)、[r4050](https://vndb.org/r4050)、[r35705](https://vndb.org/r35705)、[r35710](https://vndb.org/r35710)、[r63325](https://vndb.org/r63325)、[r107883](https://vndb.org/r107883)、[r125816](https://vndb.org/r125816)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-0a8a7282eb43a670959e29ae

NinNinDays（v26310，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis引擎内同时有删改完整本体与18+完整本体，未找到当前版本已打R18补丁的资源说明，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-0a8a7282eb43a670959e29ae`；修订 2 → 3。
- 社区发行参考：[r65403](https://vndb.org/r65403)、[r65404](https://vndb.org/r65404)、[r69822](https://vndb.org/r69822)、[r71865](https://vndb.org/r71865)、[r110546](https://vndb.org/r110546)、[r135915](https://vndb.org/r135915)、[r168865](https://vndb.org/r168865)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-9eec48bf553b29f80a0cf3b6

NinNinDays2（v32805，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：NinNinDays2存在无色情本体、R18本体和独立补丁；新检索只返回原作品级引擎信息，不能确认当前包补丁状态，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-9eec48bf553b29f80a0cf3b6`；修订 2 → 3。
- 社区发行参考：[r84675](https://vndb.org/r84675)、[r85902](https://vndb.org/r85902)、[r86437](https://vndb.org/r86437)、[r86438](https://vndb.org/r86438)、[r87161](https://vndb.org/r87161)、[r168865](https://vndb.org/r168865)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-fe2406e269b2dc19be3a75ba

万华镜系列 · 万华镜6 demo（v44184，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-fe2406e269b2dc19be3a75ba`；修订 2 → 3。
- 社区发行参考：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-c193d7dd6680727121b1f9d6

万华镜系列 · 万华镜6 demo0.91（v44184，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-c193d7dd6680727121b1f9d6`；修订 2 → 3。
- 社区发行参考：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-ad49d61a350643ebf45d85b5

万华镜系列 · 万华镜6 demo0.92（v44184，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-ad49d61a350643ebf45d85b5`；修订 2 → 3。
- 社区发行参考：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-31cf96913037760bf3f22036

万华镜系列 · 万华镜6 demo0.93（v44184，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：仍未找到当前RenPy demo、demo0.91、demo0.92或demo0.93的精确社区内容标记；正式版成人标签不能覆盖这四个转换试玩，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-31cf96913037760bf3f22036`；修订 2 → 3。
- 社区发行参考：[r106553](https://vndb.org/r106553)、[r122247](https://vndb.org/r122247)、[r122272](https://vndb.org/r122272)、[r122351](https://vndb.org/r122351)、[r123596](https://vndb.org/r123596)、[r123935](https://vndb.org/r123935)、[r131795](https://vndb.org/r131795)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-ece0d0fae22a134abcbf8b22

君与彼女与彼女之恋（v7738，RenPy）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：补读语言字段后确认简中RenPy候选r38393为有色情，另两个RenPy候选为俄文且内容标记不同；当前控制快照未记录实际文本语言或移植来源，不能仅凭中文目录标题确认r38393，研究仍unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-ece0d0fae22a134abcbf8b22`；修订 2 → 3。
- 社区发行参考：[r38393](https://vndb.org/r38393)、[r124825](https://vndb.org/r124825)、[r127992](https://vndb.org/r127992)、[r71526](https://vndb.org/r71526)、[r84524](https://vndb.org/r84524)、[r110554](https://vndb.org/r110554)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-eec29e88f9c64b1a6ba50d5c

大图书馆的牧羊人（v8158，ONS）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：新增搜索索引出现明确4GB ONS及本篇/FD合集说明，但实际打开的KUN作品页未返回这些资源正文；尚不能确认当前ONS对应成人本篇而非无色情移植/试玩，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-eec29e88f9c64b1a6ba50d5c`；修订 2 → 3。
- 社区发行参考：[r16537](https://vndb.org/r16537)、[r22604](https://vndb.org/r22604)、[r22618](https://vndb.org/r22618)、[r26097](https://vndb.org/r26097)、[r36588](https://vndb.org/r36588)、[r139609](https://vndb.org/r139609)、[r151369](https://vndb.org/r151369)
- [具体补查](version-followup-group-1-20261114.md)。

### legacy-2a67a4d4f50f9f8b69621a75

少女理论及其周边（v12246，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：新找到2024年安卓/Tyranor资源帖，确认这种移植确实存在，但正文未写成人补丁或删减状态；VNDB简中Artemis本体为false、另有18+补丁true，目录版本无法区分。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-2a67a4d4f50f9f8b69621a75`；修订 2 → 3。
- 社区发行参考：[r112220](https://vndb.org/r112220)、[r116700](https://vndb.org/r116700)、[r47964](https://vndb.org/r47964)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-c89356e75eb8577e08dda1e1

常规脱离creative凸（v33205，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：已核对同为Artemis的日文成人发行和简中Steam剪辑DLC，以及独立18+补丁；KUN的Tyranor资源与合集存在，但没有可把当前两个目录版本对应为已打补丁的新增说明。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-c89356e75eb8577e08dda1e1`；修订 2 → 3。
- 社区发行参考：[r92864](https://vndb.org/r92864)、[r118911](https://vndb.org/r118911)、[r137422](https://vndb.org/r137422)、[r91861](https://vndb.org/r91861)、[r99366](https://vndb.org/r99366)
- [具体补查](version-followup-group-2-20261114.md)。

### c8005fb2-d1bc-5392-b97a-0f305c97fb2b

常轨脱离 Creative 凸 · WebGAL 2026-10-27（v33205，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：已核对同为Artemis的日文成人发行和简中Steam剪辑DLC，以及独立18+补丁；KUN的Tyranor资源与合集存在，但没有可把当前两个目录版本对应为已打补丁的新增说明。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#c8005fb2-d1bc-5392-b97a-0f305c97fb2b`；修订 2 → 3。
- 社区发行参考：[r92864](https://vndb.org/r92864)、[r118911](https://vndb.org/r118911)、[r137422](https://vndb.org/r137422)、[r91861](https://vndb.org/r91861)、[r99366](https://vndb.org/r99366)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-79060b38748739bd8e64e718

常轨脱离Creative（v27449，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：逐条复核发现解密移植补丁r96548自身虽false，但备注明确把Steam中文译文移到原始R18游戏；这能证明存在成人中文移植路线，仍不能证明当前目录版本采用此路线还是未打18+补丁的Steam版。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-79060b38748739bd8e64e718`；修订 2 → 3。
- 社区发行参考：[r94751](https://vndb.org/r94751)、[r96409](https://vndb.org/r96409)、[r96548](https://vndb.org/r96548)、[r81957](https://vndb.org/r81957)、[r74630](https://vndb.org/r74630)
- [具体补查](version-followup-group-2-20261114.md)。

### 6a43fdcc-d01c-5754-9bd0-dd660ea6d80f

常轨脱离Creative · WebGAL 2026-10-27（v27449，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：逐条复核发现解密移植补丁r96548自身虽false，但备注明确把Steam中文译文移到原始R18游戏；这能证明存在成人中文移植路线，仍不能证明当前目录版本采用此路线还是未打18+补丁的Steam版。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#6a43fdcc-d01c-5754-9bd0-dd660ea6d80f`；修订 2 → 3。
- 社区发行参考：[r94751](https://vndb.org/r94751)、[r96409](https://vndb.org/r96409)、[r96548](https://vndb.org/r96548)、[r81957](https://vndb.org/r81957)、[r74630](https://vndb.org/r74630)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-156b1273e3d67dc3ec603fd2

拔作岛1（v22899，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：新查到KUN 1&2 PC/Ty移植帖，索引称小鳥遊暁移植、第一部有官中/民汉双版本；原页面本轮超时，不再重试。帖中文字没有成人补丁已应用信息，现有Artemis版本仍无法排除剪辑版。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-156b1273e3d67dc3ec603fd2`；修订 2 → 3。
- 社区发行参考：[r106546](https://vndb.org/r106546)、[r106550](https://vndb.org/r106550)、[r109478](https://vndb.org/r109478)、[r74485](https://vndb.org/r74485)、[r161402](https://vndb.org/r161402)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-589e8be3f37d376dd02787fe

拔作岛2（v23741，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：同一KUN PC/Ty 1&2帖子提供新增移植线索，但未说明第二部成人补丁应用；VNDB明确存在约一小时剪辑版和完整成人版且均可关联Artemis，因此继续待核实。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-589e8be3f37d376dd02787fe`；修订 2 → 3。
- 社区发行参考：[r109469](https://vndb.org/r109469)、[r109486](https://vndb.org/r109486)、[r119477](https://vndb.org/r119477)、[r93808](https://vndb.org/r93808)、[r161402](https://vndb.org/r161402)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-3ab8194b66d726bd4279e3b4

树莓立方体（v22847，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：针对Artemis、Tyranor、18+ DLC和资源补丁作了定向搜索，结果仍仅作品级R18/引擎资料；发行表有Steam剪辑、主机非色情与原PC/安卓成人分支，两个目录版本均未增加版次或补丁标记。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-3ab8194b66d726bd4279e3b4`；修订 2 → 3。
- 社区发行参考：[r56464](https://vndb.org/r56464)、[r61468](https://vndb.org/r61468)、[r63257](https://vndb.org/r63257)、[r97485](https://vndb.org/r97485)、[r97935](https://vndb.org/r97935)、[r100133](https://vndb.org/r100133)、[r65542](https://vndb.org/r65542)
- [具体补查](version-followup-group-2-20261114.md)。

### cbc04bd1-9eaa-51db-906e-d434742211f8

树莓立方体 · WebGAL 2026-10-27（v22847，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：针对Artemis、Tyranor、18+ DLC和资源补丁作了定向搜索，结果仍仅作品级R18/引擎资料；发行表有Steam剪辑、主机非色情与原PC/安卓成人分支，两个目录版本均未增加版次或补丁标记。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#cbc04bd1-9eaa-51db-906e-d434742211f8`；修订 2 → 3。
- 社区发行参考：[r56464](https://vndb.org/r56464)、[r61468](https://vndb.org/r61468)、[r63257](https://vndb.org/r63257)、[r97485](https://vndb.org/r97485)、[r97935](https://vndb.org/r97935)、[r100133](https://vndb.org/r100133)、[r65542](https://vndb.org/r65542)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-f71101d6acb2871ade48bcec

樱之刻（v20431，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：重新区分完整PSV移植、中文基础译补与H场景译补。检索绿茶/Ty/H场景后仍未找到可把两个目录版本对应至特定分支的新增资源说明；18+评级不能覆盖PSV移植has_ero=false。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-f71101d6acb2871ade48bcec`；修订 2 → 3。
- 社区发行参考：[r49417](https://vndb.org/r49417)、[r90502](https://vndb.org/r90502)、[r100278](https://vndb.org/r100278)、[r124135](https://vndb.org/r124135)、[r125266](https://vndb.org/r125266)、[r138444](https://vndb.org/r138444)
- [具体补查](version-followup-group-2-20261114.md)。

### d6b4fc84-a347-5a28-9184-579085dadfa1

樱之刻 · WebGAL 2026-10-27（v20431，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：重新区分完整PSV移植、中文基础译补与H场景译补。检索绿茶/Ty/H场景后仍未找到可把两个目录版本对应至特定分支的新增资源说明；18+评级不能覆盖PSV移植has_ero=false。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#d6b4fc84-a347-5a28-9184-579085dadfa1`；修订 2 → 3。
- 社区发行参考：[r49417](https://vndb.org/r49417)、[r90502](https://vndb.org/r90502)、[r100278](https://vndb.org/r100278)、[r124135](https://vndb.org/r124135)、[r125266](https://vndb.org/r125266)、[r138444](https://vndb.org/r138444)
- [具体补查](version-followup-group-2-20261114.md)。

### 33224257-9a7b-5d77-b690-2c0fd9643a48

樱之诗 · WebGAL 2026-10-27（v562，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：本轮只补查仍unknown的Artemis/WebGAL目录版，不重查已决RenPy两版。针对PSV/Artemis/WebGAL后，仍有完整PSV无色情标记、周年成人版及剪辑恢复补丁三路；没有来源指出本站2026-10-27转换采用哪路。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#33224257-9a7b-5d77-b690-2c0fd9643a48`；修订 2 → 3。
- 社区发行参考：[r125267](https://vndb.org/r125267)、[r139142](https://vndb.org/r139142)、[r138443](https://vndb.org/r138443)、[r160476](https://vndb.org/r160476)、[r160486](https://vndb.org/r160486)、[r157916](https://vndb.org/r157916)、[r82144](https://vndb.org/r82144)
- [具体补查](version-followup-group-2-20261114.md)。

### legacy-1b0a56130aa4fb6a5d073fdf

死宅天使（b315601，Tyrano）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：本轮又用死宅天使、日文原名检索VNDB/KUN，仍未找到可确认的作品映射；没有新增内容标记。标题不能替代证据，研究结论继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-1b0a56130aa4fb6a5d073fdf`；修订 2 → 3。
- 社区发行参考：未找到可匹配记录。
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-a045f2a8a2d68503bd00418c

甜蜜夏日（v34848，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis Windows分支确实同时有删减版r120379和成人版r120388，另有成人恢复补丁r120386；中文汉化r107145为成人标记，但没有当前版本采用哪条支线的新资料。旧KUN439作品R18未增加版次信息，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-a045f2a8a2d68503bd00418c`；修订 2 → 3。
- 社区发行参考：[r89188](https://vndb.org/r89188)、[r107145](https://vndb.org/r107145)、[r120379](https://vndb.org/r120379)、[r120386](https://vndb.org/r120386)、[r120388](https://vndb.org/r120388)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-0749431b49cb164e3a98470d

真实动漫情境体验2（v27436，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis Windows中r118656为删减版、r118657为成人版，r124424为成人补丁；KUN检索仍主要为此前失败的12602/12607资源摘要，无法确认当前Artemis包采用成人原作还是删减版。没有新增正文确证，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-0749431b49cb164e3a98470d`；修订 2 → 3。
- 社区发行参考：[r70784](https://vndb.org/r70784)、[r118656](https://vndb.org/r118656)、[r118657](https://vndb.org/r118657)、[r124424](https://vndb.org/r124424)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-7f849d5bf9b1405c681b5df4

神社里的猫巫女（v25170，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：同一Artemis引擎存在r61791删减版及r63067成人版，中文Windows补丁r81886标true，Switch中文补丁r126235标false且平台不同。未取得当前资源成人恢复状态的新正文；原有KUN245的R18是作品级，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-7f849d5bf9b1405c681b5df4`；修订 2 → 3。
- 社区发行参考：[r61791](https://vndb.org/r61791)、[r61792](https://vndb.org/r61792)、[r63067](https://vndb.org/r63067)、[r81886](https://vndb.org/r81886)、[r126235](https://vndb.org/r126235)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-5d0fc085f59f8b32b0607d9a

秽翼的尤斯蒂娅（v3770，ONS）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：新增可读KUN话题385确认社区有ONS移植，另由小鳥遊曉跨引擎移植Tyranor；话题没有成人保留/删减说明。新发现资源246的PC+ONS仅可见搜索摘要，open失败。VNDB中文Windows译补true与主机false仍不能直接锁定本站ONS资源，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-5d0fc085f59f8b32b0607d9a`；修订 2 → 3。
- 社区发行参考：[r15164](https://vndb.org/r15164)、[r144698](https://vndb.org/r144698)、[r163962](https://vndb.org/r163962)、[r49044](https://vndb.org/r49044)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-be3af7162b3b095755065f3f

繁花落舞恋如樱（v1115，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：同Artemis的Re:BIRTH日文完整版和多语言删减版r113495共存，r123732为对应成人补丁。原作/完全版/重制版还共用作品编号。两个站点版本都未新增具体补丁状态或汉化来源正文，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-be3af7162b3b095755065f3f`；修订 2 → 3。
- 社区发行参考：[r89646](https://vndb.org/r89646)、[r113495](https://vndb.org/r113495)、[r123732](https://vndb.org/r123732)
- [具体补查](version-followup-group-3-20261114.md)。

### 933436a8-85f5-5a76-9568-5f29faff9785

繁花落舞恋如樱 · WebGAL 2026-10-27（v1115，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：同Artemis的Re:BIRTH日文完整版和多语言删减版r113495共存，r123732为对应成人补丁。原作/完全版/重制版还共用作品编号。两个站点版本都未新增具体补丁状态或汉化来源正文，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#933436a8-85f5-5a76-9568-5f29faff9785`；修订 2 → 3。
- 社区发行参考：[r89646](https://vndb.org/r89646)、[r113495](https://vndb.org/r113495)、[r123732](https://vndb.org/r123732)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-eb649752b9b3b9ec088e1b24

绘缘蜜恋（v32183，Artemis）。研究 `present`，生效 `present`，用户默认 `False`。

按VNDB对应Artemis桌面/安卓移植分支的社区标记更新；不再混用Switch版标记。细分既有VNDB索引后发现，原先混合值只来自Switch版r106645；完整Windows/Android的Artemis主游戏r82859/r88669/r100137均hasEro=true，中文Windows译补r95812也为true。未发现同平台删减分支。按用户接受社区标记的口径，可将本站Artemis中文版本推定为present；这是平台/引擎分支推定，未声称包内实测。 本结论为社区版本推定，不是包内逐场景实测或官方年龄认证。

- 来源：`community:VNDB:docs/version-followup-20261114.md#legacy-eb649752b9b3b9ec088e1b24`；修订 2 → 3。
- 社区发行参考：[r82859](https://vndb.org/r82859)、[r88669](https://vndb.org/r88669)、[r100137](https://vndb.org/r100137)、[r95812](https://vndb.org/r95812)、[r106645](https://vndb.org/r106645)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-33474c5ab851410a1da3491a

虚之少女HD（v5922，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Windows Artemis成人版r108126与Steam/GOG删减部分版r108187共存，另有成人DLC r122059；中文Artemis Vita移植r125264又为false。站点HD标题不能证明已包含成人DLC，也不能仅因complete过滤排除可能部署的部分删减版。本轮没有新增对应资源正文，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-33474c5ab851410a1da3491a`；修订 2 → 3。
- 社区发行参考：[r108126](https://vndb.org/r108126)、[r108187](https://vndb.org/r108187)、[r122059](https://vndb.org/r122059)、[r125264](https://vndb.org/r125264)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-503f16b56d7c648804d85b51

野良与皇女与流浪猫之心1（v18148，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis安卓r100126标true，Artemis Switch/PS4版r57708/r60261标false；Windows中文原作r56340则为KiriKiri，Steam版r61773也为KiriKiri且false。当前Artemis转换来源没有新标记，不能单凭引擎等同安卓成人版，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-503f16b56d7c648804d85b51`；修订 2 → 3。
- 社区发行参考：[r56340](https://vndb.org/r56340)、[r57708](https://vndb.org/r57708)、[r60261](https://vndb.org/r60261)、[r61773](https://vndb.org/r61773)、[r100126](https://vndb.org/r100126)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-8675748d868a788562284aaa

野良与皇女与流浪猫之心2（v19841，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis安卓r100127标true，而主机Artemis r61855为false；Steam Windows r65571为KiriKiri且false，中文原作译补为true。旧KUN1381正文是KRKR安卓资源，与本站Artemis不直接相同。本轮没有新的成人状态对应，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-8675748d868a788562284aaa`；修订 2 → 3。
- 社区发行参考：[r61855](https://vndb.org/r61855)、[r62309](https://vndb.org/r62309)、[r65571](https://vndb.org/r65571)、[r100127](https://vndb.org/r100127)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-b2daa513541305560c3fcbae

青空下的约定（v182，ONS）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：原作中文译补r7558标true，PSP中文译补r10915及Refine中文r134678标false；没有ONS发行记录。新搜到KUN34276的摘要称原作+重制+ONS/TY合集，但open失败且本身混合版次；不能把合集标题当本站ONS内容。继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#legacy-b2daa513541305560c3fcbae`；修订 2 → 3。
- 社区发行参考：[r7558](https://vndb.org/r7558)、[r10915](https://vndb.org/r10915)、[r134678](https://vndb.org/r134678)
- [具体补查](version-followup-group-3-20261114.md)。

### legacy-78cfdb60c00f9fe6d0dd1e44

飞鸟会长不肯认输（v37843，Artemis）。研究 `present`，生效 `present`，用户默认 `False`。

按VNDB对应Artemis桌面/安卓移植分支的社区标记更新；不再混用Switch版标记。细分既有VNDB索引后，唯一false主游戏是Switch版r104712；Artemis Windows/Android完整发行r94944/r100670/r104480/r104965均hasEro=true，中文Windows译补r104941也为true。没有同平台删减分支，按社区引擎/平台分支推定本站Artemis中文版本为present；KUN261本轮超时未作新增佐证。 本结论为社区版本推定，不是包内逐场景实测或官方年龄认证。

- 来源：`community:VNDB:docs/version-followup-20261114.md#legacy-78cfdb60c00f9fe6d0dd1e44`；修订 2 → 3。
- 社区发行参考：[r94944](https://vndb.org/r94944)、[r100670](https://vndb.org/r100670)、[r104480](https://vndb.org/r104480)、[r104712](https://vndb.org/r104712)、[r104941](https://vndb.org/r104941)、[r104965](https://vndb.org/r104965)
- [具体补查](version-followup-group-3-20261114.md)。

### ef49dd01-c904-518f-aba7-50a36d46c596

宿星Girlfriend · WebGAL 2026-10-27（v22880，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis Windows的多语言删减版r112087与成人版r116696并存，另有成人DLC r114252；中文译补r63497为true。WebGAL日期只是迁移标题，不能替代成人补丁状态；旧KUN902作品R18没有提供新版本绑定，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#ef49dd01-c904-518f-aba7-50a36d46c596`；修订 2 → 3。
- 社区发行参考：[r63497](https://vndb.org/r63497)、[r112087](https://vndb.org/r112087)、[r114252](https://vndb.org/r114252)、[r116696](https://vndb.org/r116696)
- [具体补查](version-followup-group-3-20261114.md)。

### 2db31864-3a96-519e-be67-b75cac750691

宿星Girlfriend2 · WebGAL 2026-10-27（v23290，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：多语言Windows成人版r120834和删减版r120835并存，成人DLC为r120836；中文原作译补r65252为true。当前Artemis/WebGAL转换没有新增版本/补丁描述，旧KUN903缓存未见独立成人状态，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#2db31864-3a96-519e-be67-b75cac750691`；修订 2 → 3。
- 社区发行参考：[r65252](https://vndb.org/r65252)、[r120834](https://vndb.org/r120834)、[r120835](https://vndb.org/r120835)、[r120836](https://vndb.org/r120836)
- [具体补查](version-followup-group-3-20261114.md)。

### 8949d767-3c75-5d50-ac5d-1e0693108a6a

宿星Girlfriend3 · WebGAL 2026-10-27（v23772，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：多语言Windows删减版r124632、成人版r124633与成人DLC r124634并存；Artemis安卓r82606虽为true，也不能覆盖当前WebGAL转换。此次KUN检索仍只得到作品聚合标签和旧904索引，无新增正文确证，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#8949d767-3c75-5d50-ac5d-1e0693108a6a`；修订 2 → 3。
- 社区发行参考：[r65253](https://vndb.org/r65253)、[r82606](https://vndb.org/r82606)、[r124632](https://vndb.org/r124632)、[r124633](https://vndb.org/r124633)、[r124634](https://vndb.org/r124634)
- [具体补查](version-followup-group-3-20261114.md)。

### d872fbdb-a9a4-550e-8699-928cacc9750e

SELECT OBLIGE · WebGAL 2026-10-27（v47175，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis Windows成人原作r113440/r125675及完整多语言版r129116为true，但Steam删减部分版r125601为false，成人内容补丁r129115另列；中文译补亦有多条。即使完整发行过滤后只剩true，仍不能排除当前包就是部分删减版。本轮没有补丁状态新证据，继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#d872fbdb-a9a4-550e-8699-928cacc9750e`；修订 2 → 3。
- 社区发行参考：[r113440](https://vndb.org/r113440)、[r125601](https://vndb.org/r125601)、[r125675](https://vndb.org/r125675)、[r129115](https://vndb.org/r129115)、[r129116](https://vndb.org/r129116)
- [具体补查](version-followup-group-3-20261114.md)。

### 476a1807-cfd5-5e67-8772-5ca53e9b616c

千之刃涛，桃花染之皇姬 · WebGAL 2026-10-27（v15708，Artemis）。研究 `unknown`，生效 `none`，用户默认 `True`。

按用户明确要求“待核实的直接按sfw”，本轮未核实版本默认按SFW处理；不是已确认不含成人性内容或官方年龄评级。研究仍未核实：Artemis主机PS4/Vita/Switch发行r52690/r56201/r89038等均false；原PC成人版、中文译补r60169与后续英文/中文版r146548为true，但原PC并非这些主机Artemis记录。当前WebGAL转换没有明确保留性场景标签，旧KUN408的R18为作品级；继续unknown。

- 来源：`user-default:sfw-unverified:docs/version-followup-20261114.md#476a1807-cfd5-5e67-8772-5ca53e9b616c`；修订 2 → 3。
- 社区发行参考：[r52690](https://vndb.org/r52690)、[r56201](https://vndb.org/r56201)、[r60169](https://vndb.org/r60169)、[r89038](https://vndb.org/r89038)、[r146548](https://vndb.org/r146548)
- [具体补查](version-followup-group-3-20261114.md)。

## 远程验证

- 336项单元测试、类型检查、生产构建、38项UI回归、2项页面/后台截图用例均通过，无跳过（`jobs/default-verify-01/`，exit 0）。
- 资格说明修改后另跑15项单文件回归通过；题目、选项、正确答案和其他代码与基线一致（`jobs/default-quiz-proof-01/`，exit 0）。
- 隔离库94条与原审计加本轮覆盖逐字段一致：44 present、50 none，其中37条来源为user-default。
- 浏览器验证默认项显示未核实、公共入口可用、SFW筛选包含默认值；已知成人继续要求资格。仅验标签/入口/准入，不宣称逐包完整试玩。
- 预览：[M3隔离预览](https://localhost-1.tailac9c6f.ts.net:24883/)。仅更新隔离预览，未发布生产。
