# 第1组社区分级调查

核查时间：2026-11-13T21:07:57Z。覆盖24作、35个目录版本。根据用户新授权采用VNDB/KUNGal社区资料，本文件只给分类建议，未改主分类。

建议计数（作品）：{"none": 2, "present": 16, "unknown": 6}；版本：{"none": 3, "present": 23, "unknown": 9}。

## 方法与边界

- 使用主任务本轮公开API完整发行快照，含非官方译版/移植。发行链接为定位用；未打开的网页在JSON明确webPageOpened=false，不冒称网页核验。
- KUNGal优先读作品年龄、资源备注；顶部SFW常只是展示级别，缘之空/NinNinDays同页年龄仍为R18。
- 混合has_ero按引擎、语言、完整本体/试玩/补丁区分；不把印尼语翻译补丁false套到中文本体，也不把试玩false套到完整版。
- 作品和资源级推定获用户允许，无需官方哈希。对同引擎仍存在冲突及demo对应不到的情况保留unknown。
- 本机带既有代理的补充只读抓取被沙箱拒绝（Operation not permitted），未提权或绕过；继续用web与API快照。NSFW确认页未点击，游戏/补丁未下载。

## 关键结果

- ATRI、CLANNAD：none，VNDB所有发行一致false，另有作品无色情/全年龄标记。
- 沙耶、3days、万华镜2.5、夏空：有对应引擎或简中移植证据可建议present。
- Princess唯一false为试玩翻译补丁；いもおか唯一false为印尼语翻译补丁，应与中文完整本体区分。
- eden*、NinNinDays两部、雪女四个demo、君彼RenPy、大图书馆ONS仍unknown。
- 缘之空、万华镜5、妹调教日记的present属于社区资源/年代/引擎推定，见各条限制。

## 逐作建议

### ATRI（v27448）

