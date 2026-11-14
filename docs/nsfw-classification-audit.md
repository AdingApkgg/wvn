# NSFW 分类与目录证据盘点

审核日期：2026-11-04。本仓库静态快照，不代表已核对生产数据库；未写入生产。

2026-11-14 的14张缺失封面补抓及AI视觉复核另见[本轮审核记录](cover-review-20261114.md)；以下计数为原始历史快照，不能替代本轮状态。

## 快照与判定边界

- `data/catalog.json` SHA-256：`c7c636fdf02b95518871540ed412c76e795c9d201af8f738cb0317772d14a991`。
- `data/metadata.json` SHA-256：`d66890c7b95babcf235399d2ec8666fc9925f9f238759e1f4c0cb12e8884cd6c`。
- 72 部作品、94 个版本、384 次图片引用，对应 380 个唯一缓存 URL；4 次复用只存一份图片分类。
- 页面逐项阅读标题、原名、全部别名、元数据标题、完整简介和标签。SFW 仅指当前文本与经独立审核后允许展示的图片组合，不表示游戏本体安全。
- 截图剧透未核实，`spoiler: true` 为保守折叠；不声称已经确认有剧透。封面设 false。
- 审核绑定页面文本 SHA-256 指纹，覆盖标题、原名、全部别名、元数据标题、简介、标签、开发者、语言、平台、日期、警示与来源，以及全部已发布版本的标题、notes 和 language。抓取时间和口碑数值不属于文本指纹，图片另由独立分级过滤。
- 元数据刷新或目录编辑改变已审核文案后，Store 有效分类自动变为 unknown；原人工记录及历史保留。复审 set 将绑定当前文本。恢复到原审核文本时可沿用原证据；旧导入文档携带旧指纹，不能自动批准新文本。

## 汇总

- 页面文本：55 SFW、17 NSFW、0 待核实。
- 版本：94 个全部待核实；没有实际资源包与具体发行版、补丁状态的对应证据。
- 图片：355 个唯一素材有官方原始双零分与有效票数，25 个仍待核实；372 次 VNDB 引用、12 次官方来源引用。

## 页面逐项审核

### v27448

- 作品：ATRI；文本结论：`sfw`。
- 理由：海平面上升、机器人少女与夏日相遇的剧情介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v27448；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：原因不明の海面上昇によって、 地表の多くが海に沈んだ近未来。  幼い頃の事故によって片足を失った少年・斑鳩夏生（いかるがなつき）は、 都市での暮……

### v4

- 作品：CLANNAD；文本结论：`sfw`。
- 理由：校园、家庭与人生主题；全年龄一词为来源原文，不证明本站具体版本。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v4；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：季節は春、楽しく等身大で過ごす学園での日常から物語は始まり、やがてストーリーはヒロインたちとの恋愛に発展していきます。 深遠な世界観を背景に語ら……

### v97

- 作品：沙耶之歌；文本结论：`nsfw`。
- 理由：简介直接描绘腐烂血肉、内脏和食人，标签包含 Gore。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v97；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：爛れてゆく。何もかもが歪み、爛れてゆく。  交通事故で生死の境をさまよった匂坂郁紀は、いつしか独り孤独に、悪夢に囚われたまま生きるようになってい……

### v18636

- 作品：希尔薇；文本结论：`nsfw`。
- 理由：简介以被虐待的奴隶少女及与其建立亲密关系为宣传核心。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v18636；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：I became the guardian of a slave girl had been abused by her last owner.……

### v1194

- 作品：缘之空；文本结论：`sfw`。
- 理由：双胞胎回乡与重逢；标签提及兄妹恋但未露骨描述性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v1194；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Two twins - Haruka and Sora, are going back to their grandfather's house……

### v1286

- 作品：eden*；文本结论：`sfw`。
- 理由：末日、遗传工程与追求自由的爱情介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v1286；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：通往死亡的乐园，最后的爱情物语。 很近很近的未来…… 在火星附近突然出现的“灭亡之星”。 受它的影响地球已到了灭亡的边缘。 地球统一政府，提倡对……

### v1085

- 作品：3days～満ちてゆく刻の彼方で～；文本结论：`sfw`。
- 理由：时间循环与谋杀谜案的简介，未描述性行为或具体血腥细节。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v1085；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：The game revolves around the main character's 3 days repeating over and ……

### v26310

- 作品：NinNinDays；文本结论：`nsfw`。
- 理由：简介直接以 erotic cohabitation 宣传色情同居。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v26310；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Known only as "Ninja", these mysterious mercenaries have worked in the s……

### v32805

- 作品：NinNinDays2；文本结论：`sfw`。
- 理由：便利店相遇与忍者同居；fanservice 提示未展开性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v32805；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：A young man is dazing off while working the night shift at a convenience……

### v30216

- 作品：Princess×Princess；文本结论：`sfw`。
- 理由：婚姻、复数配偶与失忆少女的剧情介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v30216；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Fall has come to Verbena Academy.  Lithia couldn't be happier - this sum……

### v8038

- 作品：万华镜1；文本结论：`nsfw`。
- 理由：简介将教师对女学生的欲望与越界行为作为宣传重点。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v8038；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Onogami Shigehiko, a teacher at an all-girls school, is a man of love - ……

### v14240

- 作品：万华镜2.5；文本结论：`nsfw`。
- 理由：简介以旅馆中成年人一夜激情为直接宣传内容。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v14240；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：In the middle of the mountains stands an isolated, rural hot springs inn……

### v14365

- 作品：万华镜3；文本结论：`sfw`。
- 理由：末日科学家创造机器人女仆的简介，没有展开性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v14365；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：In an unknown era. Long after humanity's golden age crumbled to dust, an……

### v27057

- 作品：万华镜5；文本结论：`sfw`。
- 理由：作家、温泉旅馆与学院谜案介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v27057；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：At the awards ceremony for renowned author Kimiaki Sumeragi, Fukami Nats……

### v44184

- 作品：万华镜6；文本结论：`sfw`。
- 理由：武者雪山遇险与雪女相遇的传奇，情爱和梦境措辞未展开具体性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v44184；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Renfutsu Yukinoshin, a dedicated martial artist and expected successor o……

### v33099

- 作品：保健室的老师与哥特萝莉的校医；文本结论：`sfw`。
- 理由：校医、亡魂与校园传说的介绍；性经历标签为非露骨角色属性。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v33099；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段："Perhaps I've been searching for a fresh start." "Or maybe, just maybe, ……

### v33969

- 作品：保健室的老师与恶魔般的会长；文本结论：`sfw`。
- 理由：校园保健教师和会长调查传闻；角色性格和体型标签未描述性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v33969；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段："See you later, Sensei," "Let's go on another wonderful date with me!"  ……

### v28666

- 作品：保健室的老师与沉迷吹泡泡的助手；文本结论：`sfw`。
- 理由：寻亲、亡魂引渡和保健室工作的剧情简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v28666；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段："Say, Sora" "Okuribito may very well be considered the health teacher fo……

### v7738

- 作品：君与彼女与彼女之恋；文本结论：`sfw`。
- 理由：三角恋与友谊破裂的剧情简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v7738；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Life is like a staircase. You just gotta keep climbing. Otherwise, if yo……

### v10597

- 作品：夏空的英仙座；文本结论：`sfw`。
- 理由：承受他人痛苦的超能力与牺牲主题，亲属关系标签未描述性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v10597；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Shinra and his younger sister Ren have the ability to transfer ‘pain’ on……

### v8158

- 作品：大图书馆的牧羊人；文本结论：`sfw`。
- 理由：魔法图书馆、社团和校园愿望的介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v8158；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：When he was young, Kyoutarou wanted to read all the magic books in the w……

### v6589

- 作品：女装山脉；文本结论：`nsfw`。
- 理由：简介以生育使命和裙下秘密暗示性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v6589；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Following a string of heartbreaks, Ikuto Watarai decides to go into the ……

### v33206

- 作品：妹妹母亲；文本结论：`nsfw`。
- 理由：别名和简介直接宣传涉及未成年外观亲属的成人性主题。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v33206；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Imooka is a maternal, loli and harem erotic game.  A healing bubbly hare……

### v9303

- 作品：妹调教日记；文本结论：`nsfw`。
- 理由：标题和简介直接宣传性调教与性暴力主题。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v9303；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：The protagonist, a die-hard eroge fan, is into "exposure," "rape," and "……

### v13190

- 作品：妹调教日记fd；文本结论：`nsfw`。
- 理由：标题直接延续性调教主题，续篇说明不能使完整页面安全。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v13190；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Fandisk of Imouto Choukyou Nikki ~Konna Tsundere ga Ore no Imouto na Wak……

### v14805

- 作品：小小的爱情公寓；文本结论：`sfw`。
- 理由：公寓管理、姻缘神与住户关系的介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v14805；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Naoto is a NEET who was entrusted with managing an apartment which had p……

### v11071

- 作品：万华镜2；文本结论：`sfw`。
- 理由：失联初恋重逢的剧情介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v11071；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：The protagonist, Kanzaki Akihito, was once a cheerful boy.  Only having ……

### v19182

- 作品：万华镜4；文本结论：`sfw`。
- 理由：双胞胎兄妹情感和执念的剧情介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v19182；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Yuuma was forced to take a hiatus from school due to unspecified circums……

### v12246

- 作品：少女理论及其周边；文本结论：`sfw`。
- 理由：巴黎求学、服装设计与兄妹独立的介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v12246；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：This is the sequel to Tsuki ni Yorisou Otome no Sahou, taking place in P……

### v33205

- 作品：常规脱离creative凸；文本结论：`nsfw`。
- 理由：简介明确以不宜给儿童观看的同居生活宣传恋人后日谈。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v33205；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：A fandisc that includes after stories for the four main heroines and a n……

### v27449

- 作品：常轨脱离Creative；文本结论：`sfw`。
- 理由：抽签成为学生会长和招募成员的校园喜剧，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v27449；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：At the end of June, the seasons come to a standstill.  Widely known to b……

### v27457

- 作品：徒花异谭；文本结论：`sfw`。
- 理由：失忆少女、少年与绘本童话世界的冒险，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v27457；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：少女が気づくと、 そこはどことも知れない暗い森の中だった。 突如として現れた怪物に襲われた彼女は、 筆を刀のように操ってものを斬る、 謎の少年に……

### v36554

- 作品：这份恋情、予以保留、；文本结论：`sfw`。
- 理由：暗恋和恋爱应援委员会的校园喜剧，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v36554；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：柳川幸介暗恋着社团伙伴小澄友香，却担心表白会破坏现有关系，迟迟不愿迈出一步。姪浜舞与天神晶子组成的“恋爱应援委员会”决定出手相助，把他的平静日常……

### v36555

- 作品：这份恋情、予以保留、游园会；文本结论：`sfw`。
- 理由：文化祭、接吻传说与后续故事介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v36555；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：秋日文化祭将至，藤高流传着“文化祭期间接吻，就不会在下次文化祭前分手”的传说。恋爱应援委员会借机再度行动。本作为《这份恋情、予以保留、》的后续 ……

### v36556

- 作品：这份恋情、予以保留、情人节小剧场；文本结论：`sfw`。
- 理由：赠送巧克力的情人节短篇音声说明，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v36556；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：ヒロインたちからチョコレートをもらうシチュエーションボイス企画！！ 気になるあの娘は一体どんなチョコレートを作ってくれるのか！？！？ プレイ時間……

### v36557

- 作品：这份恋情、暂时待定、；文本结论：`sfw`。
- 理由：恋人事故离世和相似转校生的青春故事，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v36557；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：主人公企救丘太一は高1の夏 他校生川端翼と甲子園県予選で出会う しかし交際間もなくして川端は水難事故で帰らぬ人となってしまう ―高校生の恋は、高……

### v36558

- 作品：这份恋情、暂时待定、 情人节小剧场Z；文本结论：`sfw`。
- 理由：巧克力赠礼和短篇音声说明，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v36558；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：以情人节为主题的短篇情景音声作品。几位女主角准备了各自的巧克力与告白般的赠礼场景，流程约十分钟；即使没有体验过系列前作，也能独立感受情人节气氛。……

### v44249

- 作品：这份恋情、迎来終焉。；文本结论：`sfw`。
- 理由：毕业相册和最后约会的系列最终篇，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v44249；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：《这份恋情》系列的最终篇。天神在整理委员会室时找到旧毕业相册，照片中竟出现了大野城学生会长。一直被谜团包围的会长决定亲自揭开真相，并提出与大家进……

### v49795

- 作品：这份恋情、迎来终焉。情人节小剧场X；文本结论：`sfw`。
- 理由：情人节巧克力的短篇音声说明，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v49795；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：ヒロインたちからチョコレートをもらうシチュエーションボイス企画！ 気になるあの娘は一体どんなチョコレートを準備しているのか！？ 10分程度でサク……

### v22899

- 作品：拔作岛1；文本结论：`nsfw`。
- 理由：标题和简介直接围绕强制性规范及性行为宣传。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v22899；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Seiran Island is a tropical eden where wanton sex acts are encouraged un……

### v23741

- 作品：拔作岛2；文本结论：`nsfw`。
- 理由：简介直接描述成人用品和自慰行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v23741；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：After Junnosuke was victorious in the Pervert War, saving Seiran Island ……

### v50789

- 作品：星之终途后日谈：渺茫希望的日记；文本结论：`sfw`。
- 理由：官方后日谈剧本改编与同人制作说明，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v50789；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：以官方后日谈剧本制作的同人游戏，原作的豪华限定版实体游戏中可以找到日语剧本。……

### v29443

- 作品：星之终途；文本结论：`sfw`。
- 理由：末日机器人、人造人与旅途主题，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v29443；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：只要去往天空的彼方，就能成为人类――。  被到达奇点的机械群所支配的地球。 人类就在那角落中，敛声屏息地苟延残喘着。  “搬运工”接到了一份委托……

### v8436

- 作品：是谁杀了知更鸟；文本结论：`sfw`。
- 理由：家庭焦虑、教师和跟踪者交织命运，未展开性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v8436；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Kotori is a reserved schoolgirl and is pretty much uninterested with any……

