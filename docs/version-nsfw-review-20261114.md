# 94个版本的NSFW社区标记核查

核查时间：`2026-11-13T21:15:19.999Z`。范围：72作、94版本，隔离预览；未修改生产。

结论：含成人性内容 **42**，无成人性内容 **13**，待核实 **39**。

本轮先查官网/发行版/补丁，后按用户明确指令“去vndb和kungal找标记就行”采用社区标记推定。无需官方包哈希；仍不把作品存在成人版、年龄18+或封面SFW独立等同为当前版本的性内容结论。`none`仅表示社区标记无成人性内容，不表示全年龄或无暴力；没有给当前包填写官方年龄评级。

VNDB公开API本轮返回1088条唯一发行记录，覆盖71个VNDB作品，包含非官方翻译/移植。KUNGal按实际打开的作品年龄、资源说明和移植系列交叉核对；网页正文与搜索索引不一致时排除，登录/年龄墙和失败入口如实记录。未下载游戏或成人补丁。

页面将已决分类标注为“社区标记”，管理记录保留来源、时间与本条审计入口。39个未决项仍受原准入规则限制；未降低未知或成人内容的访问门槛。

## 证据入口

- [逐版本结构化决策](../data/version-nsfw-review-20261114.json)：94个版本的前后分类、理由、资源控制快照及证据层级。
- [VNDB发行标记索引](../data/version-release-index-20261114.json)：含官方/非官方、完整本体/试玩/补丁、has_ero、minage、引擎与语言等事实字段；这些仍是社区数据。
- [社区第1组](version-community-research-group-1.md) / [第2组](version-community-research-group-2.md) / [第3组](version-community-research-group-3.md)。
- [先行官方研究第1组](version-official-research-group-1.md) / [第2组](version-official-research-group-2.md) / [第3组](version-official-research-group-3.md)：仅说明官方版事实；其中“包绑定unknown”不代表本轮最终社区分类。

## 关键判别

- 翻译补丁本身 `has_ero=false` 不代表基础游戏无成人内容；试玩、完整本体、成人补丁分别检查。
- 同作不同引擎或版本可以不同：樱之诗两个RenPy版本有成人移植标记，Artemis版本仍待核实；樱之刻存在非成人移植与成人发行分流，暂不强行归类。
- NinNinDays两作、eden*等有补丁或发行分支，未得到唯一对应时保留unknown；雪女四个demo不套用完整Steam版说明。
- KUNGal页面顶部SFW与作品R18字段可能同时出现，顶部SFW不能证明游戏无成人内容。

## 待核实的39版

| 作品 | 目录版本 | 尚缺的对应信息 |
| --- | --- | --- |
| eden*（v1286） | 1 RenPy | VNDB基础版/试玩false，PLUS+MOSAIC/R18版true；KUN作品页合并两者，RenPy示例没有成人补丁状态。 |
| NinNinDays（v26310） | 1 Artemis | Artemis本体存在has_ero=false删改版及true成人版/R18补丁，KUN作品R18未确定当前包补丁状态。 |
| NinNinDays2（v32805） | 1 Artemis | Artemis/PC存在删改与无删改/18+补丁分支；未找到当前包对应补丁标记。 |
| 万华镜6（v44184） | 1 RenPy、2 RenPy、3 RenPy、4 RenPy | VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。 |
| 君与彼女与彼女之恋（v7738） | 1 RenPy | VNDB RenPy完整移植同时有true（r38393/r124825）及false（r127992）；中文名/引擎不足分辨，KUN只证作品R18与Steam补丁。 |
| 大图书馆的牧羊人（v8158） | 1 ONS | 成人PC、全年龄试玩、Library Party主机/内容移植均存在；KUN模拟器资源仅泛称ONS，未明确成人分支。 |
| 少女理论及其周边（v12246） | 1 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 常规脱离creative凸（v33205） | 1 Artemis、2 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 常轨脱离Creative（v27449） | 1 Artemis、2 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 拔作岛1（v22899） | 1 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 拔作岛2（v23741） | 1 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 树莓立方体（v22847） | 1 Artemis、2 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 樱之刻（v20431） | 1 Artemis、2 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 樱之诗（v562） | 3 Artemis | VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。 |
| 尼特与天使与色色家族（b315601） | 1 Tyrano | 给定b315601不是VNDB编号，KUN以中文和日文名检索未取得匹配作品；仍未知，不借原题含情色字样推断。 |
| 甜蜜夏日（v34848） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 真实动漫情境体验2（v27436） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 神社里的猫巫女（v25170） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 秽翼的尤斯蒂娅（v3770） | 1 ONS | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 繁花落舞恋如樱（v1115） | 1 Artemis、2 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 绘缘蜜恋（v32183） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 虚之少女HD（v5922） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 野良与皇女与流浪猫之心1（v18148） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 野良与皇女与流浪猫之心2（v19841） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 青空下的约定（v182） | 1 ONS | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 飞鸟会长不肯认输（v37843） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend（v22880） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend2（v23290） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend3（v23772） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| SELECT OBLIGE（v47175） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 千之刃涛，桃花染之皇姬（v15708） | 1 Artemis | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |

以上仅汇总仍未决版本，未以缺少官方哈希作为保留未知的统一理由；具体社区分支与检索缺口见逐版条目。

## 访问与证据边界

线上CAS元数据匿名探测两次返回401，此入口已停止，没有借用其他身份或读生产数据库绕过准入。94个现有任务控制清单的SHA1/身份已核对；这只证明快照包身份与路径，不代表本轮完成包内实测。用户随后选择社区标记口径，因此该入口受阻未阻止本轮社区分类。

## 逐版本结果

### legacy-22f82f586933328e09f8545a

- ATRI · 版本1 · Artemis；结论：`none`（社区标记）。
- 依据：VNDB全部已收录发行has_ero=false，作品页No Sexual Content；包括Artemis官方分支及非官方移植。
- [社区细项](version-community-research-group-1.md)；作品编号 `v27448`。
- 对应控制快照：`artemis-v27448-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### 6016ffaf-4448-53d8-a129-b907b13b2d77

- ATRI · 版本2 · Artemis；结论：`none`（社区标记）。
- 依据：VNDB全部已收录发行has_ero=false，作品页No Sexual Content；包括Artemis官方分支及非官方移植。
- [社区细项](version-community-research-group-1.md)；作品编号 `v27448`。
- 对应控制快照：`artemis-v27448-2` / SHA1 `39d2ac1eb7df9c47de46f35a554c4e58337286fd`；不宣称与某上游文件逐字节相同。

### legacy-a1a835ec6184bfd5142f454f

- CLANNAD · 版本1 · ONS；结论：`none`（社区标记）。
- 依据：VNDB全部发行has_ero=false，KUN作品明确全年龄与无色情内容。
- [社区细项](version-community-research-group-1.md)；作品编号 `v4`。
- 对应控制快照：`clannad` / SHA1 `4ce0cee880f581f2bdce27242b038b14a0260b12`；不宣称与某上游文件逐字节相同。

### legacy-37a5c1365c6dec71ede5d1a3

- 沙耶之歌 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：当前为ONS，VNDB列NScripter/ONS完整发行及ONS移植工具均has_ero=true；KUN明确旧安卓ONS资源。无色情候选是Steam/韩文删改及RenPy demo，不是此引擎分支。
- [社区细项](version-community-research-group-1.md)；作品编号 `v97`。
- 对应控制快照：`saya` / SHA1 `3a520e8b9fdb5e76460226de8e0a0e81e453527a`；不宣称与某上游文件逐字节相同。

### legacy-ab8ed81c42a7266e3ca6cc61

- 希尔薇 · 版本1 · Tyrano；结论：`present`（社区标记）。
- 依据：VNDB正式、Legacy、各Tyrano移植及trial全部has_ero=true。
- [社区细项](version-community-research-group-1.md)；作品编号 `v18636`。
- 对应控制快照：`tyrano-v18636-1` / SHA1 `d23c8fe6f297b2809e74091856820be4213ed443`；不宣称与某上游文件逐字节相同。

### legacy-caa815636729e8cfa7a09a46

- 缘之空 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：KUN作品R18且2024旧ONS资源早于新的删改版；VNDB日文原版/成人补丁true，无色情RenPy demo与2026简中删改版不对应旧ONS。
- [社区细项](version-community-research-group-1.md)；作品编号 `v1194`。
- 对应控制快照：`ons-v1194-1` / SHA1 `b0e086d46b342bae3556ade116849eafb4f0f676`；不宣称与某上游文件逐字节相同。

### legacy-2bc9744f4a39fda45c162027

- eden* · 版本1 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB基础版/试玩false，PLUS+MOSAIC/R18版true；KUN作品页合并两者，RenPy示例没有成人补丁状态。
- [社区细项](version-community-research-group-1.md)；作品编号 `v1286`。
- 对应控制快照：`renpy-v1286-1` / SHA1 `3f01d2dee0587e6bd1b1795028e177a213b82255`；不宣称与某上游文件逐字节相同。

### legacy-fb8b326a69b71beee0e909a0

- 3days～満ちてゆく刻の彼方で～ · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB全部true，且r18460是简中NScripter完整ONS移植；KUN作品R18。
- [社区细项](version-community-research-group-1.md)；作品编号 `v1085`。
- 对应控制快照：`ons-v1085-1` / SHA1 `6a114d5426dd15bf604bfa8fbd14c23db2c6c7fa`；不宣称与某上游文件逐字节相同。

### legacy-0a8a7282eb43a670959e29ae

- NinNinDays · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：Artemis本体存在has_ero=false删改版及true成人版/R18补丁，KUN作品R18未确定当前包补丁状态。
- [社区细项](version-community-research-group-1.md)；作品编号 `v26310`。
- 对应控制快照：`artemis-v26310-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-9eec48bf553b29f80a0cf3b6