**建议：none**。VNDB全部已收录发行has_ero=false，作品页No Sexual Content；包括Artemis官方分支及非官方移植。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：17；has_ero：[False]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [VNDB / work](https://vndb.org/v27448)：No Sexual Content。VNDB作品页面实际可读，带No Sexual Content标签且发行表包含All标记。（opened）

- [KUNGal / resource](https://www.kungal.com/topic/261)：Artemis Engine（索引正文）。资源帖主题为ATRI PC/PE汉化，搜索索引正文明确手机版为Artemis Engine/Tyranor；实际open正文截断。（partial_body）

### CLANNAD（v4）

**建议：none**。VNDB全部发行has_ero=false，KUN作品明确全年龄与无色情内容。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：66；has_ero：[False]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/86)：全年龄；无色情内容。年龄限制字段全年龄，并有无色情内容标签。顶部SFW未参与判断。（opened）

### 沙耶之歌（v97）

**建议：present**。当前为ONS，VNDB列NScripter/ONS完整发行及ONS移植工具均has_ero=true；KUN明确旧安卓ONS资源。无色情候选是Steam/韩文删改及RenPy demo，不是此引擎分支。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：54；has_ero：[False, True]。

重点发行：[r64727](https://vndb.org/r64727) Saya no Uta ~ The Song of Saya - Steam Edition（has_ero=False，patch=False，rtype=complete）；[r68982](https://vndb.org/r68982) Qsaya4ons（has_ero=True，patch=True，rtype=complete）；[r159742](https://vndb.org/r159742) Saya no Uta Remaster - Demo（has_ero=False，patch=False，rtype=trial）；[r168109](https://vndb.org/r168109) Saya No Uta PSP Enhanced Port（has_ero=True，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/topic/245)：安卓/ONS。明确沙耶之歌安卓ONS资源；该帖未独立写R18。成人推定来自VNDB同类ONS候选全部true。（opened）

### 希尔薇（v18636）

**建议：present**。VNDB正式、Legacy、各Tyrano移植及trial全部has_ero=true。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：20；has_ero：[True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/32022)：NSFW确认页；魔改版V8.0.3（索引）。实际open仅显示NSFW确认页，未点击；索引曾列PC+安卓魔改版，不能据它判定部署包版本。（nsfw_confirmation）

### 缘之空（v1194）

**建议：present**。KUN作品R18且2024旧ONS资源早于新的删改版；VNDB日文原版/成人补丁true，无色情RenPy demo与2026简中删改版不对应旧ONS。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：31；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/51)：R18。作品年龄限制R18；顶部SFW与内容年龄分开。（opened）

- [KUNGal / resource](https://www.kungal.com/topic/320)：PC/ONS；2024-02-14。旧ONS资源帖在2024发布，早于VNDB所列2026删改简中发行；结合原版R18作ONS分支推定。（opened）

### eden*（v1286）

**建议：unknown**。VNDB基础版/试玩false，PLUS+MOSAIC/R18版true；KUN作品页合并两者，RenPy示例没有成人补丁状态。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：24；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/22)：R18。年龄字段R18，别名包含PLUS+MOSAIC；这把基础版与成人扩充放在同一作品层。（opened）

- [KUNGal / resource](https://www.kungal.com/topic/1263)：RenPy网页版示例（索引）。索引中的回复#2将EDEN列为RenPy网页版示例；实际open未提供可读正文，未打开游戏示例链接。（inaccessible）

### 3days～満ちてゆく刻の彼方で～（v1085）

**建议：present**。VNDB全部true，且r18460是简中NScripter完整ONS移植；KUN作品R18。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：12；has_ero：[True]。

重点发行：[r18460](https://vndb.org/r18460) 3 days ONS Yizhi Ban（has_ero=True，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/115)：R18；NScripter。作品年龄限制R18，游戏引擎包括NScripter；VNDB另有简中ONS完整移植条目。（opened）

### NinNinDays（v26310）

**建议：unknown**。Artemis本体存在has_ero=false删改版及true成人版/R18补丁，KUN作品R18未确定当前包补丁状态。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：11；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/481)：R18；Artemis Engine。作品年龄字段R18，Artemis；同一引擎既有删改本体又有成人版，不能只凭此选分支。（opened）

### NinNinDays2（v32805）

**建议：unknown**。Artemis/PC存在删改与无删改/18+补丁分支；未找到当前包对应补丁标记。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：7；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/482)：R18；Artemis Engine。作品年龄字段R18，Artemis；未读到对应当前包的已打R18补丁资源说明。（opened）

### Princess×Princess（v30216）

**建议：present**。正式完整发行均true；唯一false候选r91921是简中试玩翻译补丁，rtype=trial且patch=true；当前目录不标试玩。此为完整游戏推定，若之后确认是该trial须改unknown。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。 present建立在当前版本为完整本体、不是仅未注明demo的条件上。

VNDB发行数：7；has_ero：[False, True]。

重点发行：[r81891](https://vndb.org/r81891) Princess x Princess - Trial Edition（has_ero=True，patch=False，rtype=trial）；[r82139](https://vndb.org/r82139) Princess x Princess - Download Edition（has_ero=True，patch=False，rtype=complete）；[r91921](https://vndb.org/r91921) Princess x Princess - Trial Edition（has_ero=False，patch=True，rtype=trial）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

### 万华镜1（v8038）

**建议：present**。VNDB全部true并收录RenPy完整移植；KUN作品年龄R18，合集明确去码。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：24；has_ero：[True]。

重点发行：[r47900](https://vndb.org/r47900) Kalejdoskop krasavic -Devushka iz prokljatogo skazanija-（has_ero=True，patch=False，rtype=complete）；[r118978](https://vndb.org/r118978) Bishoujo Mangekyou -Norowareshi Densetsu no Shoujo-（has_ero=True，patch=False，rtype=complete）；[r122412](https://vndb.org/r122412) Bishoujo Mangekyou -Norowareshi Densetsu no Shoujo-（has_ero=True，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/65)：R18。作品年龄限制R18，与VNDB全部发行has_ero=true一致。（opened）

- [KUNGal / resource](https://www.kungal.com/topic/74)：前五作及2.5全集；已打步兵/汉化补丁。该PC硬盘合集正文明确六部对应作品并已打去码及汉化补丁，支持成人分支存在；不靠封面NSFW判定。（opened）

### 万华镜2.5（v14240）

**建议：present**。VNDB全部true，r101599明确简中RenPy完整移植；KUN成人PC合集提供旁证。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：10；has_ero：[True]。

重点发行：[r101599](https://vndb.org/r101599) Meishaonü Wanhuajing 2.5: Xiangei Cengjing shi Shaonü de Ni - Ren'Py Port（has_ero=True，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/topic/74)：前五作及2.5全集；已打步兵/汉化补丁。该PC硬盘合集正文明确六部对应作品并已打去码及汉化补丁，支持成人分支存在；不靠封面NSFW判定。（opened）

- [KUNGal / work](https://www.kungal.com/galgame/1432)：未取得正文。由系列页链接发现对应2.5作品页，但open两次Cache miss；不把失败当标签。（inaccessible）

### 万华镜3（v14365）

**建议：present**。VNDB全部true，KUN合集与ONS骑兵资源旁证成人分支。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：10；has_ero：[True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/topic/74)：前五作及2.5全集；已打步兵/汉化补丁。该PC硬盘合集正文明确六部对应作品并已打去码及汉化补丁，支持成人分支存在；不靠封面NSFW判定。（opened）

### 万华镜5（v27057）

**建议：present**。VNDB区分Steam删改false与成人版true；KUN本作品资源区明确第五作ONS骑兵内容，可按ONS资源分支推定。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：15；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/topic/74)：前五作及2.5全集；已打步兵/汉化补丁。该PC硬盘合集正文明确六部对应作品并已打去码及汉化补丁，支持成人分支存在；不靠封面NSFW判定。（opened）

- [KUNGal / resource](https://www.kungal.com/galgame/69)：ONS骑兵合集；PC含补丁分支。作品资源区明确七部双端合集中的1/2/3/4/5均有ONS骑兵；另有Steam专属内容恢复补丁说明。（opened）

### 万华镜6（v44184）

**建议：unknown**。VNDB成人正式版true与未来Steam删改版false并存；四个当前版本均为RenPy demo，未找到对应demo版本标记。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：10；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/99)：NSFW确认页。实际只显示本作品含NSFW及确认按钮，未点击。（nsfw_confirmation）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/39710)：未取得正文。搜索发现雪女资源，但openCache miss。（inaccessible）

### 保健室的老师与哥特萝莉的校医（v33099）

**建议：present**。VNDB全部发行/翻译has_ero=true，原版Artemis对应目录引擎；KUN索引R18旁证。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：5；has_ero：[True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/83)：NSFW确认页。实际只显示确认页，未点击；发行has_ero以VNDB为主要证据。（nsfw_confirmation）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/179)：R18；PC+TY（索引）。搜索索引列R18及PC+TY备注；实际openCache miss。（inaccessible）

### 保健室的老师与恶魔般的会长（v33969）

**建议：present**。VNDB全部true；KUN作品年龄R18，Artemis。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：4；has_ero：[True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/82)：R18；Artemis Engine。年龄字段R18，Artemis；与VNDB一致true。（opened）

### 保健室的老师与沉迷吹泡泡的助手（v28666）

**建议：present**。VNDB全部true，包括各trial与译版；KUN作品年龄R18，Artemis。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：10；has_ero：[True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/14)：R18；Artemis Engine。年龄字段R18，Artemis；与VNDB一致true。（opened）

### 君与彼女与彼女之恋（v7738）

**建议：unknown**。VNDB RenPy完整移植同时有true（r38393/r124825）及false（r127992）；中文名/引擎不足分辨，KUN只证作品R18与Steam补丁。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：36；has_ero：[False, True]。

重点发行：[r38393](https://vndb.org/r38393) Ni yu Binv he Binv zhi Lian.（has_ero=True，patch=False，rtype=complete）；[r124825](https://vndb.org/r124825) YOU and ME and HER: A Love Story（has_ero=True，patch=False，rtype=complete）；[r127992](https://vndb.org/r127992) YOU and ME and HER: A Love Story（has_ero=False，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/112)：R18。作品年龄字段R18；不能排除VNDB收录的无色情RenPy完整移植分支。（opened）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/2973)：Steam无和谐补丁（索引）。索引明确Steam恢复补丁，实际open不可读；没有对应当前RenPy的资源说明。（inaccessible）

### 夏空的英仙座（v10597）

**建议：present**。VNDB全部true且r101123明确简中RenPy完整移植，细列Beta/Final修正版本。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：10；has_ero：[True]。

重点发行：[r101123](https://vndb.org/r101123) Xiakong de Yingxianzuo - Ren'Py Port（has_ero=True，patch=False，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame-rating/594)：未取得正文。定位到夏空对应评论页但openCache miss；不以评论评分替代性内容分级。（inaccessible）

### 大图书馆的牧羊人（v8158）

**建议：unknown**。成人PC、全年龄试玩、Library Party主机/内容移植均存在；KUN模拟器资源仅泛称ONS，未明确成人分支。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：26；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / work](https://www.kungal.com/galgame/654)：R18。作品年龄字段R18，但VNDB同时存在成人PC和无色情Library Party主机/PC移植分支。（opened）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/48825)：模拟器；泛称KRKR/Tyranor/ONS。正文只有通用模拟器平台说明，不明确当前包是否Library Party或成人本体。（opened）

### 女装山脉（v6589）

**建议：present**。VNDB正式完整本体全部true，唯一false是trial r33089；目录不标demo，KUN索引有ONS完整版候选。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。 present建立在当前版本为完整本体、不是仅未注明demo的条件上。

VNDB发行数：10；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/47217)：NSFW展示标记；ONS候选（索引）。正文可读但没有独立R18年龄字段；索引相关资源列ONS+安卓直装。性内容依据VNDB完整本体has_ero=true，唯一false为试玩。（opened）

### 妹妹母亲（v33206）

**建议：present**。VNDB原版Tyrano本体r85758及简中翻译r120217为true；唯一false r162458是印尼语翻译补丁，不能把该补丁自身标记套到中文本体。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：3；has_ero：[False, True]。

重点发行：[r85758](https://vndb.org/r85758) Imooka（has_ero=True，patch=False，rtype=complete）；[r120217](https://vndb.org/r120217) Meimei Muqin ~ Muxing Luoli（has_ero=True，patch=True，rtype=complete）；[r162458](https://vndb.org/r162458) Imooka Bahasa Indonesia（has_ero=False，patch=True，rtype=complete）。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

### 妹调教日记（v9303）

**建议：present**。KUN资源280明确旧ONS本体+FD并列R18（索引）；VNDB无色情为新删改版，原作/完整盒装及成人DLC均true。

限制：社区资料推定，不是当前包逐项实测；年龄限制与色情内容字段分别保留。

VNDB发行数：9；has_ero：[False, True]。

来源：

- [VNDB / release](https://api.vndb.org/kana/release)：has_ero [False, True]。读取主任务本轮通过公开VNDB API获取的所有发行索引（包含非官方），按workId筛选；不冒称逐一打开了网页。（shared_snapshot_fetched）

- [KUNGal / resource](https://www.kungal.com/galgame/resource/280)：R18；ONS本体和FD（索引）。索引正文明确本资源包含ONS本体和FD，并列作品R18；实际open只显示NSFW确认页，未点击。（nsfw_confirmation）
