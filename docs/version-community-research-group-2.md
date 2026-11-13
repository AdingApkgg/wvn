# 第2组社区版本标记核查

核查时间：2026-11-13T21:08:21.085638+00:00。24作品、34目录版本。建议计数：{'present': 6, 'unknown': 8, 'none': 10}。

用户已接受VNDB与KUNGal标记，因此本轮不再要求官方发行哈希。均一has_ero候选可直接形成建议；混合分支先用发行类型和KUN资源的引擎/完整性对应，仍有成人补丁歧义时留unknown。KUN封面旁SFW、成人画廊隐藏提示和游戏年龄限制分别处理。

VNDB网页两次不可访问后改读父任务已取得的公开API缓存；未绕过登录、401或年龄确认。KUN搜索缓存与当前正文出现差异时均已说明，未把索引旧ID直接认作当前页面。未下载游戏、补丁或调用网盘。

关键判断：知更鸟非成人候选仅为体验版，KUN当前页R18并列ONS资源；星空桥KUN当前页有R18及ONS资源对应。万华镜2唯一false为英语翻译补丁，不能盖过原作/中文完整游戏true。樱之诗简中RenPy完整移植r128749明确has_ero=true，可对应两个RenPy目录版本。樱之刻存在完整简中PSV移植has_ero=false/minage18，已纠正初筛时仅看官方发行造成的误判，当前建议unknown。

## v13190 妹调教日记fd

建议：**present**。VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-28ccd8d92b51623f2011170e（ONS）：present；VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/280)：NSFW resource warning；opened-nsfw-gate。当前页面明确此资源含NSFW；搜索缓存资源备注为ONS本体+FD合集。未确认显示；ONS/FD详情仅来自索引，非当前正文。

VNDB候选：[r28499](https://vndb.org/r28499) has_ero=true / 18 / None；[r33506](https://vndb.org/r33506) has_ero=true / 18 / None；[r34877](https://vndb.org/r34877) has_ero=true / 18 / None；[r120127](https://vndb.org/r120127) has_ero=true / 18 / None；[r169557](https://vndb.org/r169557) has_ero=true / 18 / None

## v14805 小小的爱情公寓

建议：**present**。VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-7d8b5a9c884b57e6796265c4（Artemis）：present；VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/2336)：R18 (search index)；open-failed-cache-miss。搜索缓存标R18，备注Tyranor直接运行、不用补丁，和目录Artemis方向相符。当前正文未读取；评级仅索引，不是封面SFW。

