import { accountContract } from "../api/contracts/account.ts";
import { registerJsonRoute } from "../api/route.server.ts";
import type { AccountService } from './service.server.ts';
import { AccountError } from './errors.server.ts';

export function mountContent({ app, player, content, config }: AccountService) {
  if (!config.contentGate) return;
  registerJsonRoute(app, accountContract.contentGet, async c => {
    const { session } = await player(c);
    return c.json(await content.getAccess(session.user.id, session.session.id));
  });
  registerJsonRoute(app, accountContract.contentAttemptCreate, async c => {
    const { session } = await player(c);
    return c.json(await content.createAttempt(session.user.id, session.session.id));
  });
  registerJsonRoute(app, accountContract.contentAttemptSubmit, async c => {
    const { session } = await player(c);
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'answers')) throw new AccountError(400, 'CONTENT_ANSWERS_INVALID');
    return c.json(await content.submitAttempt(session.user.id, session.session.id, c.req.param('id')!, body.answers));
  }, { invalidCode: "CONTENT_ANSWERS_INVALID" });
  registerJsonRoute(app, accountContract.contentModeSet, async c => {
    const { session } = await player(c);
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'mode') || !['public', 'restricted'].includes(body.mode)) throw new AccountError(400, 'CONTENT_MODE_INVALID');
    return c.json(await content.setMode(session.user.id, session.session.id, body.mode));
  }, { invalidCode: "CONTENT_MODE_INVALID" });
}