### v2968

- 作品：架向星空之桥；文本结论：`sfw`。
- 理由：转学迷路、意外接吻和误会的简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v2968；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Kazuma moved to Yamabiko-chou due to his younger brother Ayumu’s health ……

### v22847

- 作品：树莓立方体；文本结论：`sfw`。
- 理由：返乡、帮助他人与校园喜剧介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v22847；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：From this day on, I will change. I will do good for others. In essence, ……

### v20431

- 作品：樱之刻；文本结论：`sfw`。
- 理由：天才、艺术和美的哲学主题介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v20431；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Geniuses, the talented, and the ordinary. Weak gods and strong gods. A s……

### v562

- 作品：樱之诗；文本结论：`sfw`。
- 理由：丧父、重逢、艺术与成长主题，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v562；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：ーWhat comes after happiness?  It is springtime, and Naoya Kusanagi has j……

### b315601

- 作品：尼特与天使与色色家族；文本结论：`nsfw`。
- 理由：原名和别名直接以色情家庭为标题；整理简介不能使完整页面安全。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://bgm.tv/subject/315601；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：一名足不出户的青年遇到自称天使的桜子，被要求重新开始生活，并与一个三人家庭共同居住。作品通过日常交流和外出事件推进人物关系，采用3D人物与影像演……

### v15637

- 作品：永不落幕的前奏诗；文本结论：`sfw`。
- 理由：读心能力与封闭内心少女的故事，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v15637；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Shuu is able to read the feelings of others. However, it only brings him……

### v45247

- 作品：爱语 -Silver Snow Sister-；文本结论：`sfw`。
- 理由：花滑、相亲应用和恋爱教学，亲属恋爱未展开性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v45247；元数据采集时间 `2026-10-19T04:53:07.500Z`。
- 简介核验片段：Hoshitsugu Kotetsu and Hoshitsugu Shirone are non-blood-related siblings……

### v34848

- 作品：甜蜜夏日；文本结论：`sfw`。
- 理由：转学、乡村夏日和青春恋爱；R18 来源标签只表示分级提醒。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v34848；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：青い海と深緑の山に囲まれたそこに主人公は引っ越してきた。都会の競争社会に揉まれた彼にとって、この場所は、静養ではなく新たな戦いの場所  ――に、……

### v27436

- 作品：真实动漫情境体验2；文本结论：`nsfw`。
- 理由：标题别名和简介直接含色情创作、自慰和具体性行为宣传。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v27436；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Tooru Seo, the protagonist, documents his irrepressible erotic fantasies……

### v25170

- 作品：神社里的猫巫女；文本结论：`nsfw`。
- 理由：简介直接以 sexual cohabitation 宣传性生活。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v25170；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Nekofuku Shrine is a small shrine located in a corner of Akihabara. It i……

### v3770

- 作品：秽翼的尤斯蒂娅；文本结论：`sfw`。
- 理由：浮空都市、贫穷和灾难；提及尸体及暴力但未展开血腥细节。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v3770；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：在很久很久以前， “人类”是由上帝所派遣的天使所创生的。 作为唯一一种懂得祈祷的语言的生物，“人类”藉由天使的帮助获得了伟大的发展。 但是，在那……

### v3144

- 作品：素晴日；文本结论：`sfw`。
- 理由：玩偶、星空和超现实谜题的简介，无露骨性描写，不据此判断游戏本体。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v3144；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：One day, Minakami Yuki witnesses a stuffed toy falling through the air. ……

### v1115

- 作品：繁花落舞恋如樱；文本结论：`sfw`。
- 理由：返乡、独居和校园重逢的介绍，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v1115；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Maito came back to his hometown and started living alone one year ago. H……

### v32183

- 作品：绘缘蜜恋；文本结论：`sfw`。
- 理由：画家转任教师与三位少女关系的简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v32183；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：The protagonist, Nabeshima Tatsuya, was a world-renowned painter.  Howev……

### v5922

- 作品：虚之少女HD；文本结论：`sfw`。
- 理由：诅咒、谋杀谜案与侦探调查，未展开血腥细节或性行为。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v5922；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：In the years before Japan went to war and the world went to hell, amidst……

### v10680

- 作品：近月少女的礼仪；文本结论：`sfw`。
- 理由：女装求学、服装设计和身份隐瞒，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v10680；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Navel tenth anniversary project. The art is done by Nishimata Aoi and Su……

### v18148

- 作品：野良与皇女与流浪猫之心1；文本结论：`nsfw`。
- 理由：简介直接提及色情书籍和性知识情节。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v18148；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：Nora lives together in Sakuragabuchi with Shachi, a girl younger than hi……

### v19841

- 作品：野良与皇女与流浪猫之心2；文本结论：`nsfw`。
- 理由：简介为海边后续故事，但现有标签直接宣传 Naked Sprites。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v19841；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：This is the sequel for Noratoto, featuring new heroines Iris and Noel. S……

### v182

- 作品：青空下的约定；文本结论：`sfw`。
- 理由：简介提及内衣和意外闯入但未展开性行为，主体为离岛与离别主题。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v182；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：One morning, Hoshino Wataru found a sleeping girl - in nothing but her u……

### v37843

- 作品：飞鸟会长不肯认输；文本结论：`sfw`。
- 理由：学生会长误会、脸红和拾到笔记本的校园恋爱，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v37843；元数据采集时间 `2026-10-19T03:15:35Z`。
- 简介核验片段：The female lead is the student council president of a prestigious school……

### v22880

- 作品：宿星Girlfriend；文本结论：`sfw`。
- 理由：已整理的魔法少女救援与红线同居简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v22880；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：平凡的男主角遭到怪物袭击，暗恋的同班女生夕里以魔法少女的身份出手相救，却在保护他时身受重伤。为了保住两人的生命，他们被一条魔法红线连接起来，康复……

### v23290

- 作品：宿星Girlfriend2；文本结论：`sfw`。
- 理由：已整理的使魔契约和同居关系简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v23290；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：男主角在附近的公园遇见神秘的魔法少女玛娅，并意外成为她的使魔。获得力量的代价，是两人必须用魔法绳索时刻相连，以维持使魔的生命。突然开始的同居生活……

### v23772

- 作品：宿星Girlfriend3；文本结论：`sfw`。
- 理由：已整理的魔法少女异常与共同生活简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v23772；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：《宿星Girlfriend》系列第三作。男主角在某个夜晚遭到后辈魔法少女袭击，被夺走生命力。为了查明少女身体发生异常的原因，魔法少女组织决定让两……

### v53590

- 作品：常轨脱离Creative Re:Re:call；文本结论：`sfw`。
- 理由：同人展与本篇之外的新故事简介，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v53590；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：和泉智宏因抽签成为学生会长，起初只想平稳完成工作，却在与伙伴们相处的过程中逐渐投入其中。某天，他被拉去参加同人展，担任个人社团的工作人员。忙完后……

### v47175

- 作品：SELECT OBLIGE；文本结论：`sfw`。
- 理由：阶层、精英学园与生存奋斗，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v47175；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：在财富、教育和安全被少数精英垄断的世界里，出身贫民区的布波能凪获得了改变命运的机会：每年仅有一人的特别入学资格，让他踏进精英云集的樱元学园。然而……

### v37021

- 作品：FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜；文本结论：`sfw`。
- 理由：未来都市、AI 少女与交流主题，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v37021；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：在个人全息 AI 助手“Tink”如同智能手机般普及的近未来，男主角从乡下搬到先进都市，开始新的生活。祖父留下的旧式手机里，竟藏着一个与众不同的……

### v39197

- 作品：FLIP＊FLOP ～RAMBLING OVERRUN～；文本结论：`sfw`。
- 理由：天才少女、科技都市与觉醒恋情，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v39197；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：在前沿科技都市，每天都有新的发现与发明。天才少女兰生活在这里，她拥有出众的头脑，却并不完全理解自己。某天，对前辈萌生的恋爱情感成为她无法轻易解答……

### v15708

- 作品：千之刃涛，桃花染之皇姬；文本结论：`sfw`。
- 理由：帝国覆亡、复国和武士信念，无露骨性描写。
- 审核对象：两份快照同编号的标题、原名、全部别名、元数据全部标题、简介、标签和警示。
- 来源：https://vndb.org/v15708；元数据采集时间 `2026-10-29T17:50:18Z`。
- 简介核验片段：延续两千年的帝国被外来势力征服，昔日的安宁化为废墟，生活在其中的人们仍努力寻找明天。皇位最后的继承者为夺回故国而寻求力量；失去过去的武人则希望找……

## 版本逐项待核实

不改变生命周期及既有默认版本。`titleSafe` 仅审核名称，不代表资源已分类。

### version-legacy-22f82f586933328e09f8545a

- 作品 `v27448`，版本 1：ATRI。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a1a835ec6184bfd5142f454f

- 作品 `v4`，版本 1：CLANNAD。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-37a5c1365c6dec71ede5d1a3

- 作品 `v97`，版本 1：沙耶之歌。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-ab8ed81c42a7266e3ca6cc61

- 作品 `v18636`，版本 1：希尔薇。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-caa815636729e8cfa7a09a46

- 作品 `v1194`，版本 1：缘之空。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-2bc9744f4a39fda45c162027

- 作品 `v1286`，版本 1：eden*。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-fb8b326a69b71beee0e909a0

- 作品 `v1085`，版本 1：3days～満ちてゆく刻の彼方で～。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-0a8a7282eb43a670959e29ae

- 作品 `v26310`，版本 1：NinNinDays。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-9eec48bf553b29f80a0cf3b6

- 作品 `v32805`，版本 1：NinNinDays2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-2bac9ede31401bad314f5d65

- 作品 `v30216`，版本 1：Princess×Princess。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-163db5b7a02c581d83d546aa

- 作品 `v8038`，版本 1：万华镜系列 · 万华镜1。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-51fb3bbaebe819639e1b00cb

- 作品 `v8038`，版本 2：万华镜系列 · 万华镜1 替换ogv。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-34a982d43f20824c615aa356

- 作品 `v14240`，版本 1：万华镜系列 · 万华镜2.5。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-91cbd8b181dfcf0b753c104d

- 作品 `v14240`，版本 2：万华镜系列 · 万华镜2.5 替换ogv。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-434dbf1e3ea7d9835fbff5ec

- 作品 `v14365`，版本 1：万华镜系列 · 万华镜3。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-4739feefe694a036c750c25c

- 作品 `v14365`，版本 2：万华镜系列 · 万华镜3 修复。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a05a24c64b95e9e4c73d69f1

- 作品 `v14365`，版本 3：万华镜系列 · 万华镜3 跳kaleidoscope。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-16310c7b01d5049f9ffa78ea

- 作品 `v27057`，版本 1：万华镜系列 · 万华镜5。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-9d58bcf41c683470e5771057

- 作品 `v27057`，版本 2：万华镜系列 · 万华镜5 修复。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-032e99675c2271819eea7e73

- 作品 `v27057`，版本 3：万华镜系列 · 万华镜5 跳kaleidoscope。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-fe2406e269b2dc19be3a75ba

- 作品 `v44184`，版本 1：万华镜系列 · 万华镜6 demo。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-c193d7dd6680727121b1f9d6

- 作品 `v44184`，版本 2：万华镜系列 · 万华镜6 demo0.91。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-ad49d61a350643ebf45d85b5

- 作品 `v44184`，版本 3：万华镜系列 · 万华镜6 demo0.92。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-31cf96913037760bf3f22036

- 作品 `v44184`，版本 4：万华镜系列 · 万华镜6 demo0.93。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-8be91910e078a0119ba298d4

- 作品 `v33099`，版本 1：保健室的老师与哥特萝莉的校医。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-4e9ebe39ce34bffc966cf237

- 作品 `v33969`，版本 1：保健室的老师与恶魔般的会长。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-985c76e84a4c4e9380401161

- 作品 `v28666`，版本 1：保健室的老师与沉迷吹泡泡的助手。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-ece0d0fae22a134abcbf8b22

- 作品 `v7738`，版本 1：君与彼女与彼女之恋。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-55842667e349faaaad5daae5

- 作品 `v10597`，版本 1：夏空的英仙座。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-eec29e88f9c64b1a6ba50d5c

- 作品 `v8158`，版本 1：大图书馆的牧羊人。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a8c2e67a990feed19dedb3aa

- 作品 `v6589`，版本 1：女装山脉。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-67c9c4a576fcc784c44eafd1

- 作品 `v33206`，版本 1：妹妹母亲。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-9a1261272a5772ecb5592bcc

- 作品 `v9303`，版本 1：妹调教日记。
- `sexualContent: unknown`；`titleSafe: false`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-28ccd8d92b51623f2011170e

- 作品 `v13190`，版本 1：妹调教日记fd。
- `sexualContent: unknown`；`titleSafe: false`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-7d8b5a9c884b57e6796265c4

- 作品 `v14805`，版本 1：小小的爱情公寓。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-46214980e42483df202ceab1

- 作品 `v11071`，版本 1：万华镜系列 · 万华镜2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-67520f0d0345af13ed1be2ec

- 作品 `v11071`，版本 2：万华镜系列 · 万华镜2 修复。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-ff6a61f773272d2a1e61609b

- 作品 `v11071`，版本 3：万华镜系列 · 万华镜2 跳kaleidoscope。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-dbdae3ca10bd76d1ab998ba6

- 作品 `v19182`，版本 1：万华镜系列 · 万华镜4。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-e1e29253c2fd43ddc771365f

- 作品 `v19182`，版本 2：万华镜系列 · 万华镜4 修复。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a378c290085945c2a66a5e1e

- 作品 `v19182`，版本 3：万华镜系列 · 万华镜4 跳kaleidoscope。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-2a67a4d4f50f9f8b69621a75

- 作品 `v12246`，版本 1：少女理论及其周边。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-c89356e75eb8577e08dda1e1

- 作品 `v33205`，版本 1：常规脱离creative凸。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-79060b38748739bd8e64e718

- 作品 `v27449`，版本 1：常轨脱离Creative。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-3a6409c0cdde7c72c3f5985d