VNDB候选：[r32669](https://vndb.org/r32669) has_ero=true / 18 / EntisGLS；[r34198](https://vndb.org/r34198) has_ero=true / 18 / None；[r38793](https://vndb.org/r38793) has_ero=true / 18 / EntisGLS；[r67382](https://vndb.org/r67382) has_ero=true / 18 / None；[r117480](https://vndb.org/r117480) has_ero=true / 18 / EntisGLS；[r123726](https://vndb.org/r123726) has_ero=true / 18 / Artemis Engine

## v11071 万华镜2

建议：**present**。VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-46214980e42483df202ceab1（ONS）：present；VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- 目录版本 legacy-67520f0d0345af13ed1be2ec（ONS）：present；VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- 目录版本 legacy-ff6a61f773272d2a1e61609b（ONS）：present；VNDB唯一false是英语翻译补丁r137184；排除补丁自身与语言差异后完整原作/中文及移植均为has_ero=true，KUN资源亦明确NSFW。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · resource](https://www.kungal.com/galgame-resource/5937)：NSFW resource warning；opened-nsfw-gate。当前重定向资源页明确含NSFW。该条为应用直装，不是目录ONS；不能以引擎完全匹配描述。

VNDB候选：[r16198](https://vndb.org/r16198) has_ero=true / 18 / QLIE；[r21935](https://vndb.org/r21935) has_ero=true / 18 / QLIE；[r27404](https://vndb.org/r27404) has_ero=true / 18 / None；[r44488](https://vndb.org/r44488) has_ero=true / 18 / None；[r59935](https://vndb.org/r59935) has_ero=true / 18 / Ren'Py；[r65693](https://vndb.org/r65693) has_ero=true / 18 / QLIE；[r104271](https://vndb.org/r104271) has_ero=true / 18 / None；[r107839](https://vndb.org/r107839) has_ero=true / 18 / None；[r137184](https://vndb.org/r137184) has_ero=false / None / None；[r162137](https://vndb.org/r162137) has_ero=true / 18 / QLIE；[r169137](https://vndb.org/r169137) has_ero=true / 18 / QLIE

## v19182 万华镜4

建议：**present**。VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-dbdae3ca10bd76d1ab998ba6（ONS）：present；VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- 目录版本 legacy-e1e29253c2fd43ddc771365f（ONS）：present；VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- 目录版本 legacy-a378c290085945c2a66a5e1e（ONS）：present；VNDB本作已查发行候选的has_ero一致为true，18+；按社区作品/发行标记覆盖当前同名版本。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r45593](https://vndb.org/r45593) has_ero=true / 18 / QLIE；[r50998](https://vndb.org/r50998) has_ero=true / 18 / QLIE；[r52925](https://vndb.org/r52925) has_ero=true / 18 / None；[r52934](https://vndb.org/r52934) has_ero=true / 18 / None；[r84041](https://vndb.org/r84041) has_ero=true / 18 / None；[r97942](https://vndb.org/r97942) has_ero=true / 18 / None；[r130450](https://vndb.org/r130450) has_ero=true / 18 / QLIE；[r138903](https://vndb.org/r138903) has_ero=true / 18 / None；[r162137](https://vndb.org/r162137) has_ero=true / 18 / QLIE；[r169137](https://vndb.org/r169137) has_ero=true / 18 / QLIE

## v12246 少女理论及其周边

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-2a67a4d4f50f9f8b69621a75（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/48)：R18；opened。当前正文年龄限制R18；引擎同时有QLIE/Artemis。同页有全年龄标签及多种发行分支；作品R18不能区分当前Artemis。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/463)：R18 (search index)；open-failed-cache-miss。搜索缓存为R18，相关列表提TY资源。不能确认精确TY资源的补丁/内容。

