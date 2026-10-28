@echo off
echo 历史 SQLite 启动入口已停用，请按 docs/platform-postgres.md 配置 PostgreSQL 并完成 Windows 实机验证。 1>&2
exit /b 1
rem 以下保留历史正文，仅供审查，禁止执行。
@echo off
cd /d H:\wg-manager-preview-20261019
set WG_DATABASE=H:\wg-manager-preview-20261019\state\catalog.db
set WG_RESOURCE_ROOT=H:\wg
set WG_STATE_DIR=H:\wg-manager-preview-20261019\state
set WG_PORT=8281
set WG_ADMIN_PORT=8282
set WG_HOST=127.0.0.1
set NODE_ENV=production
set PATH=C:\nvm4w\nodejs;%PATH%
"C:\nvm4w\nodejs\node.exe" --import tsx server.ts > preview.log 2> preview-error.log
