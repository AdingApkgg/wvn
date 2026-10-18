#!/bin/sh
set -eu
cd /home/wvn/wg-manager-preview
hostname
export NODE_ENV=production
export WG_PORT=8281 WG_ADMIN_PORT=8282 WG_HOST=127.0.0.1
exec node --import tsx server.ts
