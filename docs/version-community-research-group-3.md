# 第3组社区版本标记核查

按用户新要求采用VNDB和KUNGal社区标记。覆盖24作25版本，不再把缺官方包哈希作为阻挡理由。主分类未改。

证据边界：VNDB API由主任务本轮抓取，本子任务读取其完整发行版快照，逐版记录has_ero、patch、rtype、引擎、语言、平台。KUN只把实际打开的正文和年龄字段作为已核验证据；搜索摘要与open失败另列，不混淆。KUN的SFW标识是页面展示状态，不能用于断定游戏无性内容。

去掉补丁和非完整发行后，6作完整主游戏统一has_ero=true。另《近月》KUN资源明确ONS/KIDFansClub系列，与本站ONS对应，结合VNDB该译补成人标记建议present。其余17作保留unknown，主要为确实存在成人/删减双版本；072作品没有VNDB映射。此未知是版次歧义，不是旧官方哈希门槛。

KUN搜索/缓存有具体冲突：/galgame/1266搜索名为青空Refine，实际打开是ランジェリーズ，已经排除；未拿封面SFW/NSFW判断游戏内容。

## 逐作建议

| 作品 | 建议 | 依据与歧义 |
|---|---|---|
| 尼特与天使与色色家族 | unknown | 给定b315601不是VNDB编号，KUN以中文和日文名检索未取得匹配作品；仍未知，不借原题含情色字样推断。 |
| 永不落幕的前奏诗 | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| 爱语 -Silver Snow Sister- | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| 甜蜜夏日 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 真实动漫情境体验2 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 神社里的猫巫女 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 秽翼的尤斯蒂娅 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 素晴日 | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| 繁花落舞恋如樱 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 绘缘蜜恋 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 虚之少女HD | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 近月少女的礼仪 | present | KUN资源21882明确ONS/KIDFansClub转换系列，与本站ONS相符；VNDB中文译补r38626标has_ero=true，Steam无性内容版则另为Unity。按用户接受社区资料的口径建议present。 |
| 野良与皇女与流浪猫之心1 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 野良与皇女与流浪猫之心2 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 青空下的约定 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 飞鸟会长不肯认输 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend2 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 宿星Girlfriend3 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| 常轨脱离Creative Re:Re:call | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| SELECT OBLIGE | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |
| FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜 | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| FLIP＊FLOP ～RAMBLING OVERRUN～ | present | 剔除补丁自身与试读/部分内容后，全部完整主游戏发行版has_ero=true；社区版本标记一致，无需包哈希才能提出建议。 |
| 千之刃涛，桃花染之皇姬 | unknown | 完整主游戏发行版同时存在has_ero=true/false，或同作有成人内容恢复补丁；当前资源描述不足以区分，所以保留unknown。 |

## 来源与结果

