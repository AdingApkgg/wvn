#!/bin/sh
# 只对全新的独立统计卷初始化，不触碰账号数据库或其他容器卷。
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv umami_password UMAMI_DB_PASSWORD
CREATE ROLE umami LOGIN PASSWORD :'umami_password';
CREATE DATABASE umami OWNER umami;
SQL