- 作品 `v27457`，版本 1：徒花异谭。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-e421fa9d2b91b91b55c06c99

- 作品 `v36554`，版本 1：情人节小剧场 · 1这份恋情、予以保留、。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-862831b35153b8527b97103b

- 作品 `v36555`，版本 1：情人节小剧场 · 2这份恋情、予以保留、游园会。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-6e9fbf4620fbe0a8faac2ea7

- 作品 `v36556`，版本 1：情人节小剧场 · 3这份恋情、予以保留、情人节小剧场。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-c8c3354e1ad697410f361147

- 作品 `v36557`，版本 1：情人节小剧场 · 4这份恋情、暂时待定、。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-d59b2445f0f42f0cc649572b

- 作品 `v36558`，版本 1：情人节小剧场 · 5这份恋情、暂时待定、 情人节小剧场Z。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-3aa2e08ae7ef40d85fd49212

- 作品 `v44249`，版本 1：情人节小剧场 · 6这份恋情、迎来終焉。。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-512eb028c2f298f534d2de34

- 作品 `v49795`，版本 1：情人节小剧场 · 7这份恋情、迎来终焉。情人节小剧场X。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-156b1273e3d67dc3ec603fd2

- 作品 `v22899`，版本 1：拔作岛1。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-589e8be3f37d376dd02787fe

- 作品 `v23741`，版本 1：拔作岛2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-5e3dbea8bde738028caa826d

- 作品 `v50789`，版本 1：星之旅途 后日谈。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-b6f36b1aa99e3f53dbad46c4

- 作品 `v29443`，版本 1：星之终途。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-110fc755bff5f71cb2a6c32c

- 作品 `v8436`，版本 1：是谁杀了知更鸟。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-c0cc212cf2992cc7c3681e85

- 作品 `v2968`，版本 1：架向星空之桥。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-3ab8194b66d726bd4279e3b4

- 作品 `v22847`，版本 1：树莓立方体。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-f71101d6acb2871ade48bcec

- 作品 `v20431`，版本 1：樱之刻。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-b6cc5da681fc717131109dfb

- 作品 `v562`，版本 1：樱之诗 · 1。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-acdb13048e0f27deca44a5ea

- 作品 `v562`，版本 2：樱之诗 · 2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-1b0a56130aa4fb6a5d073fdf

- 作品 `b315601`，版本 1：死宅天使。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-12af3d99fdc41dfac94fb78f

- 作品 `v33206`，版本 2：母性萝莉。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a9b121de2f7151e661a702c8

- 作品 `v15637`，版本 1：永不落幕的前奏诗。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-1f804636a46b7c88786a72d9

- 作品 `v45247`，版本 1：爱语。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-a045f2a8a2d68503bd00418c

- 作品 `v34848`，版本 1：甜蜜夏日。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-0749431b49cb164e3a98470d

- 作品 `v27436`，版本 1：真实动漫情境体验2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-7f849d5bf9b1405c681b5df4

- 作品 `v25170`，版本 1：神社里的猫巫女。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-5d0fc085f59f8b32b0607d9a

- 作品 `v3770`，版本 1：秽翼的尤斯蒂娅。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-6eafd4436274aae8762dc65e

- 作品 `v3144`，版本 1：素晴日。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-be3af7162b3b095755065f3f

- 作品 `v1115`，版本 1：繁花落舞恋如樱。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-eb649752b9b3b9ec088e1b24

- 作品 `v32183`，版本 1：绘缘蜜恋。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-33474c5ab851410a1da3491a

- 作品 `v5922`，版本 1：虚之少女HD。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-2d0044119e0bad2c44e29dff

- 作品 `v10680`，版本 1：近月少女的礼仪。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-503f16b56d7c648804d85b51

- 作品 `v18148`，版本 1：野良与皇女与流浪猫之心1。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-8675748d868a788562284aaa

- 作品 `v19841`，版本 1：野良与皇女与流浪猫之心2。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-b2daa513541305560c3fcbae

- 作品 `v182`，版本 1：青空下的约定。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-legacy-78cfdb60c00f9fe6d0dd1e44

- 作品 `v37843`，版本 1：飞鸟会长不肯认输。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-ef49dd01-c904-518f-aba7-50a36d46c596

- 作品 `v22880`，版本 1：宿星Girlfriend · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-2db31864-3a96-519e-be67-b75cac750691

- 作品 `v23290`，版本 1：宿星Girlfriend2 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-8949d767-3c75-5d50-ac5d-1e0693108a6a

- 作品 `v23772`，版本 1：宿星Girlfriend3 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-6a43fdcc-d01c-5754-9bd0-dd660ea6d80f

- 作品 `v27449`，版本 2：常轨脱离Creative · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-c8005fb2-d1bc-5392-b97a-0f305c97fb2b

- 作品 `v33205`，版本 2：常轨脱离 Creative 凸 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-a7b73d5e-7412-5654-87a2-d71f51a0b3a8

- 作品 `v53590`，版本 1：常轨脱离Creative Re:Re:call · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-cbc04bd1-9eaa-51db-906e-d434742211f8

- 作品 `v22847`，版本 2：树莓立方体 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-d872fbdb-a9a4-550e-8699-928cacc9750e

- 作品 `v47175`，版本 1：SELECT OBLIGE · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-0b9089be-6d34-5e21-85c4-c2020ac2a913

- 作品 `v37021`，版本 1：FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-7c7c87f6-1afd-549b-ab5b-5af40f40ec93

- 作品 `v39197`，版本 1：FLIP＊FLOP ～RAMBLING OVERRUN～ · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-933436a8-85f5-5a76-9568-5f29faff9785

- 作品 `v1115`，版本 2：繁花落舞恋如樱 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-33224257-9a7b-5d77-b690-2c0fd9643a48

- 作品 `v562`，版本 3：樱之诗 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-d6b4fc84-a347-5a28-9184-579085dadfa1

- 作品 `v20431`，版本 2：樱之刻 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-6016ffaf-4448-53d8-a129-b907b13b2d77

- 作品 `v27448`，版本 2：ATRI · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

### version-476a1807-cfd5-5e67-8772-5ca53e9b616c

- 作品 `v15708`，版本 1：千之刃涛，桃花染之皇姬 · WebGAL 2026-10-27。
- `sexualContent: unknown`；`titleSafe: true`。
- 缺项：实际包对应的发行版标识、补丁/裁切状态及可信内容分级；旧路径、引擎、demo 与修复字样不能补足证据。

## 图片逐项来源与缺项

每行是唯一缓存素材；归属列列出全部引用。尚未执行逐图视觉人工审查。

