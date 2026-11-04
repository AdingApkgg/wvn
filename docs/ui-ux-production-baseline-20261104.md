# UI/UX 开发采用的生产运行时基线

本轮在原生隔离工作树中从 `origin/main=087a0372321eac4b82ff00c41276917da91de97e` 开始。2026-11-04 核对生产发布 旧生产发布标记 的已发布源码清单，发现 Git 主线未包含若干既有运行时补丁。

这些补丁包括已发布的整包缓存、资源下载与读取、引擎适配、操作失效保护、outbox 修复和账号安全校验。本轮先从远程已发布 artifact 补齐非 build 源文件，按发布清单逐项核对 SHA-256，再单独提交作为开发基线。UI/UX 改动从该基线之后计算，不能把补齐的已有功能误记成本轮新开发或重新授权的架构变更。

来源为构建机 `build.example.test` 上 `/home/wvn/wvn-nsfw-release-20261104/artifact/`，清单为同目录上级 `artifact-proof.json`，其中 `preservesProductionR34=true`。本地完整比对回执保存在忽略的 `reports/ui-ux-20261104/production-artifact-proof.json` 与 `production-overlay-files.txt`，不含部署密钥或认证数据。

补齐只发生在本次隔离开发工作树。未写生产文件、业务数据库或原始 main，也未改变公开 CAS 正文传输、资源域名或缓存服务配置。远程验证使用 `/home/wvn/wvn-ui-ux-20261104/` 和独立 QA schema。

比对时发现发布 artifact 中账号与分享管理中间件仍是旧的 origin 比较，而主线已支持 TLS 代理后的 Host 比较。本次保留主线这两个文件，不导入旧版本。其余覆盖层逐文件匹配发布清单。ONS 的 CSP 断言随已发布的明确父 origin 行为更新，并验证 origin 随请求变化且没有通配放宽。