VNDB候选：[r25939](https://vndb.org/r25939) has_ero=true / 18 / QLIE；[r27691](https://vndb.org/r27691) has_ero=true / 18 / QLIE；[r32188](https://vndb.org/r32188) has_ero=true / 18 / QLIE；[r36472](https://vndb.org/r36472) has_ero=true / 18 / QLIE；[r46889](https://vndb.org/r46889) has_ero=false / 15 / None；[r47630](https://vndb.org/r47630) has_ero=false / 15 / None；[r47964](https://vndb.org/r47964) has_ero=true / 18 / None；[r58298](https://vndb.org/r58298) has_ero=true / 18 / None；[r70680](https://vndb.org/r70680) has_ero=true / 18 / None；[r78852](https://vndb.org/r78852) has_ero=true / 18 / None；[r96349](https://vndb.org/r96349) has_ero=true / 18 / None；[r96350](https://vndb.org/r96350) has_ero=true / 18 / None；[r112220](https://vndb.org/r112220) has_ero=false / None / Artemis Engine；[r116700](https://vndb.org/r116700) has_ero=true / 18 / None；[r159649](https://vndb.org/r159649) has_ero=true / 18 / None

## v33205 常规脱离creative凸

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-c89356e75eb8577e08dda1e1（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- 目录版本 c8005fb2-d1bc-5392-b97a-0f305c97fb2b（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · resource](https://www.kungal.com/topic/738)：Artemis/Tyranor port；opened。实开正文同时列本篇/凸的Artemis(Tyranor)资源。没有在此资源帖正文标明R18或成人补丁已装。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/13032)：Steam restoration patch included；opened。实开正文有两作合集、PC/安卓及补全Steam删减内容的附加补丁。附带补丁不代表目录版本已应用；R18仅搜索缓存显示。

VNDB候选：[r85757](https://vndb.org/r85757) has_ero=true / 18 / None；[r91861](https://vndb.org/r91861) has_ero=true / 18 / None；[r92864](https://vndb.org/r92864) has_ero=true / 18 / Artemis Engine；[r96944](https://vndb.org/r96944) has_ero=true / 18 / Artemis Engine；[r98945](https://vndb.org/r98945) has_ero=true / 18 / None；[r99366](https://vndb.org/r99366) has_ero=true / 18 / None；[r100131](https://vndb.org/r100131) has_ero=true / 18 / Artemis Engine；[r100276](https://vndb.org/r100276) has_ero=true / 18 / None；[r118911](https://vndb.org/r118911) has_ero=false / None / Artemis Engine；[r137422](https://vndb.org/r137422) has_ero=true / 18 / None；[r140037](https://vndb.org/r140037) has_ero=true / 18 / Artemis Engine；[r157352](https://vndb.org/r157352) has_ero=true / 18 / None；[r166140](https://vndb.org/r166140) has_ero=true / 18 / None

## v27449 常轨脱离Creative

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-79060b38748739bd8e64e718（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- 目录版本 6a43fdcc-d01c-5754-9bd0-dd660ea6d80f（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · resource](https://www.kungal.com/topic/738)：Artemis/Tyranor port；opened。实开正文同时列本篇/凸的Artemis(Tyranor)资源。没有在此资源帖正文标明R18或成人补丁已装。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/13032)：Steam restoration patch included；opened。实开正文有两作合集、PC/安卓及补全Steam删减内容的附加补丁。附带补丁不代表目录版本已应用；R18仅搜索缓存显示。

VNDB候选：[r68473](https://vndb.org/r68473) has_ero=true / 18 / Artemis Engine；[r73691](https://vndb.org/r73691) has_ero=true / 18 / Artemis Engine；[r74089](https://vndb.org/r74089) has_ero=true / 18 / None；[r74391](https://vndb.org/r74391) has_ero=false / 17 / Artemis Engine；[r74396](https://vndb.org/r74396) has_ero=false / 17 / Artemis Engine；[r74630](https://vndb.org/r74630) has_ero=true / 18 / Artemis Engine；[r75867](https://vndb.org/r75867) has_ero=true / 18 / None；[r77072](https://vndb.org/r77072) has_ero=true / 18 / None；[r77912](https://vndb.org/r77912) has_ero=false / 15 / Artemis Engine；[r77913](https://vndb.org/r77913) has_ero=false / 15 / Artemis Engine；[r80667](https://vndb.org/r80667) has_ero=false / 15 / Artemis Engine；[r80668](https://vndb.org/r80668) has_ero=false / 15 / Artemis Engine；[r81957](https://vndb.org/r81957) has_ero=true / 18 / None；[r93140](https://vndb.org/r93140) has_ero=false / None / None；[r94751](https://vndb.org/r94751) has_ero=false / None / Artemis Engine；[r96409](https://vndb.org/r96409) has_ero=true / 18 / None；[r96548](https://vndb.org/r96548) has_ero=false / 0 / None；[r100132](https://vndb.org/r100132) has_ero=true / 18 / Artemis Engine；[r140037](https://vndb.org/r140037) has_ero=true / 18 / Artemis Engine；[r142799](https://vndb.org/r142799) has_ero=false / 18 / None；[r155958](https://vndb.org/r155958) has_ero=true / 18 / None；[r164211](https://vndb.org/r164211) has_ero=true / 18 / None；[r169224](https://vndb.org/r169224) has_ero=false / 15 / Artemis Engine；[r169938](https://vndb.org/r169938) has_ero=true / 18 / None

## v27457 徒花异谭

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-3a6409c0cdde7c72c3f5985d（Artemis）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r68491](https://vndb.org/r68491) has_ero=false / 0 / Silky Engine；[r71401](https://vndb.org/r71401) has_ero=false / 0 / Silky Engine；[r78546](https://vndb.org/r78546) has_ero=false / 0 / Silky Engine；[r84993](https://vndb.org/r84993) has_ero=false / 15 / Artemis Engine；[r94418](https://vndb.org/r94418) has_ero=false / 15 / Artemis Engine；[r94419](https://vndb.org/r94419) has_ero=false / 15 / Artemis Engine；[r98230](https://vndb.org/r98230) has_ero=false / 0 / None；[r115317](https://vndb.org/r115317) has_ero=false / 0 / None；[r125261](https://vndb.org/r125261) has_ero=false / 0 / Artemis Engine

## v36554 这份恋情、予以保留、

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-e421fa9d2b91b91b55c06c99（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r92559](https://vndb.org/r92559) has_ero=false / None / TyranoScript；[r119045](https://vndb.org/r119045) has_ero=false / None / None

## v36555 这份恋情、予以保留、游园会

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-862831b35153b8527b97103b（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r92560](https://vndb.org/r92560) has_ero=false / 0 / TyranoScript；[r119046](https://vndb.org/r119046) has_ero=false / None / None

## v36556 这份恋情、予以保留、情人节小剧场

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-6e9fbf4620fbe0a8faac2ea7（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r92561](https://vndb.org/r92561) has_ero=false / None / TyranoScript；[r119047](https://vndb.org/r119047) has_ero=false / None / None

## v36557 这份恋情、暂时待定、

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-c8c3354e1ad697410f361147（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r92562](https://vndb.org/r92562) has_ero=false / None / TyranoScript；[r119048](https://vndb.org/r119048) has_ero=false / None / None

## v36558 这份恋情、暂时待定、 情人节小剧场Z

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-d59b2445f0f42f0cc649572b（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r92563](https://vndb.org/r92563) has_ero=false / None / TyranoScript；[r119049](https://vndb.org/r119049) has_ero=false / None / None

## v44249 这份恋情、迎来終焉。

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-3aa2e08ae7ef40d85fd49212（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r106734](https://vndb.org/r106734) has_ero=false / 0 / TyranoScript；[r119050](https://vndb.org/r119050) has_ero=false / None / None

## v49795 这份恋情、迎来终焉。情人节小剧场X

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-512eb028c2f298f534d2de34（Tyrano）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r120231](https://vndb.org/r120231) has_ero=false / None / None；[r120232](https://vndb.org/r120232) has_ero=false / None / None

## v22899 拔作岛1

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-156b1273e3d67dc3ec603fd2（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r56632](https://vndb.org/r56632) has_ero=true / 18 / Shiina Rio；[r57518](https://vndb.org/r57518) has_ero=true / 18 / Shiina Rio；[r58439](https://vndb.org/r58439) has_ero=true / 18 / Shiina Rio；[r59346](https://vndb.org/r59346) has_ero=true / 18 / Shiina Rio；[r62830](https://vndb.org/r62830) has_ero=true / 18 / Shiina Rio；[r66955](https://vndb.org/r66955) has_ero=true / 18 / Shiina Rio；[r74485](https://vndb.org/r74485) has_ero=true / 18 / None；[r82678](https://vndb.org/r82678) has_ero=true / 18 / None；[r97031](https://vndb.org/r97031) has_ero=true / 18 / None；[r106546](https://vndb.org/r106546) has_ero=false / None / None；[r106547](https://vndb.org/r106547) has_ero=true / 18 / None；[r106550](https://vndb.org/r106550) has_ero=true / 18 / Artemis Engine；[r109478](https://vndb.org/r109478) has_ero=true / 18 / None；[r109561](https://vndb.org/r109561) has_ero=true / 18 / None；[r109660](https://vndb.org/r109660) has_ero=false / 18 / None；[r115521](https://vndb.org/r115521) has_ero=true / 18 / Artemis Engine；[r118912](https://vndb.org/r118912) has_ero=true / 18 / Artemis Engine；[r120943](https://vndb.org/r120943) has_ero=true / 18 / Artemis Engine；[r126251](https://vndb.org/r126251) has_ero=true / 18 / Artemis Engine；[r141392](https://vndb.org/r141392) has_ero=true / 18 / None；[r141393](https://vndb.org/r141393) has_ero=true / 18 / None；[r141668](https://vndb.org/r141668) has_ero=true / 18 / None；[r142857](https://vndb.org/r142857) has_ero=true / 18 / None；[r143284](https://vndb.org/r143284) has_ero=true / 18 / Artemis Engine；[r148142](https://vndb.org/r148142) has_ero=true / 18 / None；[r149879](https://vndb.org/r149879) has_ero=true / 18 / None；[r159815](https://vndb.org/r159815) has_ero=true / 18 / Artemis Engine；[r161402](https://vndb.org/r161402) has_ero=true / 18 / Artemis Engine

## v23741 拔作岛2

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-589e8be3f37d376dd02787fe（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/32)：NSFW work warning；opened-nsfw-gate。当前页面明确Galgame含NSFW；搜索缓存年龄限制R18。未确认显示；不能判别同为Artemis的剪辑版/成人版。

VNDB候选：[r58539](https://vndb.org/r58539) has_ero=true / 18 / Shiina Rio；[r62830](https://vndb.org/r62830) has_ero=true / 18 / Shiina Rio；[r64033](https://vndb.org/r64033) has_ero=true / 18 / Shiina Rio；[r66954](https://vndb.org/r66954) has_ero=true / 18 / Shiina Rio；[r66955](https://vndb.org/r66955) has_ero=true / 18 / Shiina Rio；[r70634](https://vndb.org/r70634) has_ero=true / 18 / Shiina Rio；[r73533](https://vndb.org/r73533) has_ero=true / 18 / None；[r82679](https://vndb.org/r82679) has_ero=false / None / None；[r85624](https://vndb.org/r85624) has_ero=true / 18 / None；[r93808](https://vndb.org/r93808) has_ero=true / 18 / None；[r97203](https://vndb.org/r97203) has_ero=true / 18 / None；[r109469](https://vndb.org/r109469) has_ero=false / None / Artemis Engine；[r109486](https://vndb.org/r109486) has_ero=true / 18 / Artemis Engine；[r118912](https://vndb.org/r118912) has_ero=true / 18 / Artemis Engine；[r119008](https://vndb.org/r119008) has_ero=true / 18 / None；[r119477](https://vndb.org/r119477) has_ero=true / 18 / None；[r119511](https://vndb.org/r119511) has_ero=true / 18 / None；[r120943](https://vndb.org/r120943) has_ero=true / 18 / Artemis Engine；[r121751](https://vndb.org/r121751) has_ero=true / 18 / None；[r123772](https://vndb.org/r123772) has_ero=true / 18 / None；[r126251](https://vndb.org/r126251) has_ero=true / 18 / Artemis Engine；[r135307](https://vndb.org/r135307) has_ero=true / 18 / None；[r141391](https://vndb.org/r141391) has_ero=true / 18 / None；[r141394](https://vndb.org/r141394) has_ero=true / 18 / None；[r142086](https://vndb.org/r142086) has_ero=false / None / None；[r142174](https://vndb.org/r142174) has_ero=true / 18 / None；[r142841](https://vndb.org/r142841) has_ero=true / 18 / Artemis Engine；[r142881](https://vndb.org/r142881) has_ero=true / 18 / None；[r144648](https://vndb.org/r144648) has_ero=true / 18 / None；[r148479](https://vndb.org/r148479) has_ero=false / None / None；[r149878](https://vndb.org/r149878) has_ero=true / 18 / None；[r159817](https://vndb.org/r159817) has_ero=true / 18 / Artemis Engine；[r161402](https://vndb.org/r161402) has_ero=true / 18 / Artemis Engine

## v50789 星之终途后日谈：渺茫希望的日记

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-5e3dbea8bde738028caa826d（RenPy）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/zh-cn/galgame/440)：unavailable；inaccessible。本轮打开失败，使用VNDB RenPy发行版has_ero=false。

VNDB候选：[r123021](https://vndb.org/r123021) has_ero=false / None / Ren'Py；[r123194](https://vndb.org/r123194) has_ero=false / None / Ren'Py；[r160909](https://vndb.org/r160909) has_ero=false / None / Ren'Py

## v29443 星之终途

建议：**none**。VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-b6f36b1aa99e3f53dbad46c4（Artemis）：none；VNDB本作已查发行候选的has_ero一致为false；按用户接受的社区分级建议，不再以官方哈希缺失阻挡。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。

VNDB候选：[r75309](https://vndb.org/r75309) has_ero=false / 0 / SiglusEngine；[r91703](https://vndb.org/r91703) has_ero=false / 0 / SiglusEngine；[r91704](https://vndb.org/r91704) has_ero=false / 0 / SiglusEngine；[r94965](https://vndb.org/r94965) has_ero=false / 0 / SiglusEngine；[r95800](https://vndb.org/r95800) has_ero=false / 0 / None；[r97134](https://vndb.org/r97134) has_ero=false / 0 / None；[r97502](https://vndb.org/r97502) has_ero=false / 0 / SiglusEngine；[r101476](https://vndb.org/r101476) has_ero=false / 0 / None；[r102262](https://vndb.org/r102262) has_ero=false / 0 / Artemis Engine；[r102330](https://vndb.org/r102330) has_ero=false / 0 / None；[r104128](https://vndb.org/r104128) has_ero=false / 0 / None；[r106392](https://vndb.org/r106392) has_ero=false / 12 / Artemis Engine；[r106393](https://vndb.org/r106393) has_ero=false / 16 / Artemis Engine；[r106648](https://vndb.org/r106648) has_ero=false / 0 / None；[r107579](https://vndb.org/r107579) has_ero=false / 0 / None；[r111860](https://vndb.org/r111860) has_ero=false / 0 / None；[r119391](https://vndb.org/r119391) has_ero=false / 0 / None；[r125260](https://vndb.org/r125260) has_ero=false / 0 / Artemis Engine；[r126436](https://vndb.org/r126436) has_ero=false / 17 / Luca System；[r126755](https://vndb.org/r126755) has_ero=false / 15 / Luca System；[r126756](https://vndb.org/r126756) has_ero=false / 15 / Luca System；[r129827](https://vndb.org/r129827) has_ero=false / 0 / Artemis Engine；[r134364](https://vndb.org/r134364) has_ero=false / 0 / None；[r140529](https://vndb.org/r140529) has_ero=false / 16 / Artemis Engine；[r140530](https://vndb.org/r140530) has_ero=false / 12 / Artemis Engine；[r146393](https://vndb.org/r146393) has_ero=false / 0 / None；[r147525](https://vndb.org/r147525) has_ero=false / 0 / None；[r159671](https://vndb.org/r159671) has_ero=false / None / None；[r164370](https://vndb.org/r164370) has_ero=false / None / None

## v8436 是谁杀了知更鸟

建议：**present**。社区完整CSA发行has_ero=true，false候选只是体验版；KUN R18作品页又列ONS合集，符合目录完整ONS方向。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-110fc755bff5f71cb2a6c32c（ONS）：present；社区完整CSA发行has_ero=true，false候选只是体验版；KUN R18作品页又列ONS合集，符合目录完整ONS方向。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/109)：R18；opened。当前年龄字段R18，正文资源列表有PC+ONS+安卓直装合集。对应ONS资源类别，未声称与部署文件同一份；不再要求哈希。

VNDB候选：[r17215](https://vndb.org/r17215) has_ero=true / 18 / KiriKiri；[r24090](https://vndb.org/r24090) has_ero=true / 18 / None；[r31851](https://vndb.org/r31851) has_ero=true / 18 / None；[r33134](https://vndb.org/r33134) has_ero=false / None / KiriKiri

## v2968 架向星空之桥

建议：**present**。KUN当前R18作品页明确列ONS本篇资源；VNDB完整PC成人发行与之相符。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-c0cc212cf2992cc7c3681e85（ONS）：present；KUN当前R18作品页明确列ONS本篇资源；VNDB完整PC成人发行与之相符。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/72)：R18；opened。当前年龄字段R18，资源列表明确ONS本篇及本篇+AA合集。以社区ONS资源类别对应，未声称同包。

VNDB候选：[r5848](https://vndb.org/r5848) has_ero=true / 18 / Yuka System；[r12956](https://vndb.org/r12956) has_ero=true / 18 / None；[r17719](https://vndb.org/r17719) has_ero=true / 18 / None；[r78976](https://vndb.org/r78976) has_ero=false / None / None；[r78977](https://vndb.org/r78977) has_ero=true / 18 / None；[r102579](https://vndb.org/r102579) has_ero=true / 18 / None

## v22847 树莓立方体

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-3ab8194b66d726bd4279e3b4（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- 目录版本 cbc04bd1-9eaa-51db-906e-d434742211f8（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/89)：R18；opened。当前年龄字段R18、Artemis；封面SFW没有被当成游戏分级。多种平台均Artemis；PC成人版和主机/Steam非成人版仍须区分。

VNDB候选：[r56464](https://vndb.org/r56464) has_ero=true / 18 / Artemis Engine；[r58553](https://vndb.org/r58553) has_ero=true / 18 / Artemis Engine；[r58658](https://vndb.org/r58658) has_ero=true / 18 / Artemis Engine；[r58714](https://vndb.org/r58714) has_ero=true / 18 / None；[r61468](https://vndb.org/r61468) has_ero=true / 18 / Artemis Engine；[r63256](https://vndb.org/r63256) has_ero=false / 15 / Artemis Engine；[r63257](https://vndb.org/r63257) has_ero=false / 17 / Artemis Engine；[r63258](https://vndb.org/r63258) has_ero=false / 15 / Artemis Engine；[r63259](https://vndb.org/r63259) has_ero=false / 17 / Artemis Engine；[r63260](https://vndb.org/r63260) has_ero=false / 15 / Artemis Engine；[r63261](https://vndb.org/r63261) has_ero=false / 17 / Artemis Engine；[r65037](https://vndb.org/r65037) has_ero=false / None / Artemis Engine；[r65542](https://vndb.org/r65542) has_ero=true / 18 / None；[r76973](https://vndb.org/r76973) has_ero=true / 18 / None；[r93139](https://vndb.org/r93139) has_ero=false / None / None；[r97485](https://vndb.org/r97485) has_ero=false / None / None；[r97935](https://vndb.org/r97935) has_ero=true / 18 / None；[r100133](https://vndb.org/r100133) has_ero=true / 18 / Artemis Engine；[r168392](https://vndb.org/r168392) has_ero=true / 18 / Artemis Engine

## v20431 樱之刻

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-f71101d6acb2871ade48bcec（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- 目录版本 d6b4fc84-a347-5a28-9184-579085dadfa1（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/169)：R18；opened。当前年龄字段R18、Artemis；全发行表另有简中PSV完整移植has_ero=false/minage18。18+与has_ero不等同；PSV完整移植和PC成人版必须分别考虑。

VNDB候选：[r49417](https://vndb.org/r49417) has_ero=true / 18 / Artemis Engine；[r82142](https://vndb.org/r82142) has_ero=false / 18 / Artemis Engine；[r83884](https://vndb.org/r83884) has_ero=false / 18 / None；[r86972](https://vndb.org/r86972) has_ero=false / 18 / None；[r89981](https://vndb.org/r89981) has_ero=false / 18 / Artemis Engine；[r90501](https://vndb.org/r90501) has_ero=true / 18 / Artemis Engine；[r90502](https://vndb.org/r90502) has_ero=true / 18 / Artemis Engine；[r100278](https://vndb.org/r100278) has_ero=false / None / Artemis Engine；[r105207](https://vndb.org/r105207) has_ero=false / 18 / None；[r107025](https://vndb.org/r107025) has_ero=false / None / None；[r110691](https://vndb.org/r110691) has_ero=true / 18 / None；[r116330](https://vndb.org/r116330) has_ero=true / 18 / None；[r121265](https://vndb.org/r121265) has_ero=true / 18 / None；[r124135](https://vndb.org/r124135) has_ero=false / 18 / None；[r125266](https://vndb.org/r125266) has_ero=false / 18 / Artemis Engine；[r130060](https://vndb.org/r130060) has_ero=false / 18 / None；[r131068](https://vndb.org/r131068) has_ero=true / 18 / None；[r138444](https://vndb.org/r138444) has_ero=true / 18 / None；[r142465](https://vndb.org/r142465) has_ero=true / 18 / Artemis Engine；[r150584](https://vndb.org/r150584) has_ero=true / 18 / Artemis Engine；[r164952](https://vndb.org/r164952) has_ero=true / 18 / Artemis Engine；[r166420](https://vndb.org/r166420) has_ero=true / 18 / Artemis Engine；[r169458](https://vndb.org/r169458) has_ero=false / None / Artemis Engine；[r169630](https://vndb.org/r169630) has_ero=false / None / Artemis Engine

## v562 樱之诗

建议：**unknown**。VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。

社区证据覆盖层级已注明。候选集已包含非官方移植。翻译补丁自身has_ero字段不直接当基础游戏状态；完整PSV/Steam剪辑版则是实质分支。

- 目录版本 legacy-b6cc5da681fc717131109dfb（RenPy）：present；VNDB r128749 是简中RenPy安卓完整移植，has_ero=true/minage18，直接对应目录RenPy版本；r82144的H未翻译不等于删除H。
- 目录版本 legacy-acdb13048e0f27deca44a5ea（RenPy）：present；VNDB r128749 是简中RenPy安卓完整移植，has_ero=true/minage18，直接对应目录RenPy版本；r82144的H未翻译不等于删除H。
- 目录版本 33224257-9a7b-5d77-b690-2c0fd9643a48（Artemis）：unknown；VNDB存在has_ero=true与false分支；目录引擎/标题不足以区分成人、剪辑、主机或体验版，当前未找到明确成人状态的对应资源。
- [VNDB · release](https://api.vndb.org/kana/release)：has_ero=[False, True]；parent-fetched-public-api;local-cache-read。逐条读取公开API发行版的has_ero/minage/engine/languages/platforms；非网页打开声明。
- [KUNGal · work](https://www.kungal.com/galgame/133)：R18 / original-versus-censored discussion；opened。当前作品页讨论原版18R与删减版；相关资源说明H场景汉化与未汉化有差异。未核实RenPy资源具体分支；H未汉化不是H删减。
- [KUNGal · resource](https://www.kungal.com/galgame/resource/6866)：R18; H not translated (index)；open-failed-cache-miss。搜索缓存资源说明高清重制、H未汉化。不把该安卓直装条目当成目录RenPy精确版。

VNDB候选：[r1160](https://vndb.org/r1160) has_ero=false / 0 / BGI/Ethornell；[r10022](https://vndb.org/r10022) has_ero=true / 18 / BGI/Ethornell；[r41408](https://vndb.org/r41408) has_ero=true / 18 / BGI/Ethornell；[r51136](https://vndb.org/r51136) has_ero=true / 18 / None；[r56154](https://vndb.org/r56154) has_ero=true / 18 / None；[r69289](https://vndb.org/r69289) has_ero=true / 18 / None；[r70391](https://vndb.org/r70391) has_ero=true / 18 / BGI/Ethornell；[r74442](https://vndb.org/r74442) has_ero=true / 18 / None；[r77891](https://vndb.org/r77891) has_ero=true / 18 / None；[r82144](https://vndb.org/r82144) has_ero=true / 18 / None；[r82534](https://vndb.org/r82534) has_ero=true / 18 / None；[r94025](https://vndb.org/r94025) has_ero=true / 18 / None；[r94249](https://vndb.org/r94249) has_ero=true / 18 / None；[r104939](https://vndb.org/r104939) has_ero=false / None / None；[r105004](https://vndb.org/r105004) has_ero=true / 18 / None；[r110216](https://vndb.org/r110216) has_ero=true / 18 / None；[r125267](https://vndb.org/r125267) has_ero=false / 18 / Artemis Engine；[r128749](https://vndb.org/r128749) has_ero=true / 18 / Ren'Py；[r138443](https://vndb.org/r138443) has_ero=false / None / None；[r139142](https://vndb.org/r139142) has_ero=true / 18 / Artemis Engine；[r143963](https://vndb.org/r143963) has_ero=true / 18 / Artemis Engine；[r146508](https://vndb.org/r146508) has_ero=true / 18 / None；[r146606](https://vndb.org/r146606) has_ero=true / 18 / Artemis Engine；[r146836](https://vndb.org/r146836) has_ero=true / 18 / None；[r155769](https://vndb.org/r155769) has_ero=true / 18 / Artemis Engine；[r157884](https://vndb.org/r157884) has_ero=false / None / None；[r157916](https://vndb.org/r157916) has_ero=false / None / None；[r160476](https://vndb.org/r160476) has_ero=true / 18 / None；[r160486](https://vndb.org/r160486) has_ero=true / 18 / None；[r160918](https://vndb.org/r160918) has_ero=true / 18 / Artemis Engine；[r167628](https://vndb.org/r167628) has_ero=false / None / Artemis Engine；[r168681](https://vndb.org/r168681) has_ero=true / 18 / None；[r169266](https://vndb.org/r169266) has_ero=false / None / None；[r169629](https://vndb.org/r169629) has_ero=false / 18 / Artemis Engine；[r169784](https://vndb.org/r169784) has_ero=false / None / None

