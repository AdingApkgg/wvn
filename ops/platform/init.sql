-- 仅初始化新的平台库；已有生产库不通过重建容器或重新 seed 迁移。
CREATE SCHEMA catalog AUTHORIZATION wvn;
CREATE SCHEMA accounts AUTHORIZATION wvn;
CREATE SCHEMA resources AUTHORIZATION wvn;