| 缓存 URL | 来源原图 | 归属 | 当前结论与缺项 |
| --- | --- | --- | --- |
| `/media/ac360acba64701eb1075c8cfaed8827a52e743d25e19bff98956f199c253a993.jpg` | https://t.vndb.org/cv/12/76012.jpg | v27448/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/67a6d57352613c3275e757f8039b84085f187b5925e73b075b6664ab9f01b3c9.jpg` | https://t.vndb.org/sf/04/137404.jpg | v27448/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8002bb596022c7f9b5b23dc5bb7a0d036ca9b6f6025f55b232b966a5298b3210.jpg` | https://t.vndb.org/sf/05/137405.jpg | v27448/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/94deb73eae8f8ca086e8db6729529c30212fabe697c65d219cdb7af22ac5f692.jpg` | https://t.vndb.org/sf/10/137410.jpg | v27448/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/533f19199ce316e3985f89d1d636fcdee0232e2ddc0debc6bda0eb660581d086.jpg` | https://t.vndb.org/sf/11/137411.jpg | v27448/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8823a7beaaf36474d28b7d7ce57d604995a7da7781902b222fbfe802ef29eb02.jpg` | https://t.vndb.org/sf/60/137560.jpg | v27448/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c81c9a4cb52fc16b1829df52548a5e31caea4133a0a6f53013c52c868ab293de.jpg` | https://t.vndb.org/sf/63/137563.jpg | v27448/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6cd724c4a89d1db5ea014908103c0c9baeccd1f18e32068c3377eaa3138615b0.jpg` | https://t.vndb.org/cv/95/75895.jpg | v4/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/e763a554d2c5ebf5f92e1b4fbf958249f916a24679ef174deda89e4ef8947417.jpg` | https://t.vndb.org/sf/67/8367.jpg | v4/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/808c8f16197671f10dc71ebe4228d754d214599d4831770f64f7a3e93e655567.jpg` | https://t.vndb.org/sf/69/8369.jpg | v4/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/0c5bfc8f7c6512de405a0ec0360d668a89b4c67a1c5307c2f30f19acbd8673ef.jpg` | https://t.vndb.org/sf/70/8370.jpg | v4/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d1736d1147b1dda37584bcfcc8ce3ac6a70fbe077b5a5f6ec7ef116fe699ee0b.jpg` | https://t.vndb.org/sf/72/8372.jpg | v4/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d6f8884f640e009c2c7ba6c64e833e72e6fb6fb3a3a69b34b2805ee504628538.jpg` | https://t.vndb.org/sf/74/8374.jpg | v4/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7b95e79133cfc5a96b991beb691641bd55103fad9cfdc1b7a72722ef903fb4e5.jpg` | https://t.vndb.org/sf/17/9617.jpg | v4/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/671372960d4e573211ee0e9cc8d60f3cb110e36e6898ca3d0568875eafda60b3.jpg` | https://t.vndb.org/cv/40/104940.jpg | v97/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/3f3953ce2f10e0c98ece64569ef95a4e9c188fd949c04e3edaad0dec1238beee.jpg` | https://t.vndb.org/sf/63/263.jpg | v97/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/996e03606e286a03dec9930156eb4190d04449e9ec7ca1b17e149f368d9a10dd.jpg` | https://t.vndb.org/sf/66/266.jpg | v97/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6e24ba39e4696fd272257390b948b2535d1eb56fdc7aca5cf39ac816d311af2b.jpg` | https://t.vndb.org/sf/67/267.jpg | v97/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/185c2464d8eedfeb062f57c534fe028af03fac7908bda79e1ec608cd3f076d14.jpg` | https://t.vndb.org/sf/80/123280.jpg | v97/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/dc776939b797f08d60ae06617500406acbede034865c61800a5416e0098a49a5.jpg` | https://t.vndb.org/sf/84/123284.jpg | v97/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/335636699ed16e186db6fbbb17607ebc66c4fdf91b78000753c2725da7da2817.jpg` | https://t.vndb.org/cv/77/139077.jpg | v18636/cover | 性内容 0 / 暴力 0；8 票；封面 |
| `/media/17472a92746416679b8a59f4a4f5a4cca50c7db72c21ad6b67c3885ee8200380.jpg` | https://t.vndb.org/sf/78/91778.jpg | v18636/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/99661bdd01639eb74ac5f76149be746bdf5d4ba9d2b41f3aa8101c90fddb1039.jpg` | https://t.vndb.org/sf/80/91780.jpg | v18636/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/acfc3442c4489bf1b0dc90e68068f27aa9b13440321fbcb9262a1467a75414af.jpg` | https://t.vndb.org/sf/83/92083.jpg | v18636/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7e7f91e3728f520421d39fd37f0462b5cb36a9c698bd868c79149787be0cc9ca.jpg` | https://t.vndb.org/cv/84/96184.jpg | v1194/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/52820bfd89d3121fcad7c54a8d2a6473d409a8728575f4cbca33a599773b7515.jpg` | https://t.vndb.org/sf/76/976.jpg | v1194/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a21a23e91057d8ca7fa7923f7d9e4b97cc62f645683d97354cbc4dbacdbe370f.jpg` | https://t.vndb.org/sf/77/977.jpg | v1194/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/53dd0b2c657329b3cfafcfa84c4d53e007a87ac24d10e00851b0a430bc91b96b.jpg` | https://t.vndb.org/sf/78/978.jpg | v1194/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6f5f20e612cfc08f70f3091712f4855ef594dfa5717ba051759f62389613bb55.jpg` | https://t.vndb.org/sf/41/1141.jpg | v1194/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8a4bbe0e8bb2e86227e99a8f6093ddb3df854fc9ad488ff8817252e2f29ee9c0.jpg` | https://t.vndb.org/sf/13/2413.jpg | v1194/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/827034eea3979fa3447ea57f60508fe0babc8df530e49006c1764d7290186829.jpg` | https://t.vndb.org/sf/78/212178.jpg | v1194/screenshot-6 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/90ca91261ef87311668e2f3fd254d34248c4f435a83e773378d378df428586f9.jpg` | https://t.vndb.org/cv/17/79017.jpg | v1286/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/0300de10af9e30cf6d260a0909e21d9c1f1f492e8c7420d538918c3f0c505098.jpg` | https://t.vndb.org/sf/83/12583.jpg | v1286/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/50dba485dcace0476c002194a3500e19639037936f6ccf0f9b1047819940e6ff.jpg` | https://t.vndb.org/sf/85/12585.jpg | v1286/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/5f9dbce14f2905ac1ac4bde5fcec4142126ada43c73678c5314bd47955ea0ce9.jpg` | https://t.vndb.org/sf/86/12586.jpg | v1286/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/fd5dc4cff85f532e333a03405e64ea971a765dba67f8de80658d305680a4a30a.jpg` | https://t.vndb.org/sf/87/12587.jpg | v1286/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/efa2481ea19f4a1b9d6de60e75199c8169d56d32f054a35e4e258da7c0e527bb.jpg` | https://t.vndb.org/sf/88/12588.jpg | v1286/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/959257533170c19209a6e78ce040a863766061b870051e81ec78581050339509.jpg` | https://t.vndb.org/sf/90/12590.jpg | v1286/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a9667bed9f446fa8eac242299539322624a48943ae4e189cbc2549925356de8e.jpg` | https://t.vndb.org/cv/98/95698.jpg | v1085/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/ed1805578e3ba6f28bd278eb6c9b5ddbf2a75cdecd7b1b32e4ec33495f82f0bc.jpg` | https://t.vndb.org/sf/56/556.jpg | v1085/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ae0a73451c2dfd480f9320541916f2db2762dfd50590713b31db6fb2aee873f1.jpg` | https://t.vndb.org/sf/57/557.jpg | v1085/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f6aa36e9abcdaa851cdd1f5dcaca3b2126afc2ea1cb7ea2bf5b7d49a754f3615.jpg` | https://t.vndb.org/sf/59/559.jpg | v1085/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2cc9377930cb544a3a08e59efd9c5867d94d6b461cc2f7f1595bccca4fd5ac17.jpg` | https://t.vndb.org/sf/61/561.jpg | v1085/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e72e7fe1f784220c14555821863d16ab23f1779d7525f698e3cd61280ab0b89e.jpg` | https://t.vndb.org/sf/62/562.jpg | v1085/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/98ca14b677f81c303bc5cc0fd93f35d331e58fbcf191786d105c868126e09de6.jpg` | https://t.vndb.org/cv/88/82088.jpg | v26310/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/d0ae0d3f365fa687c3250f138d33958580d6952e7787d3e473310883fb074e5d.jpg` | https://t.vndb.org/sf/11/127311.jpg | v26310/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/b880fc3c9f2238cebb0a191a03bb8a83935962574da076b1adf7c096587a9bea.jpg` | https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1698030/header.jpg?t=1642702039 | v32805/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/5579d7c60ede955e94112d91855ca00ee6fd60c95150504d4f243889c8cf278f.jpg` | https://t.vndb.org/sf/00/160800.jpg | v32805/screenshot-1 | 性内容 0 / 暴力 0；15 票；截图可能涉及剧透，尚未核实 |
| `/media/cff46b9c77e311ca3502e2753c9d9378a8acaebcb72cc70338196b22cda16e5b.jpg` | https://t.vndb.org/sf/57/175857.jpg | v32805/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/28f56396aeb33583ba0375d1dafb3413e24035919617e7c9d8aa1169b9c5bd7b.jpg` | https://t.vndb.org/sf/58/175858.jpg | v32805/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/14b3137c37ae79b1e8a8064391e08b348ef16b43bc0dfe8375d3730fe67726a5.jpg` | https://t.vndb.org/sf/59/175859.jpg | v32805/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6db3f312daefdde19da0f9d1eea26e3af9710741b18a147aa2359f319d68fc72.jpg` | https://t.vndb.org/cv/59/94259.jpg | v30216/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/380d68c4b0f97f7cce4eb225a741ee26a8de2b7d3666512d1d97e884a9cbbcf1.jpg` | https://t.vndb.org/sf/84/161484.jpg | v30216/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/34bffe67e732ce7a06dff4d1d847bc231cd349a3fbcad7aeec39f9ce92310735.jpg` | https://t.vndb.org/sf/86/161486.jpg | v30216/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/037561a5d65c1a2256d73730cff3a67a2f4b51a4caefc8fd0a53b115e91d9f10.jpg` | https://t.vndb.org/sf/87/161487.jpg | v30216/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a7f644e4372274a25e2d03fcc5fe056ce79bc184dc96f1bedf6835f2af96c067.jpg` | https://t.vndb.org/sf/89/161489.jpg | v30216/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a3f370320fd7aeb44b33e2c331810b4760b5ce8fc442b770126056ccaa5c450b.jpg` | https://t.vndb.org/sf/91/161491.jpg | v30216/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2304bca577e507e4f37e4019a8795babd6d7199d43dac0a97d1e1ce7495984d9.webp` | https://www.omega-star.jp/biman15thcc/img/movie-title-01.webp | v8038/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/4f2cd75c4681ea09bc48944782ad203f6c12b8df025aa92782e808388983508e.jpg` | https://t.vndb.org/sf/60/25660.jpg | v8038/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/64075e9a48c0d73bdf1c4f86e055732ff4c9d59d82030c57dae50e68a5fec32b.jpg` | https://t.vndb.org/sf/62/25662.jpg | v8038/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/28b3a96d93139ffff99b3737d5fc0d129c84772d27046d678ead17593994bc0a.jpg` | https://t.vndb.org/sf/65/25665.jpg | v8038/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a8bf804d3ed3cb18e6cc1800b13528f2aecd47d054cadffa76037dafac2a0751.jpg` | https://t.vndb.org/sf/66/25666.jpg | v8038/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c1434a84068dd469bc6d7f0967d5565522843a93e902b180807ec3ed01de39d8.jpg` | https://t.vndb.org/sf/67/25667.jpg | v8038/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/375bef7d80254f9b6f1ba5667a92479458756eda3701517027ee9a3991b4efcc.jpg` | https://t.vndb.org/sf/68/25668.jpg | v8038/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/413773495449a3c2ed11edcaf8037b03fbca50f9c0636a7d853081f4d0694f8d.png` | https://www.omega-star.jp/bimanharuhtml/topmenugrp.png | v14240/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/8cc12175bb651b04662ad0944c17a7652697f6e0bd7e82297caffd4474befd64.jpg` | https://t.vndb.org/sf/71/67771.jpg | v14240/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7ba78abb9ed5e7fa43e93fdb2a67767b32132289b038b72933d0eea9faabb92b.jpg` | https://t.vndb.org/sf/73/67773.jpg | v14240/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f9aaf4232aaa35c04dc665079453e70732596b6f5f304c630ca1b9294fb709b0.jpg` | https://t.vndb.org/sf/74/67774.jpg | v14240/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f7096f0aada0b9d01fe2dfc92c1547a96a2faeccb812c609071287d817127a8c.jpg` | https://t.vndb.org/sf/75/67775.jpg | v14240/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f79531c38378923a6ee8a8bf3ca64c9316bef26c6b755c216f924e4296538ef2.jpg` | https://t.vndb.org/sf/76/67776.jpg | v14240/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/960257381fff85c691eeba1afd5aeeae32ca8ef6b79552c230f65e5895f671f1.jpg` | https://t.vndb.org/sf/77/67777.jpg | v14240/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/54dd909d6935a4ffb72fd551978f593719d3d1bbc47b8149bba4a0c7b73c1522.png` | https://www.omega-star.jp/biman3html/topmenugrp.png | v14365/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/1a96504c80b75062c68e38c337afcae6c59ab7457da451a5356be3a3b92d7de0.jpg` | https://t.vndb.org/sf/61/82761.jpg | v14365/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3d6fdab9aa9348c461a6c7e4d0f9b207417be2fb2f3aead1d1d489a7c22d51da.jpg` | https://t.vndb.org/sf/62/82762.jpg | v14365/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8a792ffb1b9762d1ccd7aee1995ef765f860a0f289d454480f56ca236a304574.jpg` | https://t.vndb.org/sf/65/82765.jpg | v14365/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c72482c2562b0270cc1d97584fdec2ea6518f0797fd9a10da46c8583762d663f.jpg` | https://t.vndb.org/sf/68/82768.jpg | v14365/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6ad4f1b51e05e643f4152dcf4f91f4cccdb6662e0611d53a2f5e128e047627bf.jpg` | https://t.vndb.org/sf/69/82769.jpg | v14365/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4e94697253071bd42bb74f3df5069edfb740a69b77dc8256174d475f99496625.jpg` | https://t.vndb.org/sf/93/83293.jpg | v14365/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/06f86318a5cb77df907fce68b187550f8c407fea4fd94853d7b299c60eabe032.jpg` | https://t.vndb.org/cv/73/144973.jpg | v27057/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/afa3e3f8f9e7a186d1edb3565515fb846e1f5c2d00c0b918bfb0874614c53b48.jpg` | https://t.vndb.org/sf/53/143553.jpg | v27057/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8d535c42b55b6bc820bb86b87a545c251a5a94880910094cdcdd94e1265f9d97.jpg` | https://t.vndb.org/sf/54/143554.jpg | v27057/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a8849211928d544971a74d0d790e09940261d6f868e0f279db062e6fda629176.jpg` | https://t.vndb.org/sf/55/143555.jpg | v27057/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bd8b71e1baef5210c4a6b994cf9f76b256f5002ac67ab29f5446a4027765c621.jpg` | https://t.vndb.org/sf/57/143557.jpg | v27057/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d3810343b375a483f3206b1acd4ab23c2488835919a52832acb67d2e9c9ca600.jpg` | https://t.vndb.org/sf/58/143558.jpg | v27057/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/23781797494c995e4d23cec62c5479e590102f9d13794cc9fcf9dc66a5df66e6.jpg` | https://t.vndb.org/sf/61/143561.jpg | v27057/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/dbe73a43c377b4e3510dd75cde2422cb2f830359977578663da3bc8c63d5715a.jpg` | https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3449440/header.jpg?t=1746617201 | v44184/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/fefc3b517eb862c9116c25e66892c0b0cf0e7c1a68b6792ac6daf55a09412656.jpg` | https://t.vndb.org/sf/89/194789.jpg | v44184/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/608ca0a885643e8ce81d35573734945bf73123604010513da2f7a5cc616d38eb.jpg` | https://t.vndb.org/sf/90/194790.jpg | v44184/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d5ddedad3760136d06fbd4f6547845389c6b5d15eb335e6f29a9f86969c35846.png` | https://citrus-soft.net/product/hokeloli/images/common/logo.png | v33099/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/ffdf478d4553d9a86b189bf91f5e477fa847ba546ddbc6159dff4309f02eed05.jpg` | https://t.vndb.org/sf/19/165519.jpg | v33099/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c7036e125d5fc350815cc6cec4f028f00e3e73a96f7f0da3faec68a021820bef.jpg` | https://t.vndb.org/sf/20/165520.jpg | v33099/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e1705db1f555d3cfcca3c8d0782ed3d9faa71b4f7224af37e858f0d169fa3b44.jpg` | https://t.vndb.org/sf/21/165521.jpg | v33099/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8e3d34fb748ca504eb8fe278844d44cbdea9da416778a98277a1cc5cbce9d46a.jpg` | https://t.vndb.org/sf/22/165522.jpg | v33099/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2bfca9900dcfb3fae6d43308ad41fb9df4806616d9853d8feb87219039dcabc5.jpg` | https://t.vndb.org/sf/23/165523.jpg | v33099/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bc74a782e65aadb5b18a98c7bdb360b243653d0a3d437517b6c439ac649ba8b6.jpg` | https://t.vndb.org/sf/24/165524.jpg | v33099/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7ee6d98c63df9488576e18db4bc8753e317f6389eb25e2389438684dbe48538a.png` | https://citrus-soft.net/product/hokecho/images/common/logo.png | v33969/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/e7e9dc87c475b0e0a0b4b5d8d46a4e844267241a1e1b524a0bbf3f0cc3b7aab6.jpg` | https://t.vndb.org/cv/54/94254.jpg | v28666/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/fbb1431c6d3281aea2455afd577d7518b3bcef29212e037b6a3fa49f101885eb.jpg` | https://t.vndb.org/sf/95/144095.jpg | v28666/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/eb33d36935600a76a848f2a4554385becd77064c3ed3de041753253f798df1da.jpg` | https://t.vndb.org/sf/96/144096.jpg | v28666/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/da6363d67bf2ee3bce559966233d4ac4c7cf38fe603ebaec3a4520001d925462.jpg` | https://t.vndb.org/sf/97/144097.jpg | v28666/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1185784df137bd45412b5c4ad7e8712462622a940262eb73df122ab92aef431e.jpg` | https://t.vndb.org/sf/74/180574.jpg | v28666/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e7295a2364e846575ef00709277c1710b5052f2baf712fa7c023fc94518180f4.jpg` | https://t.vndb.org/sf/76/180576.jpg | v28666/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3561664e80d0cf9927669f5fcbba1147264b1e11faefd2bbe4b7b61e5715604a.jpg` | https://t.vndb.org/sf/77/180577.jpg | v28666/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/754eb994f458bc5557d065acc86433f51da767ea2c67d47a3dbc35c6f967b7ea.jpg` | https://t.vndb.org/cv/07/77907.jpg | v7738/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/d9984aca3bfd1053b311b53aeab8eaf392738813a1a4658331dd3da504320c45.jpg` | https://t.vndb.org/sf/07/50207.jpg | v7738/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e2aa75ed679d63a5e486e4ce29f75a2af7a2198356a1c3dbd6d66507d759af5f.jpg` | https://t.vndb.org/sf/84/93084.jpg | v7738/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/b611c1e058033501b668c6e8c7b443306febe73e318fa394b428b193e1408cb8.jpg` | https://t.vndb.org/sf/44/136344.jpg | v7738/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f683f1d88c4fca5ae6665ce6200b9f859941bcac1b101576f241ecf71caba773.jpg` | https://t.vndb.org/sf/45/136345.jpg | v7738/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2a2813ff331a4a0cc0e04987bdecab363be8054f8467b083b91caee0cb56f7bd.jpg` | https://t.vndb.org/sf/98/138098.jpg | v7738/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ce08b084ea768a84947269c7ece94e92a4e1120dc1785a173f9f0185cfd81a0e.jpg` | https://t.vndb.org/sf/99/138099.jpg | v7738/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/55d49b1b1780da1226b23a3e58b74aca9249021bd3e06927d94ef41aab1dbfec.jpg` | https://t.vndb.org/cv/00/89200.jpg | v10597/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/6404c4164513aefe5d257a584dd4510fab5864e381473fa95b07b6b3c372e9f8.jpg` | https://t.vndb.org/sf/58/40458.jpg | v10597/screenshot-1 | 性内容 0 / 暴力 0；15 票；截图可能涉及剧透，尚未核实 |
| `/media/bbe7424134e7692973f58291961a59b994a8ce6a016fa77c6fa4f075a22e55c7.jpg` | https://t.vndb.org/sf/60/40460.jpg | v10597/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7655cd38da0dc6b57c9ff71adccf5e896563fa25575b1b3db993239a229ce6cc.jpg` | https://t.vndb.org/sf/93/63293.jpg | v10597/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3e65b66561073036dd8b486c330267bb6d4e87e231927f6ee3fdaf57e1f944cf.jpg` | https://t.vndb.org/sf/26/63426.jpg | v10597/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a80ed773a6b63477e6329677d0873e35591c9d9d16c504cf3c8c620450a00335.jpg` | https://t.vndb.org/cv/72/86072.jpg | v8158/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/86cc135992bc33533500c431008dce527783a516dfee225cb31fa2e67ca8f916.jpg` | https://t.vndb.org/sf/21/41621.jpg | v8158/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/42281a2b2eb7156e63c17ae510c298e22b0ac46b90a5dc7c092847329cf80ea5.jpg` | https://t.vndb.org/sf/06/50306.jpg | v8158/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7f3033fd3ac40bd551a62bc989426233ed34e04ad30c67a0a9c443c189de486d.jpg` | https://t.vndb.org/sf/07/50307.jpg | v8158/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2423ced556609bbfce42f3adc17335a9468a75696c321b569b477fec37f6c99f.jpg` | https://t.vndb.org/sf/08/50308.jpg | v8158/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/fac254b55af5cd09e785d0a88b19c1e0a1b09554ab6778bd50f71f89720026bd.jpg` | https://t.vndb.org/sf/07/101507.jpg | v8158/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/560c2dc18f35a3a750a630e14197a6d6c3ca5b45abc5a18126b3162dbef681c5.jpg` | https://t.vndb.org/sf/69/123169.jpg | v8158/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/aa38d328f28f643cfebb903947135f060a1da122c8567259531bf2b0a8494a24.jpg` | https://t.vndb.org/sf/97/20297.jpg | v6589/cover, v6589/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a8af73017948ba4fa5d4ac60c39a23021b3b55029f665a97e70f154bbbeb7d46.jpg` | https://t.vndb.org/sf/98/20298.jpg | v6589/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6ff0bdf317b3ee1221ae5a7b4de2d3c36220b29bd81a9281dd40c437c9359d36.jpg` | https://t.vndb.org/sf/99/20299.jpg | v6589/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bd9b8cbfa14f43c7ae352808b55732b6161c95ccd626a609f4b5264c4d041251.jpg` | https://t.vndb.org/sf/00/20300.jpg | v6589/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/229b0344bf0f30a67fe00a46882452183b7395736e81c2e7cdfb325d8b6c98bc.jpg` | https://t.vndb.org/sf/20/163020.jpg | v6589/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ef3b1f6003d7d1dcb27e497bf551800f81b16616cab670bbda67ae508d4bce27.jpg` | https://t.vndb.org/sf/23/163023.jpg | v6589/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/5a3d12fe1dbf3d5b855e485d6875561e66f2a17706c63f8a227c7478af14488f.jpg` | https://t.vndb.org/sf/51/166451.jpg | v33206/cover, v33206/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/635fe13b8a92a34c2adfd15f226c530393ae915fbb8161a7ced3da677adf1585.jpg` | https://t.vndb.org/sf/54/166454.jpg | v33206/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ead65d0b12a8556f9bc940a9d36f9d8d8bd93d0203ad9b4836c5846e0af5530a.jpg` | https://t.vndb.org/sf/58/166458.jpg | v33206/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/44bb3d523ddf9775e50dfe7bb90dece0069e3c03523b1b219b85d25f5598cc39.jpg` | https://t.vndb.org/sf/60/166460.jpg | v33206/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8046abf3fcef254c16618a35f66956f68f2d533f2e7907f98585efe4d738b34d.jpg` | https://t.vndb.org/sf/61/166461.jpg | v33206/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2def3469b1bb4d52f162ab1ffe6a56aa5922f17f37a6c1a111caaf35fe183747.jpg` | https://t.vndb.org/cv/42/135242.jpg | v9303/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/157f4120e30ed6f1c8969cda330799a20cc0e6fd2e5a686027ff87bd96856c0d.jpg` | https://t.vndb.org/sf/95/198995.jpg | v9303/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/932cf1a9efdf661932346ea411ede5c5bcb45e0c2e286e2f66067fc643eec91c.jpg` | https://t.vndb.org/sf/96/198996.jpg | v9303/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f17bfb028f950ae2a1be39050d8603926820b2c3f73cd17a6f92504452303f8f.jpg` | https://t.vndb.org/sf/97/198997.jpg | v9303/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/538a8f11b77065a2857b194adb27d09c0df3a2db49bbcf8f97eb3bfb5105b4e1.jpg` | https://t.vndb.org/sf/40/203140.jpg | v13190/cover, v13190/screenshot-1 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/ca3cda650bc00e018e572eb306e43ddd103891cb78493568137704ba10c75602.jpg` | https://t.vndb.org/sf/43/203143.jpg | v13190/screenshot-2 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/c3c7c4fba391444d47b62b9463702ebdf67fef54d6629ddd288481ea007e9666.jpg` | https://t.vndb.org/cv/73/135273.jpg | v14805/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/e6e4fdf83fb786748d5ea039463f2bf4d054dd356ff9aec9489326dfd35615bc.jpg` | https://t.vndb.org/sf/11/72011.jpg | v14805/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6c7a059916298f20839023bf5150ad7b9538ad7f189c69950a5fed6a087259ae.jpg` | https://t.vndb.org/sf/13/72013.jpg | v14805/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7b0a4d3181f60858d6d62cceb95541ed0a05e94364a7b7267facf1a330af7074.webp` | https://www.omega-star.jp/biman15thcc/img/movie-title-02.webp | v11071/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/b8c62b7084cd38ab8fe189d56546df8f1606e54014a3ef09b0a988df4c9e5180.jpg` | https://t.vndb.org/sf/63/36763.jpg | v11071/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3bf2febe27df2e4a35ac7e272b54229e95bf763f4545cfe6b4dc0fb271d1256a.jpg` | https://t.vndb.org/sf/65/36765.jpg | v11071/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e78c31657238b728c70572ed4cfd1bd0b454477927b4ac8c21cf0d3241ed1eeb.jpg` | https://t.vndb.org/sf/66/36766.jpg | v11071/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9a9ff7b637c1a7e0c743f68213aa6a9cb9720984fc6d943c16b65b3ddee601a2.jpg` | https://t.vndb.org/sf/67/36767.jpg | v11071/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bb8754d7f19ae69315e7964a9526b23e86077f37cbaffd48b0cc9eff117cae77.jpg` | https://t.vndb.org/sf/96/37296.jpg | v11071/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bdf4586d89dc11dc740780331c4e55c32cad2919ba008fa2f03371e2e6c1fd52.jpg` | https://t.vndb.org/sf/82/211782.jpg | v11071/screenshot-6 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/94811dcffe3ac6dcadc89a219ff7143475c4cb196219a5a148f89efeb910ebeb.png` | https://www.omega-star.jp/biman4html/topmenugrp.png | v19182/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/b5dfba5cbe8f2131051a079caa0913487fad0bcf5cf70ffb7f9db09906c813ff.jpg` | https://t.vndb.org/sf/97/105297.jpg | v19182/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3c6c0684149524d52253c491a51ac6224309d038a3b98ec0d48f2c651dba9d30.jpg` | https://t.vndb.org/sf/98/105298.jpg | v19182/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/0bd444bd329ff21df1b5cc4db9c282cd404a0ceaeff360978fa2f5f295f2f461.jpg` | https://t.vndb.org/sf/00/105300.jpg | v19182/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c83c1c7cc41b5a6171048d00c8d01e57f2288878e620d1bcb7aff5667d7073a5.jpg` | https://t.vndb.org/sf/01/105301.jpg | v19182/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c99698ad4017bdb6c47e726f95b8ee96f8dffab1ea0dab2e46e008a1cb6b4e09.jpg` | https://t.vndb.org/sf/02/105302.jpg | v19182/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1772984817c5835fd28edc1b40729e93fcedf772e4f980eb977f16a41a690e1b.jpg` | https://t.vndb.org/cv/46/92146.jpg | v12246/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/525e6823df16a74def5010e5fcbe944e54060219198581132463d9ee62ab8137.jpg` | https://t.vndb.org/sf/67/166767.jpg | v12246/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/86dac906b47f37ec86c3bdfeca35cc388e383920a04e4e44efd43246332749d7.jpg` | https://t.vndb.org/sf/68/166768.jpg | v12246/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/861ae28b6a7adab266bbca3f2e13997474d982dab2b61a95c704597a229675a7.jpg` | https://t.vndb.org/sf/69/166769.jpg | v12246/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6f29be5a9510ea49553efaaa583c4acd692b1ce1273f0f911308cf6d21cc723a.jpg` | https://t.vndb.org/sf/73/166773.jpg | v12246/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/987462c0e84a1c2a00cbd26496e13f07cceb13ac72937912c642700480104dd8.jpg` | https://t.vndb.org/sf/74/166774.jpg | v12246/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8806794080003395d1b942e8663afe4c7863455fef58fe84fd7194a46ba1d170.jpg` | https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3407830/header.jpg?t=1774784859 | v33205/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/e012be2f6b1c5c179941b7d514e203bbfebea0bcc5b431c17af7bf82599bbddd.jpg` | https://t.vndb.org/sf/25/172825.jpg | v33205/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/60014e482a43d13613c91fe794cd34af0204b17d1bca5a5881d18c08877a840a.jpg` | https://t.vndb.org/sf/26/172826.jpg | v33205/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/14b136a9922c520dbadbf9b48fffbc1ffd943bfd315e0a2246bf1882ef35a4ce.jpg` | https://t.vndb.org/sf/27/172827.jpg | v33205/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/533c8b954f7a03d8ede47e1c284816ee58a1953166473495680253d37e620eb8.jpg` | https://t.vndb.org/sf/28/172828.jpg | v33205/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2cc556af064065981eb406963480f04523bd0d966f59a71d5057e76202ffffe2.jpg` | https://t.vndb.org/sf/29/172829.jpg | v33205/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/451baa5a06c2e317239dffaf85bd4b3221b9e65c97829810e69a094be10d492d.jpg` | https://t.vndb.org/sf/30/172830.jpg | v33205/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ecf3b052f77625c9c78d4b0e9a9d6f2f39fafc751fc606361d264e43a6dd5777.jpg` | https://t.vndb.org/cv/27/81627.jpg | v27449/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/6fb1fb0bbf3f5d0df4ebdf84903d0f1facb0224dfc7cb1c6d3dbeaadf93818ef.jpg` | https://t.vndb.org/sf/66/140966.jpg | v27449/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4e27285113af0a0423fa2ad26d639728788f66cadc0f23e8442b3503e68f4a32.jpg` | https://t.vndb.org/sf/67/140967.jpg | v27449/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1cbb3c5e31cf95a872546eae7b61997b065b7b2118031cb1b492778f5a096693.jpg` | https://t.vndb.org/sf/68/140968.jpg | v27449/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/cc3dbd55fc4b27b109945df6dba1ee50dd3557d91998a23e885ff995672dad48.jpg` | https://t.vndb.org/sf/70/140970.jpg | v27449/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1e4f6b059b45f3e0954bcb7a80d55febcb520931dfe2f3faef2e3bc073928169.jpg` | https://t.vndb.org/sf/71/140971.jpg | v27449/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/dae3231927e6ba2d78426b094453dec9b7fa96e8e03dbb2372569dea946e5c77.jpg` | https://t.vndb.org/sf/72/140972.jpg | v27449/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4f0be07279d6a425e551a371d07d367e4ca7623c73fa92febd1c8925dda20d88.jpg` | https://t.vndb.org/cv/37/82537.jpg | v27457/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/6d419887f1879b5765f07c7e7eb1b4c1f65105bac606be1c1b4ab314fb90098c.jpg` | https://t.vndb.org/sf/94/137494.jpg | v27457/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a21cf767ddc1997ad08bf6967123f3296bfc1a39f0faf89c87dac502b17d5e03.jpg` | https://t.vndb.org/sf/95/137495.jpg | v27457/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/39e04c5cbb39ff12ee2df72e394c02497c8588cca272a83cad47d20435ffbb06.jpg` | https://t.vndb.org/sf/96/137496.jpg | v27457/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c7d6b3f74f7a1e70694d07908115a70c7bcc73e268b2532140bd76db2f64f9c1.jpg` | https://t.vndb.org/sf/97/137497.jpg | v27457/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3ce57a48a33743f609e0c9e26ed6fa5c3713e60dd3eb60ccc6da1e5495c6d98b.jpg` | https://t.vndb.org/sf/98/137498.jpg | v27457/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/5b55ffab85a00c6eab9ce7bd38b2bb277ee477c391bd67f7db435d6cdeafe462.jpg` | https://t.vndb.org/sf/11/143911.jpg | v27457/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/999ff7e1fc74acd0cd8915dd7d0a6ade9efd2eb5a3f562d1236e371b642c3672.jpg` | https://t.vndb.org/cv/80/56980.jpg | v36554/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/84501b439217506ee0135b85732fa2dfa7ba53b4a9470e94969bbca6ec54864e.jpg` | https://t.vndb.org/cv/82/56982.jpg | v36555/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/c2957ad43d87044a2e5f82e2fb8e1a663023a912e753cd50e0d66ad097c800ef.jpg` | https://t.vndb.org/cv/83/56983.jpg | v36556/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/7632f66798640a44ed95844d7362cb7ec41f801b1b7c34dd4e50a83f95db2d91.jpg` | https://t.vndb.org/cv/85/56985.jpg | v36557/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/62a19f567390e50db179be5adbc09c5c971e4b6efd8fd4bdda6bed484b4d159c.jpg` | https://t.vndb.org/cv/86/56986.jpg | v36558/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/6e4f1c62d64e3d102d9c055094ecd827a174c78efba721e903a5c5d80298e522.jpg` | https://t.vndb.org/cv/78/66878.jpg | v44249/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/747389664c0560663685828b21faf2b7c2bfbee2b5ed067a4cca4792c7ae8baf.jpg` | https://t.vndb.org/cv/56/74356.jpg | v49795/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/0b965773870822691bcca3232c35b08cf8c4371836773d2b2aef70cc107a4d4d.jpg` | https://t.vndb.org/cv/82/78282.jpg | v22899/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/1c857d075e1eeb69bf7b938dc3c0e431d66f2ddf17165f44ec7db04d4850dc76.jpg` | https://t.vndb.org/sf/70/115070.jpg | v22899/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6cb4447dba6c283b0f9ef82a2b988b42ed8e240ea20191fd95c56660cdb3230d.jpg` | https://t.vndb.org/sf/29/166529.jpg | v22899/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/245acb6981416253360e710917e306a0f6aa8ef1289719a8108b1af1767186d5.jpg` | https://t.vndb.org/sf/37/181337.jpg | v22899/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4b4e14b370d4fc8d7efdb8a48c1114a97e155ac915ce9dedb26ae18f8c7663a7.jpg` | https://t.vndb.org/cv/18/117718.jpg | v23741/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/26d813b089e96d22f767b30844dea89a487bc8284a40bc807045c7afe5f715af.jpg` | https://t.vndb.org/sf/33/157633.jpg | v23741/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4920cc55cd932e7c7b80ac35aa06535ed3247282ee95f650e1451fd419db741f.jpg` | https://t.vndb.org/sf/34/157634.jpg | v23741/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bfcfb7aca7a3c05f09f8bfd7122c51dc6f908ab5a2d6f96ed5e2ba5918c5753b.jpg` | https://t.vndb.org/sf/81/170281.jpg | v23741/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/cf457f34eafe20a5f932bb13972e9603ef8b1c46f89fdd891861dcf61baecb15.jpg` | https://t.vndb.org/sf/82/170282.jpg | v23741/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bcf7a509c1f0ecba82da5b6c0c3211c7a172c821075e81a3121e572633dbcb2b.jpg` | https://t.vndb.org/sf/83/170283.jpg | v23741/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/10769183aa56f856ba0034c57dd75a535188ffa0ab90e24b9b31ecff71c760a7.jpg` | https://t.vndb.org/cv/69/89369.jpg | v50789/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/ea685f87a2d32d61076c605af201ff5fe98ae610a4fa3f32fa24563a6c42d8ab.jpg` | https://t.vndb.org/sf/90/195790.jpg | v50789/screenshot-1 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/86f7306c39ffadae0ea2420f2caee3a8c64bb02ace2aaf46e5c85910363097c3.jpg` | https://t.vndb.org/sf/91/195791.jpg | v50789/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/28f009d9a15c79227df03ee3fae7f10e0ca79a27f284a6fd5f27a92c81209596.jpg` | https://t.vndb.org/sf/92/195792.jpg | v50789/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a6edb7cf0ee3582fb4eb40daf75a5c323ff1c8131d89fbcf6339ced9f79e0865.jpg` | https://t.vndb.org/sf/93/195793.jpg | v50789/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/036556fe45e6ce092b70fa44baa672fd527ae8c17ff2d0acac17528e1661d04f.jpg` | https://t.vndb.org/sf/94/195794.jpg | v50789/screenshot-5 | 性内容 0 / 暴力 0；15 票；截图可能涉及剧透，尚未核实 |
| `/media/8607c8870e24ea23988a77435b1b36836ee99af9e968f1fad38fc5e7b5bccbb5.jpg` | https://t.vndb.org/cv/15/75915.jpg | v29443/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/702e053645648161e6c11e69eb96b490d1177d41745abb980168fbef79e4d8f5.jpg` | https://t.vndb.org/sf/71/170271.jpg | v29443/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d4fe0197a051e1f9116c72fb412f743c329ac67a227f33d8ae818063645c8f9b.jpg` | https://t.vndb.org/sf/72/170272.jpg | v29443/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/23e3cf3352a8aec3da0a3df6a4f0b1e3cb422c706299acdf87ac59984547a57c.jpg` | https://t.vndb.org/sf/73/170273.jpg | v29443/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/73a1a49854d5164e62f16d5f31da4fd8b834c92a1da356a2ca4f0778e5935fd0.jpg` | https://t.vndb.org/sf/74/170274.jpg | v29443/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/db57f220edde0e7980c9ade204f135f7372f1f1a0fb912c4dd63e55533761fd0.jpg` | https://t.vndb.org/sf/16/198216.jpg | v29443/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/33df5f152348ac1078e43a8b985f15e682490e647e0a6993de0df020b60c4c5d.jpg` | https://t.vndb.org/sf/17/198217.jpg | v29443/screenshot-6 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/474141bf35cadcf7dcc597e5653bd64756dbf332fd4e4bfd431d0e941bc3b9d4.jpg` | https://t.vndb.org/cv/96/62396.jpg | v8436/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/552390b48da74577a57a9a0fe9dfb9ef7dd63a64dbbb0276db666286d649755b.jpg` | https://t.vndb.org/sf/57/27257.jpg | v8436/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/14fc439052a9b03e3b45c824e545d595c7517fa9d710a5bd9508830af9e88b1a.jpg` | https://t.vndb.org/sf/59/27259.jpg | v8436/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7cc6da0d969701c78a636a608765e613f756a60dc21e08027d94b90d56b16a70.jpg` | https://t.vndb.org/sf/60/27260.jpg | v8436/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f0e1b1bdb6a5a7dd660fd0d3ed8eb55e2c738328278d05d9a707a883d2dbe592.jpg` | https://t.vndb.org/sf/64/27264.jpg | v8436/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7fbf2a8868146cc3d024f0fbdca05e65ddfd1386959aa6cc59dc744d79447c59.jpg` | https://t.vndb.org/cv/61/93761.jpg | v2968/cover | 性内容 0 / 暴力 0；15 票；封面 |
| `/media/85244d555f34895df33e70bf780d65b3a3658e187e36c59e0fa9d702ea82b3b9.jpg` | https://t.vndb.org/sf/60/13760.jpg | v2968/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/639bf8b7c3a95c68aacb4ad4c52ea1b24c058f023cbd32631367282e07203879.jpg` | https://t.vndb.org/sf/61/13761.jpg | v2968/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7159fcc7f7af5d3e2263f45e921c92f277af04edb4cfad9f04f1b6c63e867d7a.jpg` | https://t.vndb.org/sf/62/13762.jpg | v2968/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/12657927db8610f6f90f04302556d14cdb42ad0c113cae6217d3319c8da1ed54.jpg` | https://t.vndb.org/sf/63/13763.jpg | v2968/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/af3a64ded1e4182336ba485f7167da9e0d28288dca34dbc0ab913a1429f22859.jpg` | https://t.vndb.org/sf/64/13764.jpg | v2968/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7c4b9876f8559f7f5b6e68a13791158701921fbdb0bd62ef238771e7ac91ba77.jpg` | https://t.vndb.org/sf/66/13766.jpg | v2968/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ce1327b821c637ed590250eaa92e2455448c8b2ad899497a918f5fac2cb0d63c.jpg` | https://t.vndb.org/cv/17/88817.jpg | v22847/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/e466853126e6f9f52a4a550d11b47c84c1151a75ded8e6fbdf6695081226667f.jpg` | https://t.vndb.org/sf/16/115516.jpg | v22847/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c91bb0e7dde75a87ebdf800c040b6f24105d95d5d16ce8c81ec15d36c28db5bd.jpg` | https://t.vndb.org/sf/12/135212.jpg | v22847/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/01dcbcc2ce57d544a1783792badd897ee8ed8f7c4f2dd8d3425b82ccc008171e.jpg` | https://t.vndb.org/sf/13/135213.jpg | v22847/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/796e3fafaa09ee7cf924156f0760efc675b55099b96ee006f8dd6760447f3d8d.jpg` | https://t.vndb.org/sf/14/135214.jpg | v22847/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c8520d4d71f5d80271a7c3f88ad606636c8121ed924766456a1eb17b789bf731.jpg` | https://t.vndb.org/cv/66/79666.jpg | v20431/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/080a383c39bd58a015dddf4e05df83024f944068c5051aeeed4d1818b197c90b.jpg` | https://t.vndb.org/sf/73/159473.jpg | v20431/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/10e1f80e0006c81fc0092601c83fa2e2907db65bbd63068b5a129618cd786c49.jpg` | https://t.vndb.org/sf/74/159474.jpg | v20431/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/affeee44e47a52d283f630da0936db0087eff86adc112d06bff6790e9d012c2e.jpg` | https://t.vndb.org/sf/57/176057.jpg | v20431/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/43855ee9d537f8bee83a6e658da8ced53935a5eb9510f092ab9b95b948379922.jpg` | https://t.vndb.org/sf/58/176058.jpg | v20431/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/411d98a392e4aea05bf9be00318be4481378d2a83d7db4f150b1b118abce235c.jpg` | https://t.vndb.org/sf/59/176059.jpg | v20431/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/88954cbee377b9ee3740357431dea11e01b1c5bd9ab1997f1ce6c665f5767f37.jpg` | https://t.vndb.org/sf/60/176060.jpg | v20431/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1fac70ca3742a24b0886c062cc72402c5f784bf50d4549db842db0e60e0c3fd5.jpg` | https://t.vndb.org/cv/63/79663.jpg | v562/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/50a383dabf7395f8d6584b8a2ef316c8e6ef3f1187f2aa375fe0b59f134a5043.jpg` | https://t.vndb.org/sf/29/37029.jpg | v562/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d40faca0fdab9470f2c02a6944f20bcb83d045a5bcb7791d66d3590d6e79c141.jpg` | https://t.vndb.org/sf/27/38227.jpg | v562/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/478d4aae905572bdd9231d341e3eb2d0b80aece9296d7be50d7d1f637e99becb.jpg` | https://t.vndb.org/sf/86/86886.jpg | v562/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9789d251ba465805639670aa54a7dbf9b8a85f89995daa1eb536d20ee0241380.jpg` | https://t.vndb.org/sf/87/86887.jpg | v562/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/378cfb5aa3cd6b671e0301f0de12074d7548d7744749cdf76cbd13278d0a47ab.jpg` | https://t.vndb.org/sf/90/86890.jpg | v562/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4b609d1acbafc9fecbbaf64089a241180535061b6784ddea44ac0f9f8cc16914.jpg` | https://t.vndb.org/sf/28/87128.jpg | v562/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f3befbc2325bec99d43cf004147906bfc6a45837f5bb79d11b6650db78b8e26b.jpg` | https://storage.072project.com/img/product/e3b0c442_t7l7oi90.jpg | b315601/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/2d1134d2537b1389b6c970bdf0876d99f779a8aa62f5ee9648c83630b685a16f.jpg` | https://t.vndb.org/cv/16/95416.jpg | v15637/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/586329ce3ea21f319474476dc5222e9f8f10a26661e9232062d2927e8fa13da1.jpg` | https://t.vndb.org/sf/40/79040.jpg | v15637/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/656faee9ef35c83b7947e2dca329fcb7355301f48d20bd1ee4cd73f46bb193ab.jpg` | https://t.vndb.org/sf/41/79041.jpg | v15637/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d66ed3c048ce1a9ae00969e382c687085923039493762efbd7e9e481a27da3d1.jpg` | https://t.vndb.org/sf/42/79042.jpg | v15637/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/236da933ca469748fdc591d32b95cf08f68006fb9dded271866e9e5ed5e228dd.jpg` | https://t.vndb.org/sf/57/82157.jpg | v15637/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9076004580ae5a2f30c5cc9c2576d5601a54bf324e20da6ead306ad6a47bc904.jpg` | https://t.vndb.org/sf/58/82158.jpg | v15637/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a90d667fc959e2f8082429689612caca4f7f162bae846e888c7ae4c5d0c578c3.jpg` | https://azarashi-soft-plusone.nexton-net.jp/aikotoba-sss/ogp.jpg | v45247/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/2a552c04573efcd1e2236f48f12a6edcaf900c9f4cc22a04d7a2f210975c2482.jpg` | https://t.vndb.org/sf/99/196699.jpg | v45247/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e5260dfef539928e8196ba033fe1ad714f9ac04b08def673480c0286e413eadd.jpg` | https://t.vndb.org/sf/00/196700.jpg | v45247/screenshot-2 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/570df4b12b4702565af198cdad2855b7809db647df62109c433b07d4a4056b2c.jpg` | https://t.vndb.org/cv/92/78992.jpg | v34848/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/04c967db2edf4adc4eae0172bb7562fe6e81d5b556a71813eb73286c93e5dbf4.jpg` | https://t.vndb.org/sf/74/181974.jpg | v34848/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ea9278327915c5e3af60ba775c0c6cb1e944a5cf7bc8dd6c8e2f6ab73ff2f1da.jpg` | https://t.vndb.org/sf/78/181978.jpg | v34848/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/111ca1641030c64427d5a6b39489e884f8a23f479c7422df9feda868192f1d61.jpg` | https://t.vndb.org/sf/80/181980.jpg | v34848/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7a281b5d415e1fbf2e5fdc4b6c56247def280515bb4245f09e98dd7a104b5d06.jpg` | https://t.vndb.org/sf/81/181981.jpg | v34848/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ff04c66a8ed8b5e044a13e40b2acb253082bdaa9830962a972ea59fbf4f62e93.jpg` | https://t.vndb.org/sf/24/195824.jpg | v34848/screenshot-5 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/43ac7e9bcf8005aaceba4e5c3fb0db6839db5088d4c468bb901cf2e4c7b0b085.jpg` | https://t.vndb.org/sf/25/195825.jpg | v34848/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9f0b9b0ff737fc28f259b2adfaddf2261ab01fbdb4f381f3bc124df131224a18.jpg` | https://t.vndb.org/cv/34/86034.jpg | v27436/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/c4831bd2726fef480088f52c78e2b6a89a47157580d25ca1b8922c805956eb09.jpg` | https://t.vndb.org/sf/56/134156.jpg | v27436/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/73811a1944afa5a16fe3c24bba7e79e72aabf6f6c559614b6f4f01bf550a6752.jpg` | https://t.vndb.org/sf/57/134157.jpg | v27436/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/5423ad3ef9f7c51ab3b9fd1cba9726af73a2d9b34881bbedf6761ee5e4dac30a.jpg` | https://t.vndb.org/cv/31/117031.jpg | v25170/cover | 性内容 0 / 暴力 0；10 票；封面 |
| `/media/ca4020f866e40477ed14596de5be48cf399e854aa3afb938fc52a4935ef1649b.jpg` | https://t.vndb.org/sf/99/120699.jpg | v25170/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/be17378cba4f9ced408feb1a9d7128a726b339cf7ee69cf7a09b51fe73f3f2c3.jpg` | https://t.vndb.org/sf/01/120701.jpg | v25170/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/fda516f924535a3fa5023a5bd193ca4e1cb3f22daab2565d2e1aa4d5db78292a.jpg` | https://t.vndb.org/sf/03/120703.jpg | v25170/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/574b3a39a7c06b9b1b3ffd4881912c05cb43b5f17c6c2c92e69e0eb7791e3e7b.jpg` | https://t.vndb.org/sf/55/121155.jpg | v25170/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9ba0eeabd96c3cad1672ee25ea81e9bbd39e8fd443145f66956cb8c0f96bf3f3.jpg` | https://t.vndb.org/cv/78/79678.jpg | v3770/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/a8d6c5e584c391e6d8d420f3c07fe3e873792182200ea03e4b447b755a55c3df.jpg` | https://t.vndb.org/sf/78/15578.jpg | v3770/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3503eb3b8c0440111319db591675d5ddc8c644eb22c7fde694781813f1998d9a.jpg` | https://t.vndb.org/sf/82/15582.jpg | v3770/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9d4d051b22f58e51c082b07c9824d6044c1624fb6c9624dacd551f9d1118b859.jpg` | https://t.vndb.org/sf/30/87730.jpg | v3770/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/eb8304504b1b4ff504e7ee6cd190d03bc2717cbc878a8602620d0d5a0d66c912.jpg` | https://t.vndb.org/sf/53/172453.jpg | v3770/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3783ed704e34d56cd034233bf85bec00f59a67128208739e1993e78e97d213bf.jpg` | https://t.vndb.org/cv/17/90017.jpg | v3144/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/3db1c66f2a60079ca3abfa33f50d7714a7efded4f8c49715f09633faed608b7c.jpg` | https://t.vndb.org/sf/75/144375.jpg | v3144/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/4d6d996248123b6625167dee318325f81048355a59ee44bf674afb257ececad4.jpg` | https://t.vndb.org/sf/52/187252.jpg | v3144/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/5b91eba077300e6e784308f711b750f9bcc3a6f3a6b12e7ff04f732ebb8b719e.jpg` | https://t.vndb.org/sf/54/187254.jpg | v3144/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ef44bac7289fc2823ba12163d12e62923706cbf544e65f36c7445d843c331edb.jpg` | https://t.vndb.org/sf/60/187260.jpg | v3144/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1807ef6b7ad930f191525399929001ea86ba764fab8133a9073aabf40c3b3e76.jpg` | https://t.vndb.org/sf/74/188874.jpg | v3144/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7bbde2de56d628b6861f2e0c4d21de62ea13ac6e89f3d1ac3d338dccffaf3829.jpg` | https://t.vndb.org/sf/98/210398.jpg | v3144/screenshot-6 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/bd92dd7de8096cc87a4211fdab7a2e807c92bfa240bd1062ef0f893597589df8.jpg` | https://t.vndb.org/cv/17/95617.jpg | v1115/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/3b7b439f8dc371314080cf968f66666b9de917ae79ac48a3706569658a9362bf.jpg` | https://t.vndb.org/sf/16/17116.jpg | v1115/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1b2ffb4842637b7e000e189d2596137291be65d56183d573e382623425f07f94.jpg` | https://t.vndb.org/sf/17/17117.jpg | v1115/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/26612afd5f0288eabb7f9266ca3eb722eae51ea9d58c7d8be1ab4c2ba80d69df.jpg` | https://t.vndb.org/sf/19/17119.jpg | v1115/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/30d040a145d0f7a387cb789e3168ffc3ce02abcee0bb6f8f1297ff0eb881648e.jpg` | https://t.vndb.org/sf/20/17120.jpg | v1115/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ba72a6b6983de16c470756ede329f599e5557e3ac9491f78a7092b8f37a67637.jpg` | https://t.vndb.org/sf/21/17121.jpg | v1115/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6762f1fc9cd85b549c654f44093975701a37d4953652b3699e2eff005d7069c3.jpg` | https://t.vndb.org/sf/22/17122.jpg | v1115/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e4cacf2a6ac7fcc8df1d596aa49e4bddfbdc034195538eb917616053ba66fadc.jpg` | https://t.vndb.org/cv/92/102792.jpg | v32183/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/4ae935e42a8bdf26d1afc9d99236f85fee60b5914795d45601706b04eec8e6bd.jpg` | https://t.vndb.org/sf/96/166596.jpg | v32183/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/61027fd60f27a75f617993aa300d1bb4da6e8bec65560ebb5d06ebfccc32a56d.jpg` | https://t.vndb.org/sf/97/166597.jpg | v32183/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/074297dac81ef88683dd098e20c4a1e8338cbefda728b704dc9c3ff666c6c4b3.jpg` | https://t.vndb.org/sf/98/166598.jpg | v32183/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2ab90c2189b52a4e0c4f989bcbbbfd154bab16c58e09a08206bdb48cd04ea1d2.jpg` | https://t.vndb.org/sf/99/166599.jpg | v32183/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bee04d7f62bf70666bfc9b55c65bd3bac80168d464a39e61b610d68d276e7f79.jpg` | https://t.vndb.org/sf/00/166600.jpg | v32183/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/337efefb741e08a5ad2b2c5bf4d3f35bd2437db27913f0f6b50a7fb731378ce5.jpg` | https://t.vndb.org/cv/62/88062.jpg | v5922/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/0567a645c591e6fce6b3015ed8412679c4c2dbcafacf1925896879f779e1905f.jpg` | https://t.vndb.org/sf/05/92505.jpg | v5922/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/dfe86861bd58976cad57dc5ff4129503be45d79acd32ce63e8eceabc33192788.jpg` | https://t.vndb.org/sf/99/139599.jpg | v5922/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/0996a1faf0ae5fe074dad6ac0053d90dab30adceef700f6c1e150945d98dea03.jpg` | https://t.vndb.org/sf/71/206771.jpg | v5922/screenshot-3 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/169c4fac59d095ce97d5f16d2149ddf288256351e068d7ca34b2cd63dddd62ef.jpg` | https://t.vndb.org/sf/72/206772.jpg | v5922/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c8abfdf3de94d6530dd98e78a695acc6f108de24f08b989cfcfa1b8448685482.jpg` | https://t.vndb.org/sf/73/206773.jpg | v5922/screenshot-5 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/10166cab6937d878ba0d93ac39e10f00fb32ea5185fe5438ef0ae089e7c6e9ff.jpg` | https://t.vndb.org/sf/74/206774.jpg | v5922/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/b3d19225aac9aab0359838244ddb28e1b94f903b946117b3cf4a51c5914d4949.jpg` | https://t.vndb.org/cv/94/79894.jpg | v10680/cover | 性内容 0 / 暴力 0；15 票；封面 |
| `/media/98ad8a9149e4b1070c6e365987547901af03d07df2035974ca809f74f3fe5721.jpg` | https://t.vndb.org/sf/48/166748.jpg | v10680/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/1e50e843d2b210821dd931a92038dff1880d5dd7fbfcebb355569b7ae33c6944.jpg` | https://t.vndb.org/sf/49/166749.jpg | v10680/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2defcc23bcd38cb9712b24226bf17eaec8b2435d8c6f7a19ecdceb09a4f4a3f7.jpg` | https://t.vndb.org/sf/50/166750.jpg | v10680/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f18be6dca91973644d457551001ffda744e7be77427ce6a0836ba9f60b257202.jpg` | https://t.vndb.org/sf/51/166751.jpg | v10680/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d0feb7b143c4fe2b32d04e2c29eaa169c5645e77e2659dccf9b59b6b8f12ae47.jpg` | https://t.vndb.org/sf/52/166752.jpg | v10680/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/be802762c2ac8fbdf45061f605e70c4084ecca4b8180ed7a14eeb7d1f83e7403.jpg` | https://t.vndb.org/sf/55/166755.jpg | v10680/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/8d3cfdcdd18d7149ee388ca8816dcb539eec544d6683a8b0eb77f208af435518.jpg` | https://t.vndb.org/cv/97/132097.jpg | v18148/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/e8e51164bc3084b733346275aceb06432e33e4c871130d6047994f2a862442e6.jpg` | https://t.vndb.org/sf/83/103683.jpg | v18148/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/fe87c3f2cf4ae698cfa429340b2d09f70740f12a0cc51e8a035fe624d154862e.jpg` | https://t.vndb.org/sf/85/103685.jpg | v18148/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a205bb5ed5c476d7d567c3f719214f06238c317a6bf0be3868272781e2419b35.jpg` | https://t.vndb.org/sf/88/103688.jpg | v18148/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3f3ad59e774c3f12b78eb4a723c50bc7be0c69db0e9e5a450a127d041391118d.jpg` | https://t.vndb.org/sf/36/253636.jpg | v18148/screenshot-4 | 性内容 0 / 暴力 0；4 票；截图可能涉及剧透，尚未核实 |
| `/media/bc570807e1e4879bc17b27b9eba53c8851b35ad75f302a510757de4471aad31b.jpg` | https://t.vndb.org/sf/37/253637.jpg | v18148/screenshot-5 | 性内容 0 / 暴力 0；7 票；截图可能涉及剧透，尚未核实 |
| `/media/2e81aa45ca8a8a5189cb6ea83d4c2523e524b737f8de2a6e5b78675080990ecc.jpg` | https://t.vndb.org/sf/38/253638.jpg | v18148/screenshot-6 | 性内容 0 / 暴力 0；6 票；截图可能涉及剧透，尚未核实 |
| `/media/218255b6c2fe18986a04a13b050ee06b2cd30b34cfaeb5dfbbe33ea6e1188dfe.jpg` | https://t.vndb.org/cv/08/132108.jpg | v19841/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/af53db7256532e4271ab9be4db5d36d411ea17b895b9be3afa718c440511203d.jpg` | https://t.vndb.org/sf/83/196283.jpg | v19841/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6d267eb9a2be1a98f50ed886eb3758c589f08937e95ebacb22b9d9bcbef48886.jpg` | https://t.vndb.org/sf/90/196390.jpg | v19841/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a246f252108a7743cd1e9fb5a84c4fa2a14e611562b742e217a43bf7fdcb22e6.jpg` | https://t.vndb.org/sf/91/196391.jpg | v19841/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/147b9833931eff7705798fb814333829e9ca3cf1adeb17a1b25bced2d12464c2.jpg` | https://t.vndb.org/cv/26/90926.jpg | v182/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/cb9a03849f6e9dcd6bdbe65e755a07325bd13529c1e0082d8d05c0c70d034106.jpg` | https://t.vndb.org/sf/92/9792.jpg | v182/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/25cf25bd422fffba506b1e264bc332a084ac67406975ffc735670c2a3a844e48.jpg` | https://t.vndb.org/sf/93/9793.jpg | v182/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/370e795a434d95386b81580e99745dec705f47102c7f180558d6b2283a62b274.jpg` | https://t.vndb.org/sf/94/9794.jpg | v182/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e64af32153f0afb068322cfe2491acc7efd88f8dd5e1b31bc44d4918c1e8eb65.jpg` | https://t.vndb.org/sf/07/56907.jpg | v182/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/7ea4bdf37cb584331bc2c1f9e53e00f3a0e63b4b2213dae8be560e3bd0daf930.jpg` | https://t.vndb.org/sf/08/56908.jpg | v182/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/89a8a3e6cc3998c752c06ae2d21639ce6476174a2eb92aa832b8d9a5b6307b95.jpg` | https://t.vndb.org/sf/09/56909.jpg | v182/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2bfa5902a5a280ec96fc5a2dbdbee5dd8e18f2b14e2e99e2c42411c3a4ab4ad1.jpg` | https://t.vndb.org/cv/33/96033.jpg | v37843/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/e1202ab04945efe97ea76eeb6f1bf6fdeddd7d3be7cff70635ea40d44bfdbd34.jpg` | https://t.vndb.org/sf/66/173566.jpg | v37843/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/117508631cfe586e47c66cefcae973b060ab8d60546cdb6d321ff1fff3d09892.jpg` | https://t.vndb.org/sf/67/173567.jpg | v37843/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/fa510e2e73ecfcbc96e41fbcac9b451f2afbf52de8d0bb5801f68398f5ea1610.jpg` | https://t.vndb.org/sf/68/173568.jpg | v37843/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e0d8786cf1c44c19d78de66220d3ee39628e9732017deb9ba80e43e9544c16cc.jpg` | https://t.vndb.org/sf/69/173569.jpg | v37843/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/eb0ba97b79afa684f6837d045d66e3368333531639770c8cd6440008a4cfbab9.jpg` | https://t.vndb.org/cv/59/78359.jpg | v22880/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/b71d141be59dea7a60ff8fb85a4b3111058f5441f3e136dfda81d7eeb9ba7d84.jpg` | https://t.vndb.org/sf/76/147776.jpg | v22880/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c216abdb03514bb924579e808aaa3019d65f277c4e2781f5f703753150459e39.jpg` | https://t.vndb.org/sf/77/147777.jpg | v22880/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/6eb40e9b44341868993e7c51563be6ac95c224e8652d2ac414ecd710a5352e3e.jpg` | https://t.vndb.org/sf/81/147781.jpg | v22880/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/114a074d68b9f071816e9893d54c2aa708b0e3c2ff994eba6bbf1356214d45b1.jpg` | https://t.vndb.org/sf/58/205158.jpg | v22880/screenshot-4 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/448e0e49d61c9be25a6e00af868107fd16c02339803a7cc323e36e545fd24a91.jpg` | https://t.vndb.org/sf/60/205160.jpg | v22880/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/b20cc2ecc4c9eeb5e676e0d6a61692901c2c4e3fbfccd8006e72ba9d8ef09fdc.jpg` | https://t.vndb.org/sf/61/205161.jpg | v22880/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a2120b383eba7b37b59525eb6a808e07799b9bfc453cc1e024a909aef33e434b.jpg` | https://t.vndb.org/cv/10/91210.jpg | v23290/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/7db2628f54ba82391aa6f6654a6e0691578192c58d0e3b947af362bb7396f1d4.jpg` | https://t.vndb.org/sf/97/136597.jpg | v23290/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f6e7e4ad5f79b8bc22791708560feaea80d6ad3f42d42286e5f6f7e6f17e9218.jpg` | https://t.vndb.org/sf/99/153899.jpg | v23290/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/9aa6d62cf49b4d025202dca70bd9fa16bbe8e39a3c4629dc83756c508f104e26.jpg` | https://t.vndb.org/sf/30/203530.jpg | v23290/screenshot-3 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/0dd609624c6b15626a4078ad09803654f2cab8fad957dcb38dcaf72ccd9eb1b8.jpg` | https://t.vndb.org/sf/05/203605.jpg | v23290/screenshot-4 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/634863e597b6869beaef0c5702c6b96215051aecbcd1d9d3837a2a1c1274e881.jpg` | https://t.vndb.org/sf/10/203710.jpg | v23290/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/cd5b26c33748372262162253545bdd2cb1e3b6cb6302dfdf0675c2e78df1b2f1.jpg` | https://t.vndb.org/cv/99/86899.jpg | v23772/cover | unknown；缺逐图评分及票数或视觉人工审核 |
| `/media/2633f74226748f7ff439964bc33157e8ef793c3363de5bdf9144dabe1b8982c9.jpg` | https://t.vndb.org/sf/41/136541.jpg | v23772/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a12c76e596b21f0561656b52fddc1a01dc54031db344446a0d7ac2424dad1dbe.jpg` | https://t.vndb.org/sf/46/136546.jpg | v23772/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a3afb45c2c2533af190a247829c6e94951b45634c4ae4d0287c086c317042455.jpg` | https://t.vndb.org/sf/42/204242.jpg | v23772/screenshot-3 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/76c130ef767e0e93e4cb5cc28dd448202a96dacf666ed9c97bf038af4006761f.jpg` | https://t.vndb.org/sf/43/204243.jpg | v23772/screenshot-4 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/688ea8554274a5918295a8ac6a08f34e40a4422ad4503b445482604518114150.jpg` | https://t.vndb.org/sf/44/204244.jpg | v23772/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/0b329250a9119fc80cbd226487777ca47af60b376edc680235ee9e6d74ab090b.jpg` | https://t.vndb.org/sf/46/204246.jpg | v23772/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/071f3ab1fd8d6b91b636e8ac66adeb3b3352fe36e71420bad0cafbf41abeb06a.jpg` | https://t.vndb.org/cv/85/101085.jpg | v53590/cover | 性内容 0 / 暴力 0；13 票；封面 |
| `/media/c46d538dc1d4cc3c13a0ef8dd7efce3439655a7fd6b704f01265bdb70f7654e2.jpg` | https://t.vndb.org/sf/20/211620.jpg | v53590/screenshot-1 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/47176c4d40d90875f1dadcfb8ea94317394d43fcd114219883dd57d0792a1fbd.jpg` | https://t.vndb.org/sf/21/211621.jpg | v53590/screenshot-2 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/466b05e76beefb7cc57d116a7a03f15ea7951246679070fe08bf374be3f38899.jpg` | https://t.vndb.org/sf/22/211622.jpg | v53590/screenshot-3 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/d890c9bfe59d740586873d91ced3350feff5c925bef3bab5d2b10cced3563f5d.jpg` | https://t.vndb.org/sf/23/211623.jpg | v53590/screenshot-4 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/36a10673416ad7ebf0f727716ae7dcc801d5bb39d7e64d410225aa55952e53e5.jpg` | https://t.vndb.org/sf/88/211988.jpg | v53590/screenshot-5 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/78b3a5883a7a37fd9d41361f0b29f1b4e5e873987309ca687d9369227d90d34c.jpg` | https://t.vndb.org/sf/71/216471.jpg | v53590/screenshot-6 | 性内容 0 / 暴力 0；12 票；截图可能涉及剧透，尚未核实 |
| `/media/7380f3fbadf2b0d376c9d6eca9986f2d171a7b633714d4d9638b85e23e1a4ea1.jpg` | https://t.vndb.org/cv/64/96064.jpg | v47175/cover | 性内容 0 / 暴力 0；12 票；封面 |
| `/media/b8424b7f5313178c3fe4fd615973824bff21116ca73ad4289ae79b7969ae9565.jpg` | https://t.vndb.org/sf/10/198310.jpg | v47175/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ded518021374c2b7c14184bd4956e62f0abd196ff9c42fec4970ca7864c54a58.jpg` | https://t.vndb.org/sf/11/198311.jpg | v47175/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/09e0a44f3244d63ac1a8f99554c0ae3c73f188a536fe713a8b5fcaffeeccc610.jpg` | https://t.vndb.org/sf/17/198317.jpg | v47175/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/13acba33455956b2e458249fdc896f57ebe622c0a73ee7e992e3b917294d4697.jpg` | https://t.vndb.org/sf/19/198319.jpg | v47175/screenshot-4 | 性内容 0 / 暴力 0；13 票；截图可能涉及剧透，尚未核实 |
| `/media/828d4a4dc2f5f7649adecd54906801179b56e46acc6a35518eccd44d0644f829.jpg` | https://t.vndb.org/sf/24/198324.jpg | v47175/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/3a0e87ee2a628d751c2efa784dfab5ee1c0104082433e3f769abd4914319f2d4.jpg` | https://t.vndb.org/sf/06/208106.jpg | v47175/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/ef45cdefe2ee71fa7152b9e2277401f38f3a6187b65bf1e0bb1412082b81974c.jpg` | https://t.vndb.org/sf/63/177863.jpg | v37021/cover, v37021/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d0bce8042aa7df2a38182ae226f2c029337de68c57a0a56e161591aa9409cb63.jpg` | https://t.vndb.org/sf/65/177865.jpg | v37021/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/eb2d7b7b3639a68f1278955813947441a67fabd351c55e6d8379aa84dd4c79c7.jpg` | https://t.vndb.org/sf/67/177867.jpg | v37021/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d9ecaed40df56b65748f28a6a162261d5e22a93b7761af5b883c797c24c9315e.jpg` | https://t.vndb.org/sf/69/177869.jpg | v37021/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/e3e3b18639ac4aa9a9d32de71f145ff4f712c3bfc2bd46689bd77bb5ea45bfe5.jpg` | https://t.vndb.org/cv/73/88873.jpg | v39197/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/7601ac9a85409f0de083dfb9ede35b17c6b5631a3492b1f9cbc4e1d35e624c02.jpg` | https://t.vndb.org/sf/01/178001.jpg | v39197/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/bc76165b6aac39de88fb70df6ec830a6e25a0c7e987f5352df5f542c8636428e.jpg` | https://t.vndb.org/sf/03/178003.jpg | v39197/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/f299f0276969e7189192da4a990b3dc72c9c6456b20b8abf8f446a574257db91.jpg` | https://t.vndb.org/sf/04/178004.jpg | v39197/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d26bb0c29ac3b43cc862b5907bb5c689ece9f21f6c033a72867c6e1776751e4d.jpg` | https://t.vndb.org/sf/06/178006.jpg | v39197/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/d574a80c10dcac0831cdf9dd722b6262b8b7fddd14785df9146c1b9f0d282ac4.jpg` | https://t.vndb.org/cv/37/89937.jpg | v15708/cover | 性内容 0 / 暴力 0；14 票；封面 |
| `/media/146ccf11e864957ce0f375936063152bcaca58e6308c61ed16489035fa86ace3.jpg` | https://t.vndb.org/sf/55/94955.jpg | v15708/screenshot-1 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/cd05655542616200766c83034090e85d7fee3c1f3e996a572f55fc3c5ea6d49a.jpg` | https://t.vndb.org/sf/56/94956.jpg | v15708/screenshot-2 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/c6b2ff011972fdab5c77f8d9c9b5b7ec3f17e326b20ff6c729d3af0a5335e657.jpg` | https://t.vndb.org/sf/57/94957.jpg | v15708/screenshot-3 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/2c16cbb7ae49beaebf74d95d25731a3818e721cf1403b38b8f9f35fd3c3f2397.jpg` | https://t.vndb.org/sf/58/94958.jpg | v15708/screenshot-4 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/54bab8e7e2c14f4f75aac785df2ac8f6ae29b5c2338ba162990d764ea3e976fb.jpg` | https://t.vndb.org/sf/00/98500.jpg | v15708/screenshot-5 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |
| `/media/a7d17a25daf006238027b0e4b3f06910b6090250fb32bcdb2f628e159def9661.jpg` | https://t.vndb.org/sf/16/169116.jpg | v15708/screenshot-6 | 性内容 0 / 暴力 0；14 票；截图可能涉及剧透，尚未核实 |