- NinNinDays2 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：Artemis/PC存在删改与无删改/18+补丁分支；未找到当前包对应补丁标记。
- [社区细项](version-community-research-group-1.md)；作品编号 `v32805`。
- 对应控制快照：`artemis-v32805-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-2bac9ede31401bad314f5d65

- Princess×Princess · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：正式完整发行均true；唯一false候选r91921是简中试玩翻译补丁，rtype=trial且patch=true；当前目录不标试玩。此为完整游戏推定，若之后确认是该trial须改unknown。
- [社区细项](version-community-research-group-1.md)；作品编号 `v30216`。
- 对应控制快照：`artemis-v30216-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-163db5b7a02c581d83d546aa

- 万华镜1 · 版本1 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB全部true并收录RenPy完整移植；KUN作品年龄R18，合集明确去码。
- [社区细项](version-community-research-group-1.md)；作品编号 `v8038`。
- 对应控制快照：`renpy-v8038-1` / SHA1 `190b0ceaddbff536946ae2bcd7a9398a055d3c69`；不宣称与某上游文件逐字节相同。

### legacy-51fb3bbaebe819639e1b00cb

- 万华镜1 · 版本2 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB全部true并收录RenPy完整移植；KUN作品年龄R18，合集明确去码。
- [社区细项](version-community-research-group-1.md)；作品编号 `v8038`。
- 对应控制快照：`renpy-v8038-2` / SHA1 `190b0ceaddbff536946ae2bcd7a9398a055d3c69`；不宣称与某上游文件逐字节相同。

### legacy-34a982d43f20824c615aa356

- 万华镜2.5 · 版本1 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB全部true，r101599明确简中RenPy完整移植；KUN成人PC合集提供旁证。
- [社区细项](version-community-research-group-1.md)；作品编号 `v14240`。
- 对应控制快照：`renpy-v14240-1` / SHA1 `ab15953ef6f4ca58de2591c028a88167bdb847a2`；不宣称与某上游文件逐字节相同。

### legacy-91cbd8b181dfcf0b753c104d

- 万华镜2.5 · 版本2 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB全部true，r101599明确简中RenPy完整移植；KUN成人PC合集提供旁证。
- [社区细项](version-community-research-group-1.md)；作品编号 `v14240`。
- 对应控制快照：`renpy-v14240-2` / SHA1 `ab15953ef6f4ca58de2591c028a88167bdb847a2`；不宣称与某上游文件逐字节相同。

### legacy-434dbf1e3ea7d9835fbff5ec

- 万华镜3 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB全部true，KUN合集与ONS骑兵资源旁证成人分支。
- [社区细项](version-community-research-group-1.md)；作品编号 `v14365`。
- 对应控制快照：`ons-v14365-1` / SHA1 `f1359e7b8a33cc907e418ac010e4f7f42fe5c55a`；不宣称与某上游文件逐字节相同。

### legacy-4739feefe694a036c750c25c

- 万华镜3 · 版本2 · ONS；结论：`present`（社区标记）。
- 依据：VNDB全部true，KUN合集与ONS骑兵资源旁证成人分支。
- [社区细项](version-community-research-group-1.md)；作品编号 `v14365`。
- 对应控制快照：`ons-v14365-2` / SHA1 `f1359e7b8a33cc907e418ac010e4f7f42fe5c55a`；不宣称与某上游文件逐字节相同。

### legacy-a05a24c64b95e9e4c73d69f1

- 万华镜3 · 版本3 · ONS；结论：`present`（社区标记）。
- 依据：VNDB全部true，KUN合集与ONS骑兵资源旁证成人分支。
- [社区细项](version-community-research-group-1.md)；作品编号 `v14365`。
- 对应控制快照：`ons-v14365-3` / SHA1 `5ddc9be2c773db799bc16e93f88912d3bbe438cd`；不宣称与某上游文件逐字节相同。

### legacy-16310c7b01d5049f9ffa78ea

- 万华镜5 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB区分Steam删改false与成人版true；KUN本作品资源区明确第五作ONS骑兵内容，可按ONS资源分支推定。
- [社区细项](version-community-research-group-1.md)；作品编号 `v27057`。
- 对应控制快照：`ons-v27057-1` / SHA1 `247d30eb9c5cdf4558169b742812b0f07a4ccb18`；不宣称与某上游文件逐字节相同。

### legacy-9d58bcf41c683470e5771057

- 万华镜5 · 版本2 · ONS；结论：`present`（社区标记）。
- 依据：VNDB区分Steam删改false与成人版true；KUN本作品资源区明确第五作ONS骑兵内容，可按ONS资源分支推定。
- [社区细项](version-community-research-group-1.md)；作品编号 `v27057`。
- 对应控制快照：`ons-v27057-2` / SHA1 `247d30eb9c5cdf4558169b742812b0f07a4ccb18`；不宣称与某上游文件逐字节相同。

### legacy-032e99675c2271819eea7e73

