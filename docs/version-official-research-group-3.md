# 第3组官方版本资料核查

> 本文件为先行官方资料调查，所述包绑定未知不代表最终分类。用户随后指定采用VNDB/KUNGal社区标记，最终94版决策见[合并审计](version-nsfw-review-20261114.md)。

核查时间：2026-11-13T20:57:15Z。覆盖24作、25个站点版本。仅整理官方上游发行证据，所有部署包绑定状态仍为unknown，未改分类、目录或运行时。

本批验证区分三个问题：作品是否存在成人发行版、可读官方资料是否明确说明性内容、站点包是否能绑定该发行版。前两项分别记录，第三项交由主任务独立审核。预期上游存在版本差异；如果只有年龄标识或官网不可读，就保留未知，不能把18禁或标题直接转成当前包的NSFW结论。

本批未下载游戏或补丁、未点击年龄确认、未登录或绕过地区限制。Steam用户标签和社区内容均未作为官方内容结论。

重点发现：

- 《爱语SSS》《甜蜜夏日》《真实动漫情境体验2》《绘缘蜜恋》《飞鸟会长》《Re:Re:call》取得原厂直接性内容说明。
- 《近月》Steam开发商正文只说明少量裸露且主要情节功能非性暗示；《野良2》Steam仅列轻度裸露等内容。它们不能代表当前ONS/Artemis包。
- 《SELECT OBLIGE》《Re:Re:call》的裸体立绘特典补丁不能自动等同成人性场景恢复补丁。
- AUGUST区分PC/Android R18与主机移植，《青空》Refine是独立重制。
- 072商品正文不可读；《宿星2/3》官方正文不可达，保持未知。

逐作记录：

## 尼特与天使与色色家族（b315601）

给定本体商品及2026 DLC入口均没有可读正文。

年龄：未知

性内容：未知

补丁：DLC存在的搜索线索未从正文证实，不能视作成人补丁。

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：不能确认当前译版、引擎转换或本体/DLC关系。

实际打开的官方/一次资料：