## 原始证据检索与补齐

- 已只读检查原工作区与本工作区的数据和元数据脚本，未找到 `metadata-collected.json`。
- `data/vndb-evidence.json` 与 `data/vndb-search-cache.json` 为标题和归属证据，无逐图评分；`metadata-media-report.json` 仅有数量及下载状态。
- 历史 `prepare-metadata.ts` 安全条件只核对 sexual 和 violence 为 0，未核票数；作品口碑 ratings 也不是内容分级。
- 官方 API 原始记录需保留查询、采集时间和完整响应，以 sourceUrl 精确匹配。两个分数均为 0 且有票才自动通过，小数保留原值，无票或缺字段保持 unknown。
- 官方宣传图需补明确逐图视觉人工审核。

## 独立仓储导入

- `data/content-classification.json` 为可审阅导入文档；导入脚本默认预览，`--apply` 显式落库。
- 分类修订独立于生命周期修订；相同修订不同内容和倒退修订拒绝；人工 set 使用 expectedRevision 并优先于后续批量导入。
- 元数据导入不把上游自带的图片 classification 当作权威，输出以独立仓储为准。

## 本轮官方逐图证据

- 原始记录：`data/content-image-evidence.json`；采集时间 `2026-11-03T17:14:34.611764+00:00`，完整返回 71 个 VNDB 作品。
- 请求端点为官方 `https://api.vndb.org/kana/vn`，查询字段及过滤条件随原始响应一并保留，未下载上游图片或游戏资源。
- 359 次现有图片引用通过 sourceUrl 精确匹配，共 355 个唯一素材；无重复来源冲突，均为性内容 0、暴力 0、有有效评分票。
- 13 张 VNDB 替代或旧封面不在当前主封面及截图字段返回中；12 张官方来源图片无逐图视觉审核，合计 25 个唯一素材保持 unknown。
- 上表原图 URL 可用于定位原始响应；分类 source 另带 VNDB 作品与图 ID，不以作品口碑评分或关联作品推断其他图片。