- 万华镜5 · 版本3 · ONS；结论：`present`（社区标记）。
- 依据：VNDB区分Steam删改false与成人版true；KUN本作品资源区明确第五作ONS骑兵内容，可按ONS资源分支推定。
- [社区细项](version-community-research-group-1.md)；作品编号 `v27057`。
- 对应控制快照：`ons-v27057-3` / SHA1 `bb33a1c24b267bff4ae85765f75a4c6de5d76bf1`；不宣称与某上游文件逐字节相同。

### legacy-fe2406e269b2dc19be3a75ba

- 万华镜6 · 版本1 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。
- [社区细项](version-community-research-group-1.md)；作品编号 `v44184`。
- 对应控制快照：`renpy-v44184-1` / SHA1 `7a9001b322869d0ac0ed0939947a9a162308efe6`；不宣称与某上游文件逐字节相同。

### legacy-c193d7dd6680727121b1f9d6

- 万华镜6 · 版本2 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。
- [社区细项](version-community-research-group-1.md)；作品编号 `v44184`。
- 对应控制快照：`renpy-v44184-2` / SHA1 `8c0a7d72dee361be3d3d33a6417ffe77c9b82fd7`；不宣称与某上游文件逐字节相同。

### legacy-ad49d61a350643ebf45d85b5

- 万华镜6 · 版本3 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。
- [社区细项](version-community-research-group-1.md)；作品编号 `v44184`。
- 对应控制快照：`renpy-v44184-3` / SHA1 `753edf7fc9623451eeed72b3d0bb5ebbc2271688`；不宣称与某上游文件逐字节相同。

### legacy-31cf96913037760bf3f22036

- 万华镜6 · 版本4 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。
- [社区细项](version-community-research-group-1.md)；作品编号 `v44184`。
- 对应控制快照：`renpy-v44184-4` / SHA1 `db763f3da44a0c623fde8d7b0c3e0daf7650419a`；不宣称与某上游文件逐字节相同。

### legacy-8be91910e078a0119ba298d4

- 保健室的老师与哥特萝莉的校医 · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：VNDB全部发行/翻译has_ero=true，原版Artemis对应目录引擎；KUN索引R18旁证。
- [社区细项](version-community-research-group-1.md)；作品编号 `v33099`。
- 对应控制快照：`artemis-v33099-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-4e9ebe39ce34bffc966cf237

- 保健室的老师与恶魔般的会长 · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：VNDB全部true；KUN作品年龄R18，Artemis。
- [社区细项](version-community-research-group-1.md)；作品编号 `v33969`。
- 对应控制快照：`artemis-v33969-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-985c76e84a4c4e9380401161

- 保健室的老师与沉迷吹泡泡的助手 · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：VNDB全部true，包括各trial与译版；KUN作品年龄R18，Artemis。
- [社区细项](version-community-research-group-1.md)；作品编号 `v28666`。
- 对应控制快照：`artemis-v28666-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-ece0d0fae22a134abcbf8b22

- 君与彼女与彼女之恋 · 版本1 · RenPy；结论：`unknown`（社区标记）。
- 依据：VNDB RenPy完整移植同时有true（r38393/r124825）及false（r127992）；中文名/引擎不足分辨，KUN只证作品R18与Steam补丁。
- [社区细项](version-community-research-group-1.md)；作品编号 `v7738`。
- 对应控制快照：`renpy-v7738-1` / SHA1 `6adedee4c5bc1cfdc6d87d1ad3cc29cedea7d2cf`；不宣称与某上游文件逐字节相同。

### legacy-55842667e349faaaad5daae5

- 夏空的英仙座 · 版本1 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB全部true且r101123明确简中RenPy完整移植，细列Beta/Final修正版本。
- [社区细项](version-community-research-group-1.md)；作品编号 `v10597`。
- 对应控制快照：`renpy-v10597-1` / SHA1 `96495e6b0bc8bd9b5ffc4c5f8815c6b5544054d1`；不宣称与某上游文件逐字节相同。

### legacy-eec29e88f9c64b1a6ba50d5c

- 大图书馆的牧羊人 · 版本1 · ONS；结论：`unknown`（社区标记）。
- 依据：成人PC、全年龄试玩、Library Party主机/内容移植均存在；KUN模拟器资源仅泛称ONS，未明确成人分支。
- [社区细项](version-community-research-group-1.md)；作品编号 `v8158`。
- 对应控制快照：`ons-v8158-1` / SHA1 `7d7ec2065924178d5a74ed5ebe2d964a5b18e76e`；不宣称与某上游文件逐字节相同。

### legacy-a8c2e67a990feed19dedb3aa

- 女装山脉 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB正式完整本体全部true，唯一false是trial r33089；目录不标demo，KUN索引有ONS完整版候选。
- [社区细项](version-community-research-group-1.md)；作品编号 `v6589`。
- 对应控制快照：`ons-v6589-1` / SHA1 `e279e4c640ad841fa8df06cfff46ff00a555ca96`；不宣称与某上游文件逐字节相同。

### legacy-67c9c4a576fcc784c44eafd1

- 妹妹母亲 · 版本1 · Tyrano；结论：`present`（社区标记）。
- 依据：VNDB原版Tyrano本体r85758及简中翻译r120217为true；唯一false r162458是印尼语翻译补丁，不能把该补丁自身标记套到中文本体。
- [社区细项](version-community-research-group-1.md)；作品编号 `v33206`。
- 对应控制快照：`tyrano-v33206-1` / SHA1 `4aad9dac4fbba9e34c56b8aca7ecf6085255f134`；不宣称与某上游文件逐字节相同。

### legacy-12af3d99fdc41dfac94fb78f

- 妹妹母亲 · 版本2 · Tyrano；结论：`present`（社区标记）。
- 依据：VNDB原版Tyrano本体r85758及简中翻译r120217为true；唯一false r162458是印尼语翻译补丁，不能把该补丁自身标记套到中文本体。
- [社区细项](version-community-research-group-1.md)；作品编号 `v33206`。
- 对应控制快照：`tyrano-v33206-2` / SHA1 `4aad9dac4fbba9e34c56b8aca7ecf6085255f134`；不宣称与某上游文件逐字节相同。

### legacy-9a1261272a5772ecb5592bcc

- 妹调教日记 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：KUN资源280明确旧ONS本体+FD并列R18（索引）；VNDB无色情为新删改版，原作/完整盒装及成人DLC均true。
- [社区细项](version-community-research-group-1.md)；作品编号 `v9303`。
- 对应控制快照：`ons-v9303-1` / SHA1 `2467ce0f01e90adab918f08db9c2c8394704b94a`；不宣称与某上游文件逐字节相同。

### legacy-28ccd8d92b51623f2011170e

- 妹调教日记fd · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [社区细项](version-community-research-group-2.md)；作品编号 `v13190`。
- 对应控制快照：`ons-v13190-1` / SHA1 `174a138ba29272cfae995d5ef193f6c38aa9592f`；不宣称与某上游文件逐字节相同。

### legacy-7d8b5a9c884b57e6796265c4

- 小小的爱情公寓 · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [社区细项](version-community-research-group-2.md)；作品编号 `v14805`。
- 对应控制快照：`artemis-v14805-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-46214980e42483df202ceab1