- [publisher_store](https://072project.com/r18/jp/shop/RA24086637) · no_readable_body · 2026-11-13T20:57:15Z：给定商品页可打开但没有可读正文；URL中的r18路径不单独证明游戏内容。
- [publisher_store](https://072project.com/widget/RC26085508?locale=en&style=horizontal) · no_readable_body · 2026-11-13T20:57:15Z：DLC组件可打开但正文不可读；未从DLC推断本体内容。

## 永不落幕的前奏诗（v15637）

2015年原PC版已核验发行资料。

年龄：官方奖项资料为18岁以下禁止。

性内容：仅年龄限制；本次没有直接性场景说明。

补丁：未核验成人补丁。

已核验平台：Windows Vista、Windows 7、Windows 8。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：原厂旧站403；ONS移植未绑定该发行。

实际打开的官方/一次资料：

- [credited_creator](https://den-gaku.org/works/soreyorino/) · readable · 2026-11-13T20:57:15Z：作曲家官网确认2015-02-27发行及Windows Vista/7/8；未说明性内容。
- [official_industry_award](https://moe-gameaward.com/title/detail.html?id=1061) · readable · 2026-11-13T20:57:15Z：奖项参评资料列2015-02-27、Windows Vista/7/8、DVD及18岁以下禁止；这是年龄资料。
- [developer](https://www.minori.ph/lineup/_yorino/) · http_403 · 2026-11-13T20:57:15Z：作曲家官网指向的原厂页面返回403；未绕过。

## 爱语 -Silver Snow Sister-（v45247）

2023年日文PC实体及下载版。

年龄：NEXTON逐项18岁以上购买。

性内容：官方概念页明确性场景。

补丁：未发现或核验成人补丁。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：Windows日文OS要求不等于验证所有文本语言。

实际打开的官方/一次资料：

- [developer](https://azarashi-soft-plusone.nexton-net.jp/aikotoba-sss/product.html) · readable · 2026-11-13T20:57:15Z：2023-10-27发行，实体及FANZA下载，支持Windows10/11日文操作系统。
- [developer](https://azarashi-soft-plusone.nexton-net.jp/aikotoba-sss/concept.html) · readable · 2026-11-13T20:57:15Z：官方概念页明确宣传两种风格的性场景；这比单独18禁标签更直接。
- [publisher](https://nexton-net.jp/nexton-passport/service_azarasi.html) · readable · 2026-11-13T20:57:15Z：逐项列出爱语SSS、甜蜜夏日、绘缘蜜恋、飞鸟会长的发行版和18岁以上购买限制；甜蜜夏日另有Perfect及Limited版本。

## 甜蜜夏日（v34848）

2022本体与Perfect/Limited命名版本需分别对照。

年龄：原PC本体官方18岁以上购买。

性内容：原厂人物资料列H场景数量。

补丁：未核验补丁或Perfect Edition内容差异。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://azarashi-soft.nexton-net.jp/amanatu/) · readable · 2026-11-13T20:57:15Z：2022-08-26实体及下载发行，Windows10/11；人物资料分别列5段H场景，属于明确性内容说明。
- [publisher](https://nexton-net.jp/nexton-passport/service_azarasi.html) · readable · 2026-11-13T20:57:15Z：逐项列出爱语SSS、甜蜜夏日、绘缘蜜恋、飞鸟会长的发行版和18岁以上购买限制；甜蜜夏日另有Perfect及Limited版本。

## 真实动漫情境体验2（v27436）

官方十周年合集收录2020年第二作。

年龄：合集网页有18岁警告。

性内容：厂商对第二作类型和简介直接描述性场景。

补丁：未核验Steam版或成人恢复补丁。

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://10thbox.j-studio.net/) · readable · 2026-11-13T20:57:15Z：十周年合集列入真实动漫情境体验2并注明2020-04-24发行；类型及介绍明确以性场景为内容。页面含18岁警告，未点击年龄按钮。

## 神社里的猫巫女（v25170）

开发商确认Steam与Switch产品；本次未取得补丁正文。

年龄：Steam打开后要求登录/年龄检查，未继续。

性内容：开发商文案只证实轻微情色题材；具体性场景未知。

补丁：社区发现R18补丁线索，但官方当前正文未核验，GOG补丁入口重定向。

已核验平台：Nintendo Switch、Steam。语言：Japanese text、English text、Japanese voice。

部署包：unknown；未赋最终分级。

局限：不可把搜索摘录或第三方补丁镜像当正文证据。

实际打开的官方/一次资料：

- [developer](https://qureate.co.jp/nekomiko/) · readable · 2026-11-13T20:57:15Z：官方页确认Nintendo Switch及Steam，日文/英文文本、日文语音；只称带有轻微情色的同居喜剧，未直接展示成人补丁说明。
- [official_storefront](https://store.steampowered.com/app/969700/NekoMiko/?curator_clanid=44869323&l=english) · login_redirect · 2026-11-13T20:57:15Z：打开后跳至Steam登录/年龄检查；搜索索引有成人内容摘录，但本次没有可读商品正文，不把摘录当直接核验。
- [official_storefront](https://www.gog.com/en/game/nekomiko_unrated_patch) · unrelated_redirect · 2026-11-13T20:57:15Z：成人补丁URL跳转到通用游戏列表，没有核验到商品或补丁内容。

## 秽翼的尤斯蒂娅（v3770）

2011原版、2016新装版及Vita/PS4/Switch移植不同。

年龄：原厂PC/Android标R18；主机版CERO D。

性内容：本次只取得R18产品线标识，无直接性场景说明。

补丁：未核验成人补丁。

已核验平台：Windows、Android、PlayStation Vita、PlayStation 4、Nintendo Switch。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://august-soft.com/product/) · readable · 2026-11-13T20:57:15Z：原厂目录分别标注秽翼原PC及新装PC/Android版R18、千桃PC/Android版R18；另列各作品主机移植版。R18只按年龄/产品线资料记录。
- [console_publisher](https://www.entergram.co.jp/eustia/product/) · readable · 2026-11-13T20:57:15Z：2022-06-23 PS4/Switch版，CERO D；不得据此反推PC版或ONS移植内容。
- [console_publisher](https://www.dramaticcreate.com/eustia/product/index.html) · readable · 2026-11-13T20:57:15Z：Angel’s blessing为PS Vita版，CERO D。

## 素晴日（v3144）

Steam Down the Rabbit-Hole与JAST完整独立版分别发行。

年龄：未以年龄条目作性场景结论。

性内容：Steam开发商说明部分裸露和暴力；Frontwing公告说明完整不删减版但未把裸露直接等同性交。

补丁：Frontwing官方公告说明Steam本体更新须搭配对应版本补丁；JAST旧补丁入口403。

已核验平台：Windows。语言：English release。

部署包：unknown；未赋最终分级。

局限：RenPy转换包未绑定英文完整版、日文版或Steam补丁状态。

实际打开的官方/一次资料：

- [official_storefront](https://store.steampowered.com/app/658620/) · readable · 2026-11-13T20:57:15Z：Steam发行Wonderful Everyday Down the Rabbit-Hole；开发商内容说明为遮掩/部分裸露及暴力。
- [publisher_campaign](https://subahibi.backerkit.com/hosted_preorders/project_updates?page=7) · readable · 2026-11-13T20:57:15Z：Frontwing官方项目公告说明JAST独立完整版无DRM且除一个已说明改动外不删减。
- [publisher_campaign](https://subahibi.backerkit.com/hosted_preorders/project_updates?page=8) · readable · 2026-11-13T20:57:15Z：Frontwing官方公告说明Steam本体更新后必须配套使用新版本补丁，链接至JAST官方页；没有下载文件。
- [publisher](https://jastusa.com/page/frontwing-steam-patches) · http_403 · 2026-11-13T20:57:15Z：官方补丁旧入口403；未下载，当前补丁文件可用性未知。

## 繁花落舞恋如樱（v1115）

至少区分2002原作、2023 Re:BIRTH和2024中文发行；部署的两版本都未绑定。

年龄：本次未核验年龄。

性内容：本次未核验性场景。

补丁：本次未核验成人补丁。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：HIKARI商店地区不可售；Steam商品正文不可达；不得把重制版资料覆盖原作。

实际打开的官方/一次资料：

- [developer](https://project-navel.com/sorechiru/intro.html) · readable · 2026-11-13T20:57:15Z：Navel介绍2023年的Re:BIRTH来自2002年原作与原始制作人员；至少存在原作和重制版区别。
- [developer](https://project-navel.com/sorechiru/spec.html) · readable · 2026-11-13T20:57:15Z：Re:BIRTH有豪华/通常/Sofmap包装，要求Windows10/11日文操作系统；正文未给性场景或年龄结论。
- [localized_publisher_store](https://store.hikarifield.co.jp/shop/sorechiru) · readable_region_unavailable · 2026-11-13T20:57:15Z：中文发行2024-05-31、品牌Navel、发行HIKARI FIELD；页面提示本地区暂不销售，未绕过。
- [official_storefront](https://store.steampowered.com/app/2754170/?l=english) · unavailable · 2026-11-13T20:57:15Z：Steam商品入口不可访问；未推断Steam版内容。

## 绘缘蜜恋（v32183）

2022日文PC实体版及官方产品页面。

年龄：NEXTON逐项18岁以上购买。

性内容：厂商人物资料及功能说明明确性场景。

补丁：未核验恢复补丁。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://azarashi-soft.nexton-net.jp/amaemi/) · readable · 2026-11-13T20:57:15Z：2022-06-24发行，Windows10/11；人物资料列性场景数，特色明确说明性场景及相关显示设置。
- [publisher](https://nexton-net.jp/nexton-passport/service_azarasi.html) · readable · 2026-11-13T20:57:15Z：逐项列出爱语SSS、甜蜜夏日、绘缘蜜恋、飞鸟会长的发行版和18岁以上购买限制；甜蜜夏日另有Perfect及Limited版本。

## 虚之少女HD（v5922）

2015 MangaGamer版可读；NEW CAST REMASTER EDITION原厂商店502。

年龄：本次正文没有可用数字年龄结论。

性内容：MangaGamer列无马赛克/血腥；没有用血腥反推性内容。

补丁：未核验HD/重制版成人补丁。

已核验平台：Linux、OS X、Windows XP、Windows Vista、Windows 7。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：目录标题含HD不能证明来自2020新声优重制版，也不能与2015英文版等同。

实际打开的官方/一次资料：

- [developer_store](https://gungnir.dchd-ecshop.net/products/detail.php?product_id=99) · http_502 · 2026-11-13T20:57:15Z：原厂商店的NEW CAST REMASTER EDITION商品URL返回502；搜索发现的重制说明不替代正文核验。
- [localized_publisher_store](https://www.mangagamer.com/detail.php?goods_type=1&product_code=139) · readable · 2026-11-13T20:57:15Z：2015-10-30英文发行条目列Linux、OS X及Windows，标记无马赛克及血腥分类；与HD/新声优重制版并非已绑定同一版本。

## 近月少女的礼仪（v10680）

Steam FHD FullVoice版含本篇、After Story及特别故事。

年龄：角色年龄声明与游戏年龄分级分开；未核验原版分级。

性内容：Steam开发商称少量裸露，主要情节功能并非性暗示。

补丁：本次未核验官方成人恢复补丁。

已核验平台：Windows。语言：Japanese text、Simplified Chinese text、Traditional Chinese text、Japanese voice。

部署包：unknown；未赋最终分级。

局限：部署ONS版并无Steam来源绑定，不能据Steam内容覆盖它。

实际打开的官方/一次资料：

- [official_storefront](https://store.steampowered.com/app/1776970/?l=japanese) · readable · 2026-11-13T20:57:15Z：Steam FHD FullVoice版发行2022-06-17，日文/简繁中文文本、日文语音；开发商说明只有少量裸露且该情节主要功能并非性暗示。

## 野良与皇女与流浪猫之心1（v18148）

原厂PC/Android产品与2019 Steam商品不同入口。

年龄：原厂网站18岁内容警告。

性内容：本次没有直接性场景说明；Steam商品也不能直接推出无性内容。

补丁：未核验成人恢复补丁。

已核验平台：Windows、Android、Steam。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://harukaze-soft.com/nora/) · readable · 2026-11-13T20:57:15Z：原厂网页含18岁以上内容警告，确认PC本体及Android发行信息。警告本身未给性场景范围。
- [official_storefront](https://store.steampowered.com/app/1010600/The_Princess_the_Stray_Cat_and_Matters_of_the_Heart/) · readable · 2026-11-13T20:57:15Z：Steam独立条目2019-06-17，发行TOKYOTOON/Fruitbat Factory；未由普通商店文案断定无性内容。

## 野良与皇女与流浪猫之心2（v19841）

2017日文PC本体/组合包与Steam发行分别记录。

年龄：原厂公告明确DMM.R18通道。

性内容：Steam开发商只说明轻度CG裸露、暴力、粗俗语言与成人话题。

补丁：官网修正文件是一般修复，不据此认定成人恢复补丁。

已核验平台：Windows、Steam。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：不得用Steam版描述代表日文成人版或当前Artemis移植。

实际打开的官方/一次资料：

- [developer](https://harukaze-soft.com/nora2/) · readable · 2026-11-13T20:57:15Z：2017-10-27 PC实体/下载版，与前作组合包分别列明；介绍为前作后日谈及新增路线。
- [developer](https://harukaze-soft.com/nora2/install/) · readable · 2026-11-13T20:57:15Z：官方安装故障公告明确DMM.R18购买品的下载路径；这是成人发行通道证据，不等同实际本地包鉴定。
- [official_storefront](https://store.steampowered.com/app/1128260?l=english) · readable · 2026-11-13T20:57:15Z：Steam开发商内容说明列轻度CG裸露、轻度暴力、粗俗用语和成人话题；不等同日文成人版内容。

## 青空下的约定（v182）

Refine是2024完整重制，区别于原作。

年龄：Refine官方CERO C。

性内容：未核验原作或当前ONS包性内容。

补丁：未核验补丁。

已核验平台：Nintendo Switch、PlayStation 4、WindowsPC。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：Refine资料不能推断2006原作内容；本次原作官方证据不足。

实际打开的官方/一次资料：

- [publisher](https://www.entergram.co.jp/aozora_refine/product/) · readable · 2026-11-13T20:57:15Z：Refine版发行2024-12-19，Switch/PS4/WindowsPC，CERO C；这是独立重制版，不能覆盖原作。
- [publisher](https://www.entergram.co.jp/aozora_refine/point/) · readable · 2026-11-13T20:57:15Z：官方说明Refine为完整重制，美术、音乐和界面均更新。

## 飞鸟会长不肯认输（v37843）

2022实体及FANZA下载版。

年龄：NEXTON逐项18岁以上购买。

性内容：厂商概念页明确讨论性行为相关内容。

补丁：未核验补丁。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://azarashi-soft.nexton-net.jp/asunabi/product.html) · readable · 2026-11-13T20:57:15Z：2022-12-23实体/FANZA版，Windows10/11日文操作系统。
- [developer](https://azarashi-soft.nexton-net.jp/asunabi/concept.html) · readable · 2026-11-13T20:57:15Z：官方概念介绍明确讨论恋爱与性行为探索，但没有本次移植包或补丁状态资料。
- [publisher](https://nexton-net.jp/nexton-passport/service_azarasi.html) · readable · 2026-11-13T20:57:15Z：逐项列出爱语SSS、甜蜜夏日、绘缘蜜恋、飞鸟会长的发行版和18岁以上购买限制；甜蜜夏日另有Perfect及Limited版本。

## 宿星Girlfriend（v22880）

官方奖项确认第一作及三部曲起点；厂商站不可达。

年龄：奖项页面指向DMM.R18购买；无直接数字分级正文。

性内容：未知。

补丁：未核验补丁或合集成人内容差异。

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：奖项获奖和DMM.R18链接均不能证明当前包内容。

实际打开的官方/一次资料：

- [developer](https://www.mirai-soft.net/syukugar/) · http_502 · 2026-11-13T20:57:15Z：第一作官网入口返回502，未绕过。
- [official_industry_award](https://moe-gameaward.com/prize/2018/song.html) · readable · 2026-11-13T20:57:15Z：主办方页面收录mirai第一作获奖及厂商寄语，并链接DMM.R18购买；未给具体性场景。
- [developer](https://www.mirai-soft.net/syukugar-as/index.html) · unavailable · 2026-11-13T20:57:15Z：合集官网不可达；社区所述合集内容未作为官方结论。

## 宿星Girlfriend2（v23290）

第二作与合集官方页面本次不可达。

年龄：未知

性内容：未知

补丁：未知

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：不把社区资料替代厂商正文。

实际打开的官方/一次资料：

- [developer](https://www.mirai-soft.net/syukugar2/) · unavailable · 2026-11-13T20:57:15Z：第二作官网入口不可达；本次未取得官方正文。
- [developer](https://www.mirai-soft.net/syukugar-as/index.html) · unavailable · 2026-11-13T20:57:15Z：合集官网不可达；社区所述合集内容未作为官方结论。

## 宿星Girlfriend3（v23772）

第三作与合集官方页面本次不可达。

年龄：未知

性内容：未知

补丁：未知

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：不把社区资料替代厂商正文。

实际打开的官方/一次资料：

- [developer](https://www.mirai-soft.net/syukugar3/) · http_502 · 2026-11-13T20:57:15Z：第三作官网入口返回502；本次未取得官方正文。
- [developer](https://www.mirai-soft.net/syukugar-as/index.html) · unavailable · 2026-11-13T20:57:15Z：合集官网不可达；社区所述合集内容未作为官方结论。

## 常轨脱离Creative Re:Re:call（v53590）

2025 PC通常/豪华版。

年龄：原厂18禁PC板块收录。

性内容：原厂明确H场景。

补丁：附裸体立绘切换补丁卡；此补丁不是已证实的性场景恢复补丁。

已核验平台：Windows 10、Windows 11。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://madosoft.net/rerecall/product) · readable · 2026-11-13T20:57:15Z：2025-04-25 PC DVD通常/豪华版，Windows10/11日文操作系统；附可把普通场景立绘改为裸体的特典补丁卡。
- [developer](https://madosoft.net/rerecall/introduction) · readable · 2026-11-13T20:57:15Z：官方作品介绍明确宣传大量H场景。
- [developer](https://www.madosoft.net/products) · readable · 2026-11-13T20:57:15Z：Re:Re:call列在18禁PC游戏板块；同时另设全年龄主机板块。

## SELECT OBLIGE（v47175）

2024 PC与2026 Switch分开记录。

年龄：Switch官方CERO D。

性内容：PC有裸体立绘特典补丁；这证明该补丁提供裸露，不单独证明性行为场景。

补丁：首发PC特典可切换普通场景立绘为裸体；未核验海外Steam恢复补丁。

已核验平台：Windows 10、Windows 11、Nintendo Switch。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://selectoblige.com/product) · readable · 2026-11-13T20:57:15Z：PC版发行2024-07-26，DVD及下载卡，Windows10/11；首发附普通场景裸体立绘补丁，不应误称性场景恢复补丁。
- [console_publisher](https://imel.co.jp/selectoblige/product) · readable · 2026-11-13T20:57:15Z：Switch版发行2026-04-30，CERO D（17岁以上）；与PC条目分开。

## FLIP＊FLOP 〜INNOCENCE OVERCLOCK〜（v37021）

官方自发稿及厂商发布信息确认独立副标题及PC发行。

年龄：未知

性内容：官方可读文字没有年龄或性场景信息。

补丁：未核验补丁。

已核验平台：PC。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：原厂产品页403；新闻稿没有成人内容说明。

实际打开的官方/一次资料：

- [developer](https://www.fanzagames-digination.com/flipflop_io/) · http_403 · 2026-11-13T20:57:15Z：INNOCENCE OVERCLOCK原厂页403，未绕过。
- [publisher_press_release](https://prtimes.jp/main/html/rd/p/000004490.000032953.html) · readable · 2026-11-13T20:57:15Z：EXNOA自发新闻稿将两个副标题列为已发行的独立作品，给品牌与创作信息；未给成人分级、性场景或补丁说明。
- [manufacturer_release_republication](https://moe-gameaward.com/media/2022/10/28/8270/) · readable · 2026-11-13T20:57:15Z：媒体明确标注下文为厂商发布信息；确认INNOCENCE OVERCLOCK于2022-10-28发售，PC实体及下载形式，未核验性内容。

## FLIP＊FLOP ～RAMBLING OVERRUN～（v39197）

EXNOA官方稿确认独立第二副标题已发行。

年龄：未知

性内容：官方可读文字没有年龄或性场景信息。

补丁：未核验补丁。

已核验平台：未知。语言：未单独核验。

部署包：unknown；未赋最终分级。

局限：原厂产品页403；新闻稿没有成人内容说明。

实际打开的官方/一次资料：

- [developer](https://www.fanzagames-digination.com/flipflop_ran/) · http_403 · 2026-11-13T20:57:15Z：RAMBLING OVERRUN原厂页403，未绕过。
- [publisher_press_release](https://prtimes.jp/main/html/rd/p/000004490.000032953.html) · readable · 2026-11-13T20:57:15Z：EXNOA自发新闻稿将两个副标题列为已发行的独立作品，给品牌与创作信息；未给成人分级、性场景或补丁说明。

## 千之刃涛，桃花染之皇姬（v15708）

PC/Android版、2017 PS4/Vita版与2022 Switch版分别列明。

年龄：PC/Android原厂目录R18。

性内容：仅年龄/产品线证据；本次未取得直接性场景说明。

补丁：未核验补丁。

已核验平台：Windows、Android、PlayStation 4、PlayStation Vita、Nintendo Switch。语言：未单独核验。

部署包：unknown；未赋最终分级。

实际打开的官方/一次资料：

- [developer](https://august-soft.com/product/) · readable · 2026-11-13T20:57:15Z：原厂目录分别标注秽翼原PC及新装PC/Android版R18、千桃PC/Android版R18；另列各作品主机移植版。R18只按年龄/产品线资料记录。
- [console_publisher](https://www.entergram.co.jp/senmomo/) · readable · 2026-11-13T20:57:15Z：官方Switch页确认2022-07-28发行。
- [console_publisher](https://aria-soft.com/senmomo/) · readable · 2026-11-13T20:57:15Z：官方PlayStation页面列PS4/PS Vita版及其2017年公告；与PC版分别记录。
