# 预览与未来切换的回滚边界

本次没有改 CaddyWG 配置、Cloudflare Tunnel、DNS、H:/wg 或任何原安装。关闭预览不需要生产回滚，原站仍使用 8212。

预览进程身份保存在独立目录 preview-process.json；只停止该启动记录的 cmd 父进程及确认为其子进程的 Node。不得按进程名批量结束 Node/Chrome。SSH 隧道关闭仅影响本机预览连接。浏览器验证只结束自有独立 profile 的浏览器。

SQLite 一致性备份：在管理写入暂停时使用 SQLite backup API / VACUUM INTO 新文件，或关闭预览后备份整个 state 目录；不能在活动 WAL 数据库只复制 catalog.db。备份应放私有目录，包含修改后的元数据、编号与历史路由。

用户批准生产切换前，先备份真实 Caddyfile、以一致性方式备份目录数据库、保存 79 条映射 dry-run、记录每个旧入口的执行/跳转策略。应用预览不得携带用户预览存档覆盖正式浏览器数据。正式切换后若失败，恢复已备份的 Caddyfile 和应用目录指针；不搬运、删除或覆盖 H:/wg，不清空浏览器 IndexedDB 或存档。

当前尚有 1 条无 VNDB 编号，保留待匹配。没有额外授权，不为其创建 Bangumi 数字 slug，也不把 Bangumi ID 充当 VNDB ID。