- 万华镜2 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- [社区细项](version-community-research-group-2.md)；作品编号 `v11071`。
- 对应控制快照：`ons-v11071-1` / SHA1 `69e1a0e11a07a5cd4908814c1f36256efe0b60b0`；不宣称与某上游文件逐字节相同。

### legacy-67520f0d0345af13ed1be2ec

- 万华镜2 · 版本2 · ONS；结论：`present`（社区标记）。
- 依据：VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- [社区细项](version-community-research-group-2.md)；作品编号 `v11071`。
- 对应控制快照：`ons-v11071-2` / SHA1 `69e1a0e11a07a5cd4908814c1f36256efe0b60b0`；不宣称与某上游文件逐字节相同。

### legacy-ff6a61f773272d2a1e61609b

- 万华镜2 · 版本3 · ONS；结论：`present`（社区标记）。
- 依据：VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- [社区细项](version-community-research-group-2.md)；作品编号 `v11071`。
- 对应控制快照：`ons-v11071-3` / SHA1 `8b14afb0cdafb790a264eb9e5684a7356ac2e780`；不宣称与某上游文件逐字节相同。

### legacy-dbdae3ca10bd76d1ab998ba6

- 万华镜4 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [社区细项](version-community-research-group-2.md)；作品编号 `v19182`。
- 对应控制快照：`ons-v19182-1` / SHA1 `15f01e60b0ba3a2b300ae6420768c026befb3c10`；不宣称与某上游文件逐字节相同。

### legacy-e1e29253c2fd43ddc771365f

- 万华镜4 · 版本2 · ONS；结论：`present`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [社区细项](version-community-research-group-2.md)；作品编号 `v19182`。
- 对应控制快照：`ons-v19182-2` / SHA1 `15f01e60b0ba3a2b300ae6420768c026befb3c10`；不宣称与某上游文件逐字节相同。

### legacy-a378c290085945c2a66a5e1e

- 万华镜4 · 版本3 · ONS；结论：`present`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [社区细项](version-community-research-group-2.md)；作品编号 `v19182`。
- 对应控制快照：`ons-v19182-3` / SHA1 `f1472b58d65b2eed38f468025596c57eb5b7ea63`；不宣称与某上游文件逐字节相同。

### legacy-2a67a4d4f50f9f8b69621a75

- 少女理论及其周边 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v12246`。
- 对应控制快照：`artemis-v12246-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-c89356e75eb8577e08dda1e1

- 常规脱离creative凸 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v33205`。
- 对应控制快照：`artemis-v33205-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### c8005fb2-d1bc-5392-b97a-0f305c97fb2b