## 文本指纹与复审验证

- 工作记录中的 `fingerprint` 独立于共享分类类型，是审核时文本的稳定 JSON SHA-256。无指纹的已审核导入会被拒绝。
- 人工审核先读取同时包含文案与指纹的快照；set 必须提交该 expectedFingerprint，并在与目录写入相同的事务锁下比较、写入。审核期间文案变化即 409，不自动批准保存时才出现的新文案。公开读取与当前文本重新比较，不匹配即 unknown，原记录不被覆盖。
- PostgreSQL 回归覆盖改简介、重新审核和改别名；整体目录导入回归验证每份审核指纹与静态快照的实际字段一致。
- 本次页面及版本文案指纹补充将作品分类导入修订提升为 3；独立 `002-content-classification-fingerprint` 迁移追加列，不改已应用的 `001-content-classification`。
- 全部已发布版本的标题、版本说明和语言同样属于页面审核指纹；修改版本文案或发布新版本后，整页先进入 unknown，复审后才恢复公开发现。

## 私有管理接口

- `GET /api/manage/content-classification` 读取原审核证据、修订、人工覆盖状态；作品另有同一目录锁快照中的 `reviewText` 与 `reviewFingerprint`。目录中尚无分类的作品也返回可审核的修订 0 快照。
- `PATCH /api/manage/content-classification` 接受 `{ kind, id, expectedRevision, expectedFingerprint, payload }`；work 必须提交 GET 所得 expectedFingerprint。新记录修订前值为 0，仓储生成下一修订。人工审核时间、理由和来源均必填。
- 接口仅挂载于既有私有管理监听器，沿用登录与 Origin 验证，不由公共监听器暴露；响应 `private, no-store`，修订冲突 `409 / CLASSIFICATION_CONFLICT`。
- 私有 `/manage` 登录后可进入“内容分类”页签，按层级、编号/名称和状态筛选；逐项展示证据并编辑。目录中尚无记录的对象使用修订 0 创建审核；冲突保留输入，刷新后重新核对。
- 作品编辑器只展示本次 GET 的 `reviewText` 并提交对应指纹，不把另一次目录请求中的旧文案与新指纹混用；刷新后指纹和可见文案一起更换。
- 图片审核不自动加载原图，提供登记来源原图的明确新窗口链接；人工覆盖保留可填写的原始小数评分与票数，保存时记录本次核实时间。