VNDB API：[https://api.vndb.org/kana/release](https://api.vndb.org/kana/release)，主任务抓取时间 2026-11-13T21:05:20.409670+00:00；完整逐发行字段见JSON。

### 尼特与天使与色色家族（b315601）

VNDB作品成人发行存在性：unknown；版本建议：unknown。

- KUN未取得匹配且可读的作品/资源正文；按VNDB逐发行记录保留当前建议。

### 永不落幕的前奏诗（v15637）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / work](https://www.kungal.com/galgame/172)：R18；readable；作品级标签，页面SFW为展示状态；不证明特定移植包。 末尾年龄限制字段明确R18。

### 爱语 -Silver Snow Sister-（v45247）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / work](https://www.kungal.com/galgame-rating/558)：unknown；cache_miss；搜索摘要显示R18及H场景评论，实际open失败，不据摘要升级。 

### 甜蜜夏日（v34848）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/439)：R18；readable；同时聚合PC、主机及不同版本；SFW不等于全年龄。 年龄限制R18，Artemis Engine。

### 真实动漫情境体验2（v27436）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/12602)：unknown；cache_miss；搜索摘要列TY模拟器，但实际open失败。 

### 神社里的猫巫女（v25170）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/245)：R18；readable；作品有删减版和补丁；此为作品年龄。 年龄限制字段R18。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/44289)：unknown；cache_miss；本次资源页不可读，未确认成人补丁是否集成。 

### 秽翼的尤斯蒂娅（v3770）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/30)：R18；readable；该页聚合PC/Android及主机资料；作品标记不能覆盖主机版。 年龄限制字段R18。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/10431)：unknown；unavailable；资源页实际不可达，未核验ONS版次。 

### 素晴日（v3144）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / work](https://www.kungal.com/galgame/84)：R18；readable；聚合原版、HD及Steam标题，未直接确认RenPy移植。 年龄限制字段R18。

### 繁花落舞恋如樱（v1115）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/496)：unknown；fetch_failed；搜索索引标题对应作品；实际open失败。 

### 绘缘蜜恋（v32183）

VNDB作品成人发行存在性：present；版本建议：unknown。

- KUN未取得匹配且可读的作品/资源正文；按VNDB逐发行记录保留当前建议。

### 虚之少女HD（v5922）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/1656)：R18；readable；聚合原版及The Shell/重制版，不能直接区分Steam删减及完整内容。 年龄限制字段R18；引擎含Artemis/InnocentGrey/Unity。

### 近月少女的礼仪（v10680）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / work](https://www.kungal.com/galgame/39)：R18；readable；作品级，不把SFW展示状态解读为无性内容。 年龄限制R18，原始引擎QLIE/Unity。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/21882)：ONS KIDFansClub translation package；readable；相同移植及汉化系列的社区来源；没有证明站点采用此资源的同一文件。 正文分别列PC KIDFansClub v1.21及ONS KIDFansClub 2.62GB，没有称Steam版。

### 野良与皇女与流浪猫之心1（v18148）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/387)：R18；readable；含Steam与原作聚合，无法区分当前Artemis转换。 年龄限制字段R18。

### 野良与皇女与流浪猫之心2（v19841）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/556)：R18；readable；含Steam与原作聚合。 年龄限制字段R18。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/1381)：KRKR Android Chinese package；readable；资源引擎为Kirikiroid2/XP3Player，和站点标Artemis不直接一致。 正文3GB、简体中文、安卓；说明KRKR模拟器。

### 青空下的约定（v182）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/1266)：excluded_title_mismatch；title_mismatch；搜索索引称青空Refine，实际open是ランジェリーズ；排除该页面。 

- [KUNGal / resource](https://www.kungal.com/galgame/resource/49055)：unknown；cache_miss；搜索摘要是原作模拟器R18，但实际open失败，不以摘要判定。 

### 飞鸟会长不肯认输（v37843）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/678)：unknown；search_only；只检索到摘要，未实际open；本记录不作为已打开证据。 

### 宿星Girlfriend（v22880）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/902)：R18；readable；旧缓存页面可读，年龄标签为作品级。 末尾年龄限制R18；VNDB关联v22880。

### 宿星Girlfriend2（v23290）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/903)：SFW_display_only；readable；实际open为旧版页面，未见年龄R18；SFW不作为none。 确认作品名及Windows/模拟器平台，不能凭展示状态分类。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/2137)：unknown；cache_miss；搜索摘要明确2018日文限定实体版+绿茶汉化，但实际open失败。 

### 宿星Girlfriend3（v23772）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/904)：unknown；cache_miss；搜索索引对应作品，实际open失败。 

### 常轨脱离Creative Re:Re:call（v53590）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/13032)：series_collection_with_content_patch；readable；合集包含Re:Re:call，但Steam补丁说明未逐作细分；不把合集补丁强行绑定该作。 正文列系列三作，PC+安卓，并称含补全Steam删减部分内容的补丁。

### SELECT OBLIGE（v47175）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/20892)：unknown；cache_miss；搜索摘要明确18禁原作+多个汉化补丁，但实际open失败。 

### FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜（v37021）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / work](https://www.kungal.com/galgame/273)：SFW_display_only；readable；旧缓存页面只有SFW展示标识，没有年龄字段；不作none。 Windows及模拟器简中资源列表；无可读独立成人标签。

### FLIP＊FLOP ～RAMBLING OVERRUN～（v39197）

VNDB作品成人发行存在性：present；版本建议：present。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/681)：unknown；cache_miss；搜索摘要有R18作品头部，实际open失败。 

### 千之刃涛，桃花染之皇姬（v15708）

VNDB作品成人发行存在性：present；版本建议：unknown。

- [KUNGal / work](https://www.kungal.com/galgame/408)：R18；readable；聚合PC和主机版资料，年龄标签是作品级。 年龄限制字段R18。

- [KUNGal / resource](https://www.kungal.com/galgame/resource/19170)：unknown；cache_miss；搜索摘要标ty且作品R18，实际open失败。 

## 本批验证

- 已校验24作25个输入版本均保留。
- 已校验补丁与非完整发行不会参与完整主游戏统一判断。
- 未下载游戏、补丁，未访问CAS、未修改运行时或主分类。