- 常规脱离creative凸 · 版本2 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v33205`。
- 对应控制快照：`artemis-v33205-2` / SHA1 `0bfe0feae28874cf4d70d74d5e99d3f0bdb4f701`；不宣称与某上游文件逐字节相同。

### legacy-79060b38748739bd8e64e718

- 常轨脱离Creative · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v27449`。
- 对应控制快照：`artemis-v27449-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### 6a43fdcc-d01c-5754-9bd0-dd660ea6d80f

- 常轨脱离Creative · 版本2 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v27449`。
- 对应控制快照：`artemis-v27449-2` / SHA1 `34d540f3e06613b3cdda22f7ed622b1d7f3c30fc`；不宣称与某上游文件逐字节相同。

### legacy-3a6409c0cdde7c72c3f5985d

- 徒花异谭 · 版本1 · Artemis；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v27457`。
- 对应控制快照：`artemis-v27457-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-e421fa9d2b91b91b55c06c99

- 这份恋情、予以保留、 · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v36554`。
- 对应控制快照：`tyrano-v36554-1` / SHA1 `a6b8d064faf33b701147ca01b0b838ee7fa002f8`；不宣称与某上游文件逐字节相同。

### legacy-862831b35153b8527b97103b

- 这份恋情、予以保留、游园会 · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v36555`。
- 对应控制快照：`tyrano-v36555-1` / SHA1 `a6b8d064faf33b701147ca01b0b838ee7fa002f8`；不宣称与某上游文件逐字节相同。

### legacy-6e9fbf4620fbe0a8faac2ea7

- 这份恋情、予以保留、情人节小剧场 · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v36556`。
- 对应控制快照：`tyrano-v36556-1` / SHA1 `a6b8d064faf33b701147ca01b0b838ee7fa002f8`；不宣称与某上游文件逐字节相同。

### legacy-c8c3354e1ad697410f361147

- 这份恋情、暂时待定、 · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v36557`。
- 对应控制快照：`tyrano-v36557-1` / SHA1 `b91c40e10622c96a4dd1e1a5cb777f045375bda1`；不宣称与某上游文件逐字节相同。

### legacy-d59b2445f0f42f0cc649572b

- 这份恋情、暂时待定、 情人节小剧场Z · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v36558`。
- 对应控制快照：`tyrano-v36558-1` / SHA1 `b91c40e10622c96a4dd1e1a5cb777f045375bda1`；不宣称与某上游文件逐字节相同。

### legacy-3aa2e08ae7ef40d85fd49212

- 这份恋情、迎来終焉。 · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v44249`。
- 对应控制快照：`tyrano-v44249-1` / SHA1 `5232212bbb4ccb4927c319f568dfe5687d21fc95`；不宣称与某上游文件逐字节相同。

### legacy-512eb028c2f298f534d2de34

- 这份恋情、迎来终焉。情人节小剧场X · 版本1 · Tyrano；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v49795`。
- 对应控制快照：`tyrano-v49795-1` / SHA1 `b91c40e10622c96a4dd1e1a5cb777f045375bda1`；不宣称与某上游文件逐字节相同。

### legacy-156b1273e3d67dc3ec603fd2

- 拔作岛1 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v22899`。
- 对应控制快照：`artemis-v22899-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-589e8be3f37d376dd02787fe

- 拔作岛2 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v23741`。
- 对应控制快照：`artemis-v23741-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-5e3dbea8bde738028caa826d

- 星之终途后日谈：渺茫希望的日记 · 版本1 · RenPy；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v50789`。
- 对应控制快照：`renpy-v50789-1` / SHA1 `7db9b0e459d4cbb3702d09b6a3f74a8a5c794ac7`；不宣称与某上游文件逐字节相同。

### legacy-b6f36b1aa99e3f53dbad46c4

- 星之终途 · 版本1 · Artemis；结论：`none`（社区标记）。
- 依据：VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [社区细项](version-community-research-group-2.md)；作品编号 `v29443`。
- 对应控制快照：`artemis-v29443-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-110fc755bff5f71cb2a6c32c

- 是谁杀了知更鸟 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：社区完整CSA发行has_ero=true，false候选只是体验版；KUN R18作品页又列ONS合集，符合目录完整ONS方向。
- [社区细项](version-community-research-group-2.md)；作品编号 `v8436`。
- 对应控制快照：`ons-v8436-1` / SHA1 `ae8ace66d1fc2300520796cd3f713466049197e4`；不宣称与某上游文件逐字节相同。

### legacy-c0cc212cf2992cc7c3681e85

- 架向星空之桥 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：KUN当前R18作品页明确列ONS本篇资源；VNDB完整PC成人发行与之相符。
- [社区细项](version-community-research-group-2.md)；作品编号 `v2968`。
- 对应控制快照：`ons-v2968-1` / SHA1 `4d739dd4de0c51464058e7909fceed42e6d35089`；不宣称与某上游文件逐字节相同。

### legacy-3ab8194b66d726bd4279e3b4

- 树莓立方体 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v22847`。
- 对应控制快照：`artemis-v22847-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### cbc04bd1-9eaa-51db-906e-d434742211f8

- 树莓立方体 · 版本2 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v22847`。
- 对应控制快照：`artemis-v22847-2` / SHA1 `ee009c0f9cd67d6a0280cf1f1890a417884274d3`；不宣称与某上游文件逐字节相同。

