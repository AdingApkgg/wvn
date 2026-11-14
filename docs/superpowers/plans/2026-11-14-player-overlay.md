# 播放页默认全视口与浮层操作

用户明确要求播放视图直接占满屏幕，其余控件显示在游玩画面上。默认使用100dvh可视区域，不等待浏览器原生全屏授权；iframe始终铺满该区域，游戏内部保持原比例。返回、菜单、存档、加载设置和状态作为浮层；操作可手动收起，保留显示操作入口。存档与加载面板在画面内展开并可关闭，不移动/重建运行iframe。权限遮罩、退出保存确认、原生全屏退出、旧页面隔离提示保持可达。

只改播放器、对应播放页提示传递及界面样式；不纳入工作区正在进行的dashboard/profiles改动。先以375×667、667×375、1440×900的实际几何与交互测试复现旧布局；再实现默认铺满和面板浮层，远程运行Chromium/WebKit、现有资源/权限回归、类型检查与构建。使用本任务既有独立QA环境，不复制未提交的其他任务改动。生产新变更另行按授权范围处理。

## 验证记录

- 旧布局在`wvn-player-overlay-red-03-20261114`三项测试均失败：iframe不等于视口；工具栏底部707px超出iframe底部575px；存档面板底部2312px超出667px视口。前两次命令未进入测试（项目参数/文件匹配配置问题），不计作产品失败证据。
- `wvn-player-overlay-verify-02-20261114`退出码0：14项HTTP/资格与no-transform回归、3项全屏模块测试、类型检查和生产构建通过。只同步三个本轮产品文件到原隔离QA，未同步并行的dashboard/profiles代码；最终三个文件SHA256与构建快照一致。
- 首轮旧交互回归发现自动展开的缓存提示会拦截“查看加载问题”。改为普通降级提示只在浮层状态区显示，错误仍有恢复入口；面板打开时不重复显示同位置的加载条。
- `wvn-player-overlay-all-chromium-20261114`：12项全部通过；`wvn-player-overlay-all-webkit-browser-20261114`：11项通过、1项Chromium专用虚拟验证器跳过。涵盖默认满视口、横竖屏、隐藏控件后仍可点击输入、同iframe保留、存档/设置面板开关、离开确认，以及既有资源异常和账号回归。其他既有引擎/M3测试仅同步按钮名称，未宣称本轮完成所有引擎实测。
- 真实CLANNAD视觉验证`wvn-player-overlay-visual-02-20261114`通过：375×667、667×375、1440×900均为iframe坐标0,0且大小等于视口，切换尺寸保留同一iframe；存档浮层、隐藏/显示操作与结束阅读通过，未捕获脚本异常。此项只模拟缓存权限拒绝，运行页、ONS JS/WASM及游戏资源均真实读取；不是iPhone实机。首次视觉任务120秒未启动且无脚本异常，保留该失败，不把新实验当作历史原因还原。

真实截图与回执在构建机`/home/i/wvn-ios-reader-auth-20261114/overlay-visual-02/`；本机审阅副本`/private/tmp/wvn-player-overlay-evidence/final/`。人工复核竖屏、横屏、隐藏操作和存档面板图均符合浮层布局。游戏保持原比例，不裁剪内容或拉伸画面，竖屏自然留黑边。当时封装候选尚未发布；后续已沿用本轮更新生产授权发布，最终状态见下方。

追加`wvn-player-overlay-native-20261114`：Chromium原生全屏1项通过，确认存档面板与离开确认会先退出原生全屏，弹层可见，取消离开仍保留原游戏实例。合计Chromium13项通过、WebKit11项通过；未将未执行的其他引擎测试计入此数。


## 生产发布完成

沿用用户“更新生产吧”对同一全屏问题修正的授权，按其随后补充的默认满视口/控件覆盖要求完成发布。产品提交`cb7208eb544afebd1ac3bebf31c493349d30b030`，版本`player-overlay-20261114-cb7208e`；当前公网健康标记一致。只发布三个产品文件与104个运行文件，不带入dashboard/profiles。新compose摘要`15d9b3a35d5fcff98deca034843178cd86ec2972dd909eb5d4d1fd06371b15d1`。

隔离数据库副本预检通过后只切换Web/manager；无数据库导入、无B2/CF配置修改、无独立缓存模块变更，原版本与哈希资源保留用于回退。生产任务`wvn-player-overlay-deploy-20261114`，目录`/srv/wvn-player-overlay-release-20261114/`。

公网Chromium和WebKit分别使用真实CLANNAD、真实缓存来源，在375×667、667×375、1440×900下验证默认iframe等于视口、工具栏在画面内、切换尺寸和面板保持同一iframe、存档面板不超视口、隐藏/显示操作及结束阅读。未模拟缓存拒绝，未捕获脚本异常，匿名受限资源仍401。回执与图片在构建机`/home/i/wvn-player-overlay-release-20261114/public-{chromium,webkit}/`；真实iPhone仍未验收。

5分钟11次健康采样通过，部署退出码0。最终104个运行文件和未变的14个缓存文件摘要均一致；Web/manager错误日志0、重启0、OOM为false，其他容器不变。最终回执`/srv/wvn-player-overlay-release-20261114/final-receipt.json`；本机副本`/private/tmp/wvn-player-overlay-release-20261114/final-receipt.json`。回滚入口为同目录`release.py rollback`，执行前必须核对当前compose仍为本候选摘要。

## 窄屏游戏画布居中修正

用户反馈窄屏仍置顶，问题在ONS运行页内部：canvas的`margin:auto`只水平居中。产品提交`2d2df56`在B2/CAS与本地ONS两条运行页中增加`body{display:grid;place-items:center}`，沿用现有`scale_full`保持游戏比例。账号服务器直接导入这两处运行页生成模块，无需重新构建前端；发布复用前次已验证的构建，不包含并行dashboard/profiles修改。

新增实际运行页几何回归，320×640旧样式垂直偏移200px而失败；修复后Chromium/WebKit均通过320×640、375×667、667×375、1440×900及连续切换，4项B2/CAS HTTP回归通过。

沿用同一问题生产更新授权，版本`canvas-center-20261114-2d2df56`，compose摘要`310c5a3861d872fdcf344e81369f0d321510fa321200806f6ec0d96b5a19b721`。只替换两处服务端文件；隔离副本预检通过，切换Web/manager，保留旧版本。任务目录`/srv/wvn-canvas-center-release-20261114/`，可核对当前compose后用`release.py rollback`回退。

公网真实CLANNAD在Chromium/WebKit均通过：375×667的画布为375×281.25，y=192.875；667×375的画布为500×375，x=83.5；桌面1440×900的画布为1200×900，x=120。画面中心与视口中心一致，画面比例4:3，浮层与同iframe保留检查通过，无脚本异常。人工查看WebKit竖屏截图确认画面居中。证据在构建机`/home/i/wvn-canvas-center-release-20261114/public-{chromium,webkit}/`；Linux WebKit结果不能替代真实iPhone验收。

最终5分钟11次健康采样通过，部署退出码0；两处运行文件及未变的14个缓存文件摘要一致。Web/manager日志错误0、重启0、OOM为false，其他容器不变，无数据库导入。最终回执`/srv/wvn-canvas-center-release-20261114/final-receipt.json`，本机副本位于`/private/tmp/wvn-canvas-center-release-20261114/`。
