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