### legacy-f71101d6acb2871ade48bcec

- 樱之刻 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v20431`。
- 对应控制快照：`artemis-v20431-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### d6b4fc84-a347-5a28-9184-579085dadfa1

- 樱之刻 · 版本2 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v20431`。
- 对应控制快照：`artemis-v20431-2` / SHA1 `d11d9b886e33021b21a11441fc7622cb6367b373`；不宣称与某上游文件逐字节相同。

### legacy-b6cc5da681fc717131109dfb

- 樱之诗 · 版本1 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB r128749 是简中RenPy安卓完整移植，has_ero=true/minage18，直接对应目录RenPy版本；r82144的H未翻译不等于删除H。
- [社区细项](version-community-research-group-2.md)；作品编号 `v562`。
- 对应控制快照：`renpy-v562-1` / SHA1 `b41aa03ffcd8f383371ad46d1fad8e20530ecf9a`；不宣称与某上游文件逐字节相同。

### legacy-acdb13048e0f27deca44a5ea

- 樱之诗 · 版本2 · RenPy；结论：`present`（社区标记）。
- 依据：VNDB r128749 是简中RenPy安卓完整移植，has_ero=true/minage18，直接对应目录RenPy版本；r82144的H未翻译不等于删除H。
- [社区细项](version-community-research-group-2.md)；作品编号 `v562`。
- 对应控制快照：`renpy-v562-2` / SHA1 `86fde9e688e252fe336a0501a9a8c003eb1d758f`；不宣称与某上游文件逐字节相同。

### 33224257-9a7b-5d77-b690-2c0fd9643a48

- 樱之诗 · 版本3 · Artemis；结论：`unknown`（社区标记）。
- 依据：VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [社区细项](version-community-research-group-2.md)；作品编号 `v562`。
- 对应控制快照：`artemis-v562-3` / SHA1 `6463aa48cccbef4fae8ca651f9fab44228a412c4`；不宣称与某上游文件逐字节相同。

### legacy-1b0a56130aa4fb6a5d073fdf

- 尼特与天使与色色家族 · 版本1 · Tyrano；结论：`unknown`（社区标记）。
- 依据：给定b315601不是VNDB编号，KUN以中文和日文名检索未取得匹配作品；仍未知，不借原题含情色字样推断。
- [社区细项](version-community-research-group-3.md)；作品编号 `b315601`。
- 对应控制快照：`tyrano-b315601-1` / SHA1 `10aa44dade330959b61746c615a4395c258872fd`；不宣称与某上游文件逐字节相同。

### legacy-a9b121de2f7151e661a702c8

- 永不落幕的前奏诗 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v15637`。
- 对应控制快照：`ons-v15637-1` / SHA1 `3cce0d067060c38e2f695e2033dc81a7ef4949eb`；不宣称与某上游文件逐字节相同。

### legacy-1f804636a46b7c88786a72d9

- 爱语 -Silver Snow Sister- · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v45247`。
- 对应控制快照：`artemis-v45247-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-a045f2a8a2d68503bd00418c

- 甜蜜夏日 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v34848`。
- 对应控制快照：`artemis-v34848-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-0749431b49cb164e3a98470d

- 真实动漫情境体验2 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v27436`。
- 对应控制快照：`artemis-v27436-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-7f849d5bf9b1405c681b5df4

- 神社里的猫巫女 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v25170`。
- 对应控制快照：`artemis-v25170-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-5d0fc085f59f8b32b0607d9a

- 秽翼的尤斯蒂娅 · 版本1 · ONS；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v3770`。
- 对应控制快照：`ons-v3770-1` / SHA1 `a8fd47a23468594300455bd9d7082279bd9bbec5`；不宣称与某上游文件逐字节相同。

### legacy-6eafd4436274aae8762dc65e

- 素晴日 · 版本1 · RenPy；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v3144`。
- 对应控制快照：`renpy-v3144-1` / SHA1 `3e860b6cfa96dffe830e3b48fa33086513ed21f6`；不宣称与某上游文件逐字节相同。

### legacy-be3af7162b3b095755065f3f

- 繁花落舞恋如樱 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v1115`。
- 对应控制快照：`artemis-v1115-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### 933436a8-85f5-5a76-9568-5f29faff9785