## 搜索与高级版本筛选

- 索引保存有效 `pageSuitability` 与版本 `sexualContents`，filterableAttributes 同步配置。启用准入后，Meili 先排除 unknown 页面，再按当前资格区分 SFW / NSFW。
- `/api/search` 在索引候选返回后重新读取 Store 当前分类与文本指纹，不能仅依赖旧索引。带资格差异的响应使用 `private, no-store`，不公开未经当前分类复核的索引总数及剔除数量。
- 准入开启时 `indexEstimatedTotalHits: null` 明确表示总数未知，`visiblePageCount` 单独记录本页已复核数，`nextOffset` 独立表示可继续翻页；非准入模式保留原数值总数与响应字段。
- 目录 loader 向同进程搜索转交原请求的同源地址与 Cookie，保持已开启会话的权限；不把浏览器自报资格当作事实。
- `content=none|present|unknown` 只保留匹配版本，更新卡片版本数、默认版本、继续阅读映射及目录版本计数；与原有 q / engine / tag / state 及分页条件组合。
- 独立 `005-search-content-classification` 迁移在分类写入事务中触发 search_outbox，包含作品、版本及图片归属；现有 `004-search-postgres` SQL 保持不变。迁移依赖显式包含分类表迁移，旧 CLI 也能安全初始化新投影字段。
