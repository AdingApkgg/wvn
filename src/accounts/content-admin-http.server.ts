import { moderationContract } from '../api/contracts/admin.ts';
import { registerJsonRoute } from '../api/route.server.ts';
import type { Hono } from 'hono';
import type { AccountService } from './service.server.ts';
import { AccountError } from './errors.server.ts';

// 仅挂到已验证管理员身份的路由后：旧私有监听器或站内后台管理员中间件。
export function mountContentAdmin(app: Hono, { db, content, config }: AccountService, prefix = "/api/share-admin/content") {
  if (!config.contentGate) return;
  const contract = moderationContract(prefix.replace(/\/content$/, ""));
  async function read(userId: string) {
    if (!await db.prepare('SELECT user_id FROM wg_account WHERE user_id=$1').get(userId)) throw new AccountError(404, 'NOT_FOUND');
    const data = await content.export(userId);
    return {
      userId, ...data,
      eligibility: data.eligibility ?? {
        status: 'unqualified', policyVersion: null, quizVersion: null,
        qualifiedAt: null, grantedBy: null, updatedAt: null,
      },
    };
  }
  registerJsonRoute(app, contract.contentAdminUser, async c =>
    c.json(await db.transaction(() => read(c.req.param('userId')!), { lock: 'wvn:account-write' })));
  registerJsonRoute(app, contract.contentAdminModerate, async c => {
    const body = await c.req.json().catch(() => { throw new AccountError(400, 'CONTENT_MODERATION_INVALID'); });
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'action') || !Object.hasOwn(body, 'reason') ||
      !['suspend', 'unsuspend', 'revoke', 'require_retest'].includes(body.action)) throw new AccountError(400, 'CONTENT_MODERATION_INVALID');
    const userId = c.req.param('userId')!;
    return c.json(await db.transaction(async () => {
      await content.moderate(userId, body.action, body.reason);
      return read(userId);
    }, { lock: 'wvn:account-write' }));
  }, {invalidCode:'CONTENT_MODERATION_INVALID'});
  registerJsonRoute(app, contract.contentAdminClassifyShare, async c => {
    const body = await c.req.json().catch(() => { throw new AccountError(400, 'CONTENT_SHARE_CLASSIFICATION_INVALID'); });
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 3 ||
      !Object.hasOwn(body, 'suitability') || !Object.hasOwn(body, 'revision') || !Object.hasOwn(body, 'reason'))
      throw new AccountError(400, 'CONTENT_SHARE_CLASSIFICATION_INVALID');
    return c.json(await content.classifyShare(c.req.param('id')!, body.suitability, body.revision, body.reason));
  }, {invalidCode:'CONTENT_SHARE_CLASSIFICATION_INVALID'});
}