- 繁花落舞恋如樱 · 版本2 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v1115`。
- 对应控制快照：`artemis-v1115-2` / SHA1 `67dc5e1f8b99a5ecf607dd300edeac1e6be6c132`；不宣称与某上游文件逐字节相同。

### legacy-eb649752b9b3b9ec088e1b24

- 绘缘蜜恋 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v32183`。
- 对应控制快照：`artemis-v32183-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-33474c5ab851410a1da3491a

- 虚之少女HD · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v5922`。
- 对应控制快照：`artemis-v5922-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-2d0044119e0bad2c44e29dff

- 近月少女的礼仪 · 版本1 · ONS；结论：`present`（社区标记）。
- 依据：KUN资源21882明确ONS/KIDFansClub转换系列，与本站ONS相符；VNDB中文译补r38626标has_ero=true，Steam无性内容版则另为Unity。按用户接受社区资料的口径建议present。
- [社区细项](version-community-research-group-3.md)；作品编号 `v10680`。
- 对应控制快照：`ons-v10680-1` / SHA1 `e946db7543443b2d1de4bc54115078548131cbdb`；不宣称与某上游文件逐字节相同。

### legacy-503f16b56d7c648804d85b51

- 野良与皇女与流浪猫之心1 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v18148`。
- 对应控制快照：`artemis-v18148-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-8675748d868a788562284aaa

- 野良与皇女与流浪猫之心2 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v19841`。
- 对应控制快照：`artemis-v19841-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### legacy-b2daa513541305560c3fcbae

- 青空下的约定 · 版本1 · ONS；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v182`。
- 对应控制快照：`ons-v182-1` / SHA1 `64a1746219564d3ad09599249cecadd883c76f49`；不宣称与某上游文件逐字节相同。

### legacy-78cfdb60c00f9fe6d0dd1e44

- 飞鸟会长不肯认输 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v37843`。
- 对应控制快照：`artemis-v37843-1` / SHA1 `567779be3530dc9fe4572522643f971751baafc4`；不宣称与某上游文件逐字节相同。

### ef49dd01-c904-518f-aba7-50a36d46c596

- 宿星Girlfriend · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v22880`。
- 对应控制快照：`artemis-v22880-1` / SHA1 `cd0bdb582adf30585bc3abf83a86f624565e9485`；不宣称与某上游文件逐字节相同。

### 2db31864-3a96-519e-be67-b75cac750691

- 宿星Girlfriend2 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v23290`。
- 对应控制快照：`artemis-v23290-1` / SHA1 `d20acea32ec4126c879eb55394e2741449354f09`；不宣称与某上游文件逐字节相同。

### 8949d767-3c75-5d50-ac5d-1e0693108a6a

- 宿星Girlfriend3 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v23772`。
- 对应控制快照：`artemis-v23772-1` / SHA1 `ff3a35ff302768ff42c3c6416fd0081e24955bc3`；不宣称与某上游文件逐字节相同。

### a7b73d5e-7412-5654-87a2-d71f51a0b3a8

- 常轨脱离Creative Re:Re:call · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v53590`。
- 对应控制快照：`artemis-v53590-1` / SHA1 `be9395394d2226384d225a8f6860405baaed74e8`；不宣称与某上游文件逐字节相同。

### d872fbdb-a9a4-550e-8699-928cacc9750e

- SELECT OBLIGE · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v47175`。
- 对应控制快照：`artemis-v47175-1` / SHA1 `40413e73f67b7590999ef11f2f4114d76526242d`；不宣称与某上游文件逐字节相同。

### 0b9089be-6d34-5e21-85c4-c2020ac2a913

- FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜 · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v37021`。
- 对应控制快照：`artemis-v37021-1` / SHA1 `1d2bc59dbad05e7618c5df5d50a0fa670b1950c7`；不宣称与某上游文件逐字节相同。

### 7c7c87f6-1afd-549b-ab5b-5af40f40ec93

- FLIP＊FLOP ～RAMBLING OVERRUN～ · 版本1 · Artemis；结论：`present`（社区标记）。
- 依据：剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。
- [社区细项](version-community-research-group-3.md)；作品编号 `v39197`。
- 对应控制快照：`artemis-v39197-1` / SHA1 `77c486d852987c92e16fe952839ddab6bab74e72`；不宣称与某上游文件逐字节相同。

### 476a1807-cfd5-5e67-8772-5ca53e9b616c

- 千之刃涛，桃花染之皇姬 · 版本1 · Artemis；结论：`unknown`（社区标记）。
- 依据：完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。
- [社区细项](version-community-research-group-3.md)；作品编号 `v15708`。
- 对应控制快照：`artemis-v15708-1` / SHA1 `b70bff8b2e1a9edb2d4da7e5aa86a012f070057b`；不宣称与某上游文件逐字节相同。

## 隔离预览验证

- 远程333项单元测试、类型检查、生产构建通过；分类导入幂等性和逐版证据测试通过。
- 隔离库94条记录与审计前后表逐字段深比较一致，42/13/39计数一致。
- 37项UI回归与2项页面截图用例全部通过；社区标签与读取/拒绝状态均已验收。
- 日志：`/home/i/wvn-m3-20261114/jobs/version-verify-01/run.log`、`jobs/version-browser-02/`（exit 0）。首批回执脚本JSON键序误判已改为深比较，不是分类内容不一致，未重复导入。
- [隔离预览](https://localhost-1.tailac9c6f.ts.net:24883/)。仅更新本任务预览，未部署生产。
