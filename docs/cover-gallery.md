# 自适应封面墙

首页按图片的宽高比进行等高混排，封面、方图和横图保留完整内容。普通卡片使用 Flex 按比例分配行内宽度，文字位于图片外；卡片顺序与搜索结果顺序一致。最后一排吸收余量，避免只有一部作品时把封面放大到整行。

Logo 和宽高比超过 2.2 的图片使用横向卡片，图片与文字并排。手机上普通竖封面通常每排两张，横图通常单独成排。图片统一 contain，极窄图片保留完整内容并适量留边。

已有宽高元数据用于首屏布局；缺少尺寸时先使用按图片类别设定的比例，加载后按实际尺寸调整。未知尺寸的图片加载时可能发生局部重排。无 JavaScript 时仍保留完整图片与可用的搜索表单。

## 验证

- Linux 构建机 localhost-1：21 个单元测试通过，类型检查与生产构建通过，12 个浏览器测试通过。
- 浏览器覆盖 1440 / 900 / 390 / 320px、原图比例、同排等高、横向溢出、单张筛选、Logo 横卡、搜索与作品跳转。
- 测试数据与后台编辑用例仅使用隔离 fixture 数据库。
- 预览验收部署于 H:\wg-manager-preview-20261019；后续用户授权的生产升级单独记录在 docs/production-release.md。

Windows 实际预览的 2 个只读布局测试、235 项路由检查和 330 张图片检查均通过；64 部作品、79 个版本与 64 份 metadata 全部保持不变。更新前后核对了生产配置 hash 和 8381 端口进程一致。

实际 Windows 预览验收日志在 reports/mixed-gallery-windows.log，摘要在 reports/mixed-gallery-acceptance.json。Linux 构建机截图在 reports/poster-catalog-1440.png、poster-catalog-390.png 与 poster-logo.png；Windows 实际预览截图保留于远程 reports/poster-qa/reports，回传中断产生的不完整文件已用完整 Linux 截图替换。
