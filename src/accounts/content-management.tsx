import { useState } from 'react';
import type { EligibilityStatus } from '../content/types.ts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';

export type ContentAdminRequest = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Action = 'suspend' | 'unsuspend' | 'revoke' | 'require_retest';
type Suitability = 'sfw' | 'nsfw' | 'unknown';
type AccountContent = {
  userId: string;
  eligibility: { status: EligibilityStatus; policyVersion: string | null; qualifiedAt: number | null };
  audit: {
    action: string; reason: string; actor: string; createdAt: number;
    shareId?: string; suitability?: Suitability; metadataRevision?: number;
  }[];
};
const statuses: Record<EligibilityStatus, string> = {
  unqualified: '未取得资格', qualified: '已取得资格', suspended: '资格已暂停', needs_retest: '需要重新测试',
};
const actions: Record<Action, string> = {
  suspend: '暂停资格', unsuspend: '解除暂停并要求重测', revoke: '撤销资格', require_retest: '要求重新测试',
};
const suitabilityLabels: Record<Suitability, string> = { sfw: '适合公共展示（SFW）', nsfw: '敏感文案（NSFW）', unknown: '待核实' };

export function ContentManagement({ request }: { request: ContentAdminRequest }) {
  const [userId, setUserId] = useState('');
  const [account, setAccount] = useState<AccountContent | null>(null);
  const [action, setAction] = useState<Action>('suspend');
  const [accountReason, setAccountReason] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [shareId, setShareId] = useState('');
  const [revision, setRevision] = useState('');
  const [suitability, setSuitability] = useState<Suitability>('unknown');
  const [shareReason, setShareReason] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>, report: (message: string) => void) {
    setBusy(true);
    report('');
    try { await task(); }
    catch (error) { report(error instanceof Error ? error.message : '操作未完成，输入已保留。'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="敏感内容管理" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle><h2>账号浏览资格</h2></CardTitle>
          <CardDescription>按账号标识查询资格和审计。解除暂停后仍须重新测试，不会恢复旧会话的显示开关。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="space-y-2" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              const data = await request<AccountContent>('content/users/' + encodeURIComponent(userId.trim()));
              setAccount(data);
              setAction(data.eligibility.status === 'suspended' ? 'unsuspend' : 'suspend');
            }, setAccountMessage);
          }}>
            <Label htmlFor="content-admin-user">账号标识</Label>
            <Input id="content-admin-user" value={userId} required disabled={busy} autoComplete="off" onChange={event => {
              setUserId(event.target.value); setAccount(null); setAccountReason(''); setAccountMessage('');
            }} />
            <Button variant="outline" type="submit" disabled={busy || !userId.trim()}>查询账号资格</Button>
          </form>
          {account && <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-1 text-sm">
              <p className="break-all">账号：{account.userId}</p>
              <p>当前状态：{statuses[account.eligibility.status]}</p>
              {account.eligibility.policyVersion && <p>通过规则版本：{account.eligibility.policyVersion}</p>}
              {account.eligibility.qualifiedAt !== null && <p>通过时间：{new Date(account.eligibility.qualifiedAt).toLocaleString()}</p>}
            </div>
            <form className="space-y-3" onSubmit={event => {
              event.preventDefault();
              void run(async () => {
                const data = await request<AccountContent>('content/users/' + encodeURIComponent(account.userId) + '/moderate', 'POST', {
                  action, reason: accountReason,
                });
                setAccount(data);
                setAction(data.eligibility.status === 'suspended' ? 'unsuspend' : 'suspend');
                setAccountMessage('账号资格已更新。');
              }, setAccountMessage);
            }}>
              <div className="space-y-2">
                <Label htmlFor="content-admin-action">资格操作</Label>
                <NativeSelect id="content-admin-action" value={action} disabled={busy} onChange={event => setAction(event.target.value as Action)}>
                  {(Object.entries(actions) as [Action, string][]).map(([value, label]) =>
                    <NativeSelectOption key={value} value={value} disabled={value === 'unsuspend' ? account.eligibility.status !== 'suspended'
                      : account.eligibility.status === 'suspended' && value !== 'suspend'}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content-admin-account-reason">资格操作理由</Label>
                <Input id="content-admin-account-reason" required maxLength={1000} value={accountReason} disabled={busy}
                  onChange={event => setAccountReason(event.target.value)} />
              </div>
              <Button type="submit" disabled={busy || !accountReason.trim()}>执行资格操作</Button>
            </form>
            <section className="space-y-2" aria-label="账号资格审计">
              <h3 className="font-medium">最近审计记录</h3>
              {!account.audit.length ? <p className="text-sm text-muted-foreground">暂无管理操作记录。</p> :
                <ul className="space-y-2 text-sm">{account.audit.slice(-20).reverse().map((entry, index) =>
                  <li key={`${entry.createdAt}-${index}`} className="rounded-lg border p-3 space-y-1">
                    <p>{entry.action === 'classify_share' ? '分享文案分级' : actions[entry.action as Action] ?? entry.action}
                      {' · '}{new Date(entry.createdAt).toLocaleString()}</p>
                    {entry.shareId && <p className="break-all">分享：{entry.shareId}
                      {entry.suitability && ` · ${suitabilityLabels[entry.suitability]} · 文案修订 ${entry.metadataRevision}`}</p>}
                    <p className="whitespace-pre-wrap break-words">{entry.reason}</p>
                    <p className="text-muted-foreground">执行者：{entry.actor === 'private-admin' ? '私有管理员' : entry.actor}</p>
                  </li>)}</ul>}
            </section>
          </div>}
          {accountMessage && <p role="status" aria-live="polite">{accountMessage}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle><h2>分享文案分级</h2></CardTitle>
          <CardDescription>公开分享须先批准当前文案，再独立分级。存在待发布文案时请先完成发布审核；作者修改后旧审核自动失效。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={event => {
            event.preventDefault();
            const metadataRevision = Number(revision);
            if (!Number.isSafeInteger(metadataRevision) || metadataRevision < 1) { setShareMessage('请填写有效的正整数文案修订号。'); return; }
            void run(async () => {
              const result = await request<{ id: string; suitability: Suitability; revision: number }>(
                'content/shares/' + encodeURIComponent(shareId.trim()), 'PATCH', { suitability, revision: metadataRevision, reason: shareReason });
              setShareMessage(`分享文案分级已保存：${suitabilityLabels[result.suitability]}，文案修订 ${result.revision}。`);
            }, setShareMessage);
          }}>
            <div className="space-y-2">
              <Label htmlFor="content-admin-share">分享标识</Label>
              <Input id="content-admin-share" required disabled={busy} value={shareId} autoComplete="off"
                onChange={event => { setShareId(event.target.value); setShareMessage(''); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-admin-share-revision">文案修订号</Label>
              <Input id="content-admin-share-revision" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1}
                required disabled={busy} value={revision} onChange={event => { setRevision(event.target.value); setShareMessage(''); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-admin-share-suitability">文案分级</Label>
              <NativeSelect id="content-admin-share-suitability" value={suitability} disabled={busy}
                onChange={event => { setSuitability(event.target.value as Suitability); setShareMessage(''); }}>
                {(Object.entries(suitabilityLabels) as [Suitability, string][]).map(([value, label]) =>
                  <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-admin-share-reason">文案审核理由</Label>
              <Input id="content-admin-share-reason" required maxLength={1000} value={shareReason} disabled={busy}
                onChange={event => { setShareReason(event.target.value); setShareMessage(''); }} />
            </div>
            <Button type="submit" disabled={busy || !shareId.trim() || !revision || !shareReason.trim()}>保存文案分级</Button>
            {shareMessage && <p role="status" aria-live="polite">{shareMessage}</p>}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
