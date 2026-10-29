# B2 CAS 精确版本清理

脚本 `scripts/migration/b2-cas-cleanup.py` 的默认工作是 `plan`，只读输入、写入新的私有 SQLite 计划，不发送删除。固定桶为 `web-visual-novel`，namespace 为 `b2/web-visual-novel/snapshot-20261028`。禁止 CAS key、删除标记、裸 key 删除、生命周期修改和映射库修改。

```sh
python3 b2-cas-cleanup.py plan --frozen resources.sqlite --inventory inventory.sqlite --enrichment enrichment.json --output plan.sqlite
```

版本清单必须包含 `meta.complete=1`。计划逐条核对冻结源的版本 ID、名称、大小、已核验状态，以及冻结 CAS 的版本 ID、名称、大小、SHA-1 和最新版本身份。未知历史版本只有在 enrichment 的同路径 SHA-256、精确源 ID、SHA-1、大小及已知目标身份全部一致时才纳入。其余未知版本写入 `blockers`，不猜测可删除性。输入必须是主流程已完成只读审计、保持冻结的可信私有证据；enrichment 的摘要会绑定计划，不替代证据来源审计。

默认未知锁状态阻断。主流程明确选择 `--allow-server-enforced-lock-check` 后，允许在锁字段无权读取时发送普通精确版本删除；该选择和 `unknown_lock_versions` 数量保存在计划 `meta`。已知保留期、legal hold 或 SSE-C 仍阻断；永远不发送 `BypassGovernanceRetention` 或修改锁。权限不足由服务端拒绝，拒绝项保留并停止。此选项不能证明锁禁用，也不是绕过保护。

计划包含 `meta`（输入摘要、namespace、计数、字节数、锁策略）、`targets`（完整 CAS 版本映射）、`candidates`（序号、精确 ID、key、大小及目标身份）和 `blockers`（ID、key、原因）。创建后以 0400 保存，拒绝覆盖。标准输出 JSON 包含上述摘要、`plan_sha256`、`count`、`bytes`、`blockers`、`deleteCalls:0`；异常只输出类型，避免泄漏带签名 URL 或凭据。SQLite 输入和 enrichment 不会改写。

主流程完成所有验收后签发私有 JSON 凭据，至少包括以下字段；摘要由主流程从可信记录传入，不由脚本自动生成或自动批准：

```json
{
  "accepted": true,
  "issued_by": "主流程身份",
  "worker_revision": "实际已验收版本",
  "api_revision": "实际已验收版本",
  "bucket": "web-visual-novel",
  "namespace": "b2/web-visual-novel/snapshot-20261028",
  "frozen_sha256": "冻结库文件摘要",
  "inventory_sha256": "完整版本清单文件摘要",
  "plan_sha256": "计划文件摘要",
  "gates": {"api":true,"worker":true,"browser":true,"cas_uncached":true,"range":true,"reentry":true}
}
```

凭据是由可信主流程签发并通过 CLI 独立提供 SHA-256 的审批记录，不是公钥签名系统。凭据、配置和检查点必须保存在仅当前操作者可读写的位置。任何 blockers 都禁止 apply。主流程负责冻结证据之后的发布身份和生产变更窗口，若发现新增版本或目标变更应停止并重新审计。

下面命令只由主流程在验收和条件授权满足后执行，本任务未执行：

```sh
python3 b2-cas-cleanup.py apply --plan plan.sqlite --checkpoint checkpoint.sqlite --receipt acceptance.json --receipt-sha256 '<可信凭据摘要>' --config /root/wvn-b2-cas-20261028/private/rclone.conf
```

凭据校验先于客户端授权和所有删除。凭据绑定计划文件与冻结库/清单摘要、namespace、Worker/API 版本和各项验收。检查点独立保存 `done` 和 `pending`，绑定计划摘要；不改计划。每批最多 1000 项，始终使用 `Key` 与 `VersionId`、`Quiet:false`。SDK 请求自动重试禁用。成功响应只有 key 和版本 ID 同时匹配、且非删除标记才记完成。

崩溃、超时、遗漏或部分失败时，只对不确定 ID 使用 Native `b2_get_file_info`：只有 HTTP 404 且 `file_not_present` 视为不存在；200 视为仍存在，其他错误视为未知。先持久化 pending 再发送，成功后再提交 done；重启先核对 pending，禁止直接重发未知请求。部分结果核对完成后仍停止，由操作者复核再续跑；尚存在的失败项在下一次运行重试。完整成功批次无需逐对象 HEAD，约 142 万条只需要约 1421 次顺序删除请求；内存仅保存当前批和少量补充证据。完成输出 `done`、`planned`，真实生产结束后还需主流程独立只读验收。

远程超过 30 秒的 plan/apply 都用独立 tmux 持久化任务，记录主机、脚本、日志和退出码；先核对原任务再续跑。密钥只在原 VPS 读取，不打印或转存。

官方语义依据：[Backblaze S3 Delete Objects](https://www.backblaze.com/apidocs/s3-delete-objects) 支持指定版本；[Amazon DeleteObjects](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html) 规定每次最多 1000 项并逐项返回结果。采用 boto3 负责 SigV4 与请求校验，不自行拼接签名请求。

先执行已验收清单中的 10 条可使用 `apply` 同样的必填参数，加 `--batch-size 10 --limit 10`。复核后使用相同 `--checkpoint` 去掉这两个选项续跑。`--batch-size` 为 1–1000，默认 1000；`--limit` 是本次最多尝试的条数，默认无上限，0 表示不发送删除。两者不改变计划或验收摘要。成功批次输出 `{"status":"progress","attempted":本次累计条数,"last_seq":计划末序号,"batch":本批条数}`，检查点的 `done` 是跨次累计结果。由于恢复会跳过已完成项，`last_seq` 可以跨越已完成序号。

`plan` 成功输出字段为 `schema`、`allow_server_enforced_lock_check`、`unknown_lock_versions`、`bucket`、`namespace`、`frozen_sha256`、`inventory_sha256`、`enrichment_sha256`、`snapshot_inventory_sha256`、`count`、`bytes`、`blockers`、`plan_sha256`、`deleteCalls`。除 `deleteCalls` 为数值 0 外，这些字段均为字符串；摘要是小写 SHA-256。`unknown_lock_versions` 保守统计无法经对象或桶证据证明解除保护的非 CAS 版本数，其中可能包括已知锁定项；是否允许尝试由策略字段决定，已知锁定项始终另列 blockers。`apply` 最终输出 `done`、`planned` 两个整数；错误输出 `status:"blocked"` 和 `error_type`，退出码 1，详细阻断原因通过只读查询计划 `blockers` 定位。
