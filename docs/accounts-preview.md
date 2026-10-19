# WG Passkey 账号预览

实现位于独立账号服务，未切换生产。预览来源 `https://localhost:18283` 仅通过 SSH 转发访问；使用测试证书，预览 Passkey 不能迁往正式 RP。首版真实设备验收仍须用户在浏览器中完成系统认证器操作。

## 已实现范围

- Better Auth / Passkey 1.7.6：无密码注册、登录、服务端 UV 验证、多把密钥、改名、最后密钥保护。
- 持久会话、10 分钟敏感操作再认证、30 天闲置/90 天绝对期限、逐设备退出、账号 binding 与跨标签页隔离。
- 10 枚随机单次恢复码、受限恢复 Cookie、新密钥换绑、撤销旧密钥/会话；恢复完成后另一次正常 Passkey 登录建立普通会话。
- 独立 SQLite 私人书架、状态/笔记、最近版本与前台计时估算，同作品多窗口不重复累计。
- 手动文件备份：SHA256、大小/数量上限、预留配额、不可变历史、CAS、冲突保留、历史选择、下载校验、删除 generation 墓碑。
- IndexedDB transaction complete 后才显示本机已保留；断线副本绑定原账号，响应丢失同 capture 重试，不换号上传。
- 账号记录导出、账号删除、独立 fsync 删除台账；数据库与引用文件联合备份/新目录恢复工具。

**未放行：** 自动游戏存档捕获/导入、适配器应用 ACK 与设备基线、离线游玩时间补传、真实 ONS/Artemis 原生保存—重启—恢复—继续、Safari/iOS 与真实硬件 Passkey 跨设备验收。手动备份测试使用合成文件，不等于已验证全部游戏存档可读。播放器先由用户确认画面可用再记录前台时间；不能根据 iframe load 推断引擎 ready。长期设计仍在 spec 中，未实现的部分不能当作已交付。

## 远程目录与启动

构建机：`build.example.invalid`，预期 hostname=`localhost`；目录 `/home/wvn/wg-accounts-preview-20261019`。现有 WG 预览和 Windows 生产目录不受本脚本影响。

```sh
ssh build.example.invalid \
  'cd /home/wvn/wg-accounts-preview-20261019 && bash scripts/start-accounts-preview.sh'
ssh -N -f -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 127.0.0.1:18283:127.0.0.1:18283 build.example.invalid
```

入口：`https://localhost:18283/account`。测试证书仅用于此私有预览，需在浏览器中允许；不可据此配置正式 TLS。邀请码是远程 `state/accounts-preview/invite`，与生产及测试套件的邀请分开。密钥、邀请码和 TLS 私钥不进 Git；重启保留它们与 SQLite。

账号 API/页面只在独立来源挂载。游戏公共监听器拒绝 `/account` 和认证接口；不向游戏 iframe 发送玩家 Cookie、令牌或存档 API 权限。正式域名/RP ID 尚未启用，生产发布必须另行授权。

## 验证

```sh
# 以下命令只在远程目录执行
npm test
npm run typecheck
npm run build
bash scripts/test-accounts-remote.sh
WG_TEST_ROOT="$PWD" WG_TEST_PUBLIC_PORT=8391 WG_TEST_ADMIN_PORT=8392 \
  bash tests/e2e/run-remote.sh
```

浏览器用例中的 Chromium 虚拟认证器证明注册/登录/恢复 API 与页面协作；它不证明真实设备生物识别、系统同步或任意平台之间互通。测试套件使用独立 SQLite、独立 8393 HTTPS 端口、合成邀请码/凭据与文件，不操作玩家个人存档。

## 私有数据、配额与恢复

- 每账户引用文件及在途预留共 512 MiB；单次最多 64 MiB、512 文件、每文件 32 MiB。
- 文件存 Web 根之外；下载由所属账号鉴权。文件哈希只在同用户内去重。
- 写入与备份至少保留 60 GiB + 2 GiB 缓冲；触线拒绝新增写入，仍允许读取已有备份。
- 未引用文件从解除引用起至少 7 天后才可清理；服务每 6 小时执行有界数据库清理，不全盘扫描。
- 自动定时/异机灾难备份未配置。下列工具只执行显式操作，恢复到不存在的新目录，不覆写运行中的数据。

```sh
WG_ACCOUNT_DATABASE=/path/accounts.sqlite WG_ACCOUNT_BLOBS=/path/blobs \
WG_ACCOUNT_DELETION_LEDGER=/path/deletions.jsonl \
WG_ACCOUNT_BACKUP_DIR=/path/new-backup-directory npm run accounts:backup

WG_ACCOUNT_BACKUP_FROM=/path/backup-directory \
WG_ACCOUNT_DELETION_LEDGER=/path/current-live-deletions.jsonl \
WG_ACCOUNT_RESTORE_DIR=/path/new-restore-directory npm run accounts:restore
```

恢复时必须合并当前独立删除台账；不能只回滚旧 SQLite。恢复工具完成表示新目录 prepared，启动账号服务会重放台账；再验收账号隔离与存档字节。服务器密钥需另外妥善保管，不写进记录导出或下载包。记录导出 JSON 是书架/游玩/备份清单；存档原文件通过各历史项单独下载。

## 手动云备份的使用边界

先从游戏自己的界面导出文件，再在账号页选定**确切版本**上传。下载或设置“当前云端备份”只改变备份记录，不会修改游戏的浏览器空间。导入游戏前保留原档，并自行确认该版本兼容；未通过真实适配验收的引擎不会开放自动恢复。
