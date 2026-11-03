import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAccountService, testDatabaseSchema } from './helpers/accounts.ts';
import { createAccountService as createService } from '../src/accounts/service.server.ts';
import { registrationFixture } from './helpers/webauthn.ts';
import type { QuizAttempt } from '../src/content/types.ts';
import { createShareAdminApp } from '../src/accounts/share-admin.server.ts';
import { sharingFixture } from './helpers/sharing.ts';

const origin = 'https://accounts.wg.test';
const DAY = 86_400_000;
const correct: Record<string, string> = {
  'version-content': 'specific-version',
  'fiction-boundaries': 'respect-consent',
  'public-sharing': 'follow-public-rules',
  'stop-reading': 'stop-and-report',
  'account-sharing': 'keep-account-private',
  'display-preference': 'respect-choice',
  'spoiler-separate': 'separate-settings',
  'report-content': 'report-entry',
  'session-mode': 'enable-each-session',
  'qualification-scope': 'site-rules-only',
  'unknown-version': 'wait-for-review',
  'public-mode-data': 'preserve-saves',
};
function answers(attempt: QuizAttempt, pass = true) {
  return Object.fromEntries(attempt.questions.map((question, index) => [
    question.id,
    !pass && index === 0
      ? question.choices.find(choice => choice.id !== correct[question.id])!.id
      : correct[question.id],
  ]));
}
async function fixture(catalog:import('../src/accounts/library.server.ts').CatalogItem[] = []) {
  let now = Date.now();
  let policyVersion = '2026-11-04-v1';
  const config = {
    origin, database: ':memory:',catalog,
    secret: 'synthetic-content-test-secret-with-at-least-48-characters',
    contentGate: true,
    content: { now: () => now, policyVersion: () => policyVersion },
  };
  const service = await createAccountService(config);
  async function register(name = '规则阅读者') {
    const options = await service.app.request(origin + '/api/auth/passkey/generate-register-options?context=' +
      encodeURIComponent(JSON.stringify({ nickname: name })));
    const data = await options.json();
    const response = await service.app.request(origin + '/api/auth/passkey/verify-registration', {
      method: 'POST', headers: {
        origin, 'content-type': 'application/json',
        cookie: options.headers.getSetCookie().map(value => value.split(';')[0]).join('; '),
      },
      body: JSON.stringify({ response: registrationFixture(data.challenge, origin, true), createSession: true }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const meResponse = await service.app.request(origin + '/api/me', { headers: { cookie } });
    const me = await meResponse.json();
    return { cookie, userId: me.user.id as string, sessionId: me.binding.split(':')[0] as string, binding: me.binding as string };
  }
  const user = await register();
  const api = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    service.app.request(origin + path, {
      method, headers: { origin, cookie: user.cookie, 'x-wg-binding': user.binding, 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    service, config, user, api, register,
    advance(milliseconds: number) { now += milliseconds; },
    version(value: string) { policyVersion = value; },
    time() { return now; },
    async secondSession() {
      const id = randomUUID();
      await service.db.prepare(`INSERT INTO session(id,"userId",token,"expiresAt","createdAt","updatedAt")
        VALUES($1,$2,$3,$4,now(),now())`).run(id, user.userId, randomUUID(), new Date(now + 60 * DAY));
      return id;
    },
  };
}
test('个人隐藏目录只取当前用户记录，并解码RenPy隔离存档版本',async()=>{
 const f=await fixture([{id:'v4',title:'私人作品',url:'/4/',versions:[{id:'private-version',number:1,title:'版本',engine:'RenPy',url:'/4/1/'}]}]);
 try{
  await f.service.db.prepare('INSERT INTO wg_save_profiles(id,owner,version_id,generation,created) VALUES($1,$2,$3,1,$4)').run(randomUUID(),f.user.userId,JSON.stringify(['wvn-engine-cloud-v2','private-version','renpy-'+'a'.repeat(64)]),Date.now());
  assert.deepEqual([...await f.service.getContentOwnWorkIds(new Request(origin+'/api/account-catalog',{headers:{cookie:f.user.cookie}}))],['v4']);
  assert.equal((await f.service.getContentOwnWorkIds(new Request(origin+'/api/account-catalog'))).size,0);
 }finally{await f.service.close()}
});

async function shareClassificationFixture() {
  const shares = await sharingFixture();
  const service = await createService({
    origin, database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(shares.db),
    secret: 'synthetic-share-content-secret-with-at-least-48-characters', contentGate: true,
  });
  return { ...shares, service, async close() { await service.close(); await shares.close(); } };
}

test('真实会话取得八题且包含四道核心题，HTTP 不泄露判分答案', async () => {
  const f = await fixture();
  try {
    const response = await f.api('/api/me/content/attempts', 'POST', {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const attempt: QuizAttempt = await response.json();
    assert.deepEqual(Object.keys(attempt).sort(), ['expiresAt', 'id', 'policyVersion', 'questions', 'quizVersion']);
    assert.equal(attempt.questions.length, 8);
    assert.equal(new Set(attempt.questions.map(question => question.id)).size, 8);
    for (const id of ['version-content', 'fiction-boundaries', 'public-sharing', 'stop-reading'])
      assert.ok(attempt.questions.some(question => question.id === id));
    for (const question of attempt.questions) {
      assert.deepEqual(Object.keys(question).sort(), ['choices', 'id', 'text']);
      assert.ok(question.choices.some(choice => choice.id === correct[question.id]));
      for (const choice of question.choices) assert.deepEqual(Object.keys(choice).sort(), ['id', 'text']);
    }
    assert.equal(attempt.expiresAt, f.time() + DAY);
    const repeated = await f.api('/api/me/content/attempts', 'POST', {});
    assert.deepEqual(await repeated.json(), attempt);
  } finally { await f.service.close(); }
});

test('八题全部正确才授予账号资格，需主动开启且各认证会话独立', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    const result = await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt));
    assert.equal(result.passed, true);
    assert.equal(result.access.eligibility, 'qualified');
    assert.equal(result.access.displayMode, 'public');
    assert.equal(result.access.canViewRestricted, false);
    const settled = await f.service.db.prepare('SELECT questions,result FROM wg_content_attempts WHERE id=$1').get(attempt.id);
    assert.equal(settled?.questions, null);
    assert.equal(JSON.stringify(settled?.result).includes('answers'), false);
    const enabled = await f.api('/api/me/content/mode', 'PATCH', { mode: 'restricted' });
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json()).canViewRestricted, true);
    assert.equal((await f.api('/api/me/content')).status, 200);
    const secondSession = await f.secondSession();
    const second = await f.service.content.getAccess(f.user.userId, secondSession);
    assert.equal(second.eligibility, 'qualified');
    assert.equal(second.displayMode, 'public');
    assert.equal(second.canViewRestricted, false);
    const current = await f.service.getContentAccess(new Request(origin + '/api/me/content', { headers: { cookie: f.user.cookie } }));
    assert.equal(current.canViewRestricted, true);
    const anonymous = await f.service.getContentAccess(new Request(origin + '/api/me/content'));
    assert.equal(anonymous.authenticated, false);
    assert.equal(anonymous.canViewRestricted, false);
  } finally { await f.service.close(); }
});

test('失败后冷却三十分钟，账号滚动二十四小时最多三次提交且重登不重置', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const anonymous = await f.service.app.request(origin + '/api/me/content');
    assert.equal(anonymous.status, 401);
    const firstTime = f.time();
    for (let i = 0; i < 3; i++) {
      const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
      const result = await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt, false));
      assert.equal(result.passed, false);
      assert.equal(result.incorrect.length, 1);
      assert.ok(result.incorrect[0].explanation.length > 10);
      assert.equal(result.access.attemptsRemaining, 2 - i);
      assert.equal(result.access.nextAttemptAt, i === 2 ? firstTime + DAY : f.time() + 30 * 60_000);
      await assert.rejects(f.service.content.createAttempt(f.user.userId, await f.secondSession()), { code: 'CONTENT_RETRY_LATER' });
      f.advance(30 * 60_000);
    }
    await assert.rejects(f.service.content.createAttempt(f.user.userId, f.user.sessionId), { code: 'CONTENT_RETRY_LATER' });
    f.advance(DAY - 90 * 60_000);
    const next = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    assert.ok(next.id);
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).attemptsRemaining, 1);
  } finally { await f.service.close(); }
});

test('过期、旧规则、跨账号、无效会话和错误选项提交均不消耗答题次数', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    const other = await f.register('另一个阅读者');
    await assert.rejects(f.service.content.submitAttempt(other.userId, other.sessionId, attempt.id, answers(attempt)), { code: 'CONTENT_ATTEMPT_NOT_FOUND' });
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, 'revoked-session', attempt.id, answers(attempt)), { code: 'SIGN_IN_REQUIRED' });
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, {}), { code: 'CONTENT_ANSWERS_INVALID' });
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, { ...answers(attempt), extra: 'forged' }), { code: 'CONTENT_ANSWERS_INVALID' });
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).attemptsRemaining, 3);
    f.version('2026-11-05-v2');
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt)), { code: 'CONTENT_POLICY_CHANGED' });
    const current = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    assert.notEqual(current.id, attempt.id);
    f.advance(DAY);
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, f.user.sessionId, current.id, answers(current)), { code: 'CONTENT_ATTEMPT_EXPIRED' });
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).attemptsRemaining, 3);
    assert.notEqual((await f.service.content.createAttempt(f.user.userId, f.user.sessionId)).id, current.id);
  } finally { await f.service.close(); }
});

test('两个服务实例并发创建只有一个尝试，并发重复提交只结算一次且保留原结果', async () => {
  const f = await fixture();
  const second = await createService({ ...f.config, database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: f.service.config.databaseSchema });
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const stores = [f.service.content, second.content];
    const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => stores[index % 2].createAttempt(f.user.userId, f.user.sessionId)));
    assert.equal(new Set(attempts.map(attempt => attempt.id)).size, 1);
    const attempt = attempts[0];
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => stores[index % 2].submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt, false))));
    for (const result of results) assert.deepEqual(result, results[0]);
    assert.equal(results[0].access.attemptsRemaining, 2);
    assert.equal((await f.service.db.prepare('SELECT count(*) AS n FROM wg_content_attempts WHERE user_id=$1 AND submitted_at IS NOT NULL').get(f.user.userId))?.n, 1);
    const retryWithDifferentAnswers = await second.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt));
    assert.equal(retryWithDifferentAnswers.passed, false);
    assert.equal((await second.content.getAccess(f.user.userId, f.user.sessionId)).eligibility, 'unqualified');
  } finally { await second.close(); await f.service.close(); }
});

test('暂停与撤销优先于旧尝试、并发通过及旧会话，解除暂停不会恢复旧开关', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.moderate(f.user.userId, 'suspend', '违反公开区域内容规则');
    await assert.rejects(f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt)), { code: 'CONTENT_SUSPENDED' });
    await assert.rejects(f.service.content.createAttempt(f.user.userId, f.user.sessionId), { code: 'CONTENT_SUSPENDED' });
    await f.service.content.moderate(f.user.userId, 'unsuspend', '复核后允许重新测试');
    const replacement = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    assert.notEqual(replacement.id, attempt.id);
    await Promise.all([
      f.service.content.submitAttempt(f.user.userId, f.user.sessionId, replacement.id, answers(replacement)),
      f.service.content.moderate(f.user.userId, 'suspend', '并发复核暂停'),
    ].map(promise => promise.catch(error => error)));
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).eligibility, 'suspended');
    await f.service.content.moderate(f.user.userId, 'unsuspend', '允许重新测试');
    const fresh = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, fresh.id, answers(fresh));
    await f.service.content.setMode(f.user.userId, f.user.sessionId, 'restricted');
    await f.service.content.moderate(f.user.userId, 'revoke', '需要撤销现有资格');
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).canViewRestricted, false);
    await assert.rejects(f.service.content.setMode(f.user.userId, f.user.sessionId, 'restricted'), { code: 'CONTENT_UNQUALIFIED' });
    f.version('2026-11-05-v2');
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).displayMode, 'public');
  } finally { await f.service.close(); }
});

test('旧规则资格需重测且规则更新后不复用旧会话模式', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt));
    await f.service.content.setMode(f.user.userId, f.user.sessionId, 'restricted');
    f.version('2026-11-05-v2');
    const access = await f.service.content.getAccess(f.user.userId, f.user.sessionId);
    assert.equal(access.eligibility, 'needs_retest');
    assert.equal(access.canViewRestricted, false);
    const fresh = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, fresh.id, answers(fresh));
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).displayMode, 'public');
  } finally { await f.service.close(); }
});

test('HTTP 写接口验证来源和 binding，公共模式可关闭，导出和删除包含资格且清除全部明细', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    assert.equal((await f.api('/api/me/content/attempts', 'POST', {}, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await f.api('/api/me/content/attempts', 'POST', {}, { 'x-wg-binding': 'stale' })).status, 409);
    assert.equal((await f.api('/api/me/content/mode', 'PATCH', { mode: 'restricted' })).status, 403);
    assert.equal((await f.api('/api/me/content/mode', 'PATCH', { mode: 'public' })).status, 200);
    const attemptResponse = await f.api('/api/me/content/attempts', 'POST', {});
    const attempt: QuizAttempt = await attemptResponse.json();
    const submitted = await f.api(`/api/me/content/attempts/${attempt.id}/submit`, 'POST', { answers: answers(attempt) });
    assert.equal(submitted.status, 200);
    await f.api('/api/me/content/mode', 'PATCH', { mode: 'restricted' });
    const exported = await f.api('/api/me/export');
    assert.equal(exported.status, 200);
    const data = await exported.json();
    assert.equal(data.content.eligibility.status, 'qualified');
    assert.equal(data.content.attempts.length, 1);
    assert.equal(JSON.stringify(data.content).includes('questions'), false);
    assert.equal(JSON.stringify(data.content).includes('answers'), false);
    const deleted = await f.api('/api/me', 'DELETE', { confirmation: 'DELETE' });
    assert.equal(deleted.status, 200);
    for (const table of ['wg_content_eligibility', 'wg_content_attempts', 'wg_content_session_modes', 'wg_content_audit'])
      assert.equal((await f.service.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=$1`).get(f.user.userId))?.n, 0);
    assert.equal((await f.api('/api/me/content')).status, 401);
  } finally { await f.service.close(); }
});

test('已结算测试明细三十天后清理，长期资格依据仍保留', async () => {
  const f = await fixture();
  try {
    assert.ok(f.service.content, '账号服务应暴露内容资格仓储');
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt));
    const laterSession = await f.secondSession();
    f.advance(31 * DAY);
    await f.service.content.gc();
    assert.equal((await f.service.db.prepare('SELECT count(*) AS n FROM wg_content_attempts WHERE user_id=$1').get(f.user.userId))?.n, 0);
    assert.equal((await f.service.content.getAccess(f.user.userId, laterSession)).eligibility, 'qualified');
    assert.equal((await f.service.content.export(f.user.userId)).eligibility?.policyVersion, '2026-11-04-v1');
  } finally { await f.service.close(); }
});

test('资格管理只在独立管理员认证边界开放，暂停立即阻止旧会话并留下理由审计', async () => {
  const f = await fixture();
  const adminOrigin = 'https://localhost:18285';
  const { app } = createShareAdminApp(f.service, adminOrigin, 'synthetic-content-admin-invite');
  const path = `/api/share-admin/content/users/${f.user.userId}`;
  try {
    const attempt = await f.service.content.createAttempt(f.user.userId, f.user.sessionId);
    await f.service.content.submitAttempt(f.user.userId, f.user.sessionId, attempt.id, answers(attempt));
    await f.service.content.setMode(f.user.userId, f.user.sessionId, 'restricted');
    assert.equal((await app.request(adminOrigin + path)).status, 401);
    assert.equal((await app.request(adminOrigin + '/api/share-admin/content/users/login')).status, 401);
    assert.equal((await app.request(adminOrigin + path, { headers: { cookie: f.user.cookie } })).status, 401);
    const login = await app.request(adminOrigin + '/api/share-admin/login', {
      method: 'POST', headers: { origin: adminOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'synthetic-content-admin-invite' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const state = await app.request(adminOrigin + path, { headers: { cookie } });
    assert.equal(state.status, 200);
    assert.equal(state.headers.get('cache-control'), 'private, no-store');
    const before = await state.json();
    assert.equal(before.userId, f.user.userId);
    assert.equal(before.eligibility.status, 'qualified');
    assert.equal(JSON.stringify(before).includes('correctChoiceId'), false);
    assert.equal((await f.service.app.request(origin + path, { headers: { cookie } })).status, 404);
    const rejected = await app.request(adminOrigin + path + '/moderate', {
      method: 'POST', headers: { origin: 'https://evil.invalid', cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'suspend', reason: '不应接受的来源' }),
    });
    assert.equal(rejected.status, 403);
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).canViewRestricted, true);
    const suspended = await app.request(adminOrigin + path + '/moderate', {
      method: 'POST', headers: { origin: adminOrigin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'suspend', reason: '  公共区域内容违规复核  ' }),
    });
    assert.equal(suspended.status, 200);
    const after = await suspended.json();
    assert.equal(after.eligibility.status, 'suspended');
    assert.equal(after.audit.length, 1);
    assert.equal(after.audit[0].reason, '公共区域内容违规复核');
    assert.equal(after.audit[0].actor, 'private-admin');
    assert.equal((await f.service.content.getAccess(f.user.userId, f.user.sessionId)).canViewRestricted, false);
    await assert.rejects(f.service.content.createAttempt(f.user.userId, f.user.sessionId), { code: 'CONTENT_SUSPENDED' });
  } finally { await f.service.close(); }
});

test('私有资格管理严格校验动作和理由，解除暂停只允许重测，未知账号返回404', async () => {
  const f = await fixture();
  const adminOrigin = 'https://localhost:18285';
  const { app } = createShareAdminApp(f.service, adminOrigin, 'synthetic-content-admin-validation');
  const path = `/api/share-admin/content/users/${f.user.userId}`;
  try {
    const login = await app.request(adminOrigin + '/api/share-admin/login', {
      method: 'POST', headers: { origin: adminOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'synthetic-content-admin-validation' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const moderate = (body: unknown, target = path) => app.request(adminOrigin + target + '/moderate', {
      method: 'POST', headers: { origin: adminOrigin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    for (const body of [
      { action: 'qualify', reason: '不能直接授予资格' },
      { action: 'suspend', reason: '' },
      { action: 'suspend', reason: '   ' },
      { action: 'suspend', reason: '理由\n夹带控制字符' },
      { action: 'suspend', reason: '长'.repeat(1001) },
      { action: 'suspend', reason: '复核', actor: 'forged-admin' },
      { action: 'suspend', reason: 123 },
      null,
    ]) {
      const response = await moderate(body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'CONTENT_MODERATION_INVALID');
    }
    const initial = await app.request(adminOrigin + path, { headers: { cookie } });
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).eligibility.status, 'unqualified');
    assert.equal((await moderate({ action: 'suspend', reason: '不存在的账号' }, '/api/share-admin/content/users/unknown-user')).status, 404);
    assert.equal((await app.request(adminOrigin + '/api/share-admin/content/users/unknown-user', { headers: { cookie } })).status, 404);
    assert.equal((await moderate({ action: 'suspend', reason: '复核暂停' })).status, 200);
    const unsuspended = await moderate({ action: 'unsuspend', reason: '已完成复核，可重新测试' });
    assert.equal(unsuspended.status, 200);
    assert.equal((await unsuspended.json()).eligibility.status, 'needs_retest');
    await assert.rejects(f.service.content.setMode(f.user.userId, f.user.sessionId, 'restricted'), { code: 'CONTENT_RETEST_REQUIRED' });
    const revoked = await moderate({ action: 'revoke', reason: '撤销现有资格' });
    assert.equal((await revoked.json()).eligibility.status, 'unqualified');
    const retest = await moderate({ action: 'require_retest', reason: '要求重新理解规则' });
    assert.equal((await retest.json()).eligibility.status, 'needs_retest');
    assert.equal((await f.service.content.export(f.user.userId)).audit.length, 4);
  } finally { await f.service.close(); }
});

test('分享文案默认待核实，独立审核绑定真实文案修订，用户编辑和并发编辑使旧审核失效', async () => {
  const f = await shareClassificationFixture();
  try {
    const made = await f.shares.create('alice', f.input);
    assert.equal(typeof f.service.content.shareSuitability, 'function', '账号内容仓储应提供分享文案分级');
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    assert.equal(await f.service.content.shareSuitability('missing-share'), 'unknown');
    await f.service.content.classifyShare(made.id, 'sfw', 1, '已核实标题和说明适合公共展示');
    assert.equal(await f.service.content.shareSuitability(made.id), 'sfw');
    await f.shares.edit('alice', made.id, 1, { title: '修改后的标题', description: '新的说明', progress: 'complete', spoiler: false });
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await assert.rejects(f.service.content.classifyShare(made.id, 'nsfw', 1, '基于旧修订的审核'), { code: 'CONTENT_CONFLICT' });
    await f.service.content.classifyShare(made.id, 'nsfw', 2, '已复核新版文案包含敏感内容');
    assert.equal(await f.service.content.shareSuitability(made.id), 'nsfw');
    const concurrent = await Promise.allSettled([
      f.service.content.classifyShare(made.id, 'sfw', 2, '并发审核旧版文案'),
      f.shares.edit('alice', made.id, 2, { title: '再次更新标题', description: '再次更新说明', progress: 'complete', spoiler: false }),
    ]);
    assert.equal(concurrent[1].status, 'fulfilled');
    if (concurrent[0].status === 'rejected') assert.equal(concurrent[0].reason.code, 'CONTENT_CONFLICT');
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await assert.rejects(f.service.content.classifyShare('missing-share', 'sfw', 1, '不存在的分享'), { code: 'NOT_FOUND' });
    const audit = await f.db.prepare(`SELECT action,share_id,content_suitability,metadata_revision,reason
      FROM wg_content_audit WHERE user_id='alice' ORDER BY id`).all();
    assert.equal(audit[0].action, 'classify_share');
    assert.equal(audit[0].share_id, made.id);
    assert.equal(audit[0].content_suitability, 'sfw');
    assert.equal(audit[0].metadata_revision, 1);
    assert.equal(audit[0].reason, '已核实标题和说明适合公共展示');
    assert.equal((await f.service.content.export('alice')).audit[0].shareId, made.id);
  } finally { await f.close(); }
});

test('分享文案分级只允许管理员修改，HTTP严格校验修订和理由并拒绝旧修订', async () => {
  const f = await shareClassificationFixture();
  const adminOrigin = 'https://localhost:18285';
  const { app } = createShareAdminApp(f.service, adminOrigin, 'synthetic-share-content-admin');
  try {
    const made = await f.shares.create('alice', f.input);
    const path = `/api/share-admin/content/shares/${made.id}`;
    const login = await app.request(adminOrigin + '/api/share-admin/login', {
      method: 'POST', headers: { origin: adminOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'synthetic-share-content-admin' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const patch = (body: unknown, headers: Record<string, string> = {}, target = path) => app.request(adminOrigin + target, {
      method: 'PATCH', headers: { origin: adminOrigin, cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const valid = { suitability: 'sfw', revision: 1, reason: '已核实分享标题与说明' };
    assert.equal((await patch(valid, { cookie: '' })).status, 401);
    assert.equal((await patch(valid, { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await f.service.app.request(origin + path, {
      method: 'PATCH', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(valid),
    })).status, 404);
    const classified = await patch(valid);
    assert.equal(classified.status, 200);
    assert.deepEqual(await classified.json(), { id: made.id, suitability: 'sfw', revision: 1 });
    assert.equal(classified.headers.get('cache-control'), 'private, no-store');
    for (const body of [
      { ...valid, suitability: 'all-ages' }, { ...valid, revision: '1' }, { ...valid, revision: 0 },
      { ...valid, revision: 1.5 }, { ...valid, reason: '' }, { ...valid, reason: '说明\n控制字符' },
      { ...valid, reason: '长'.repeat(1001) }, { ...valid, owner: 'bob' }, null,
    ]) assert.equal((await patch(body)).status, 400);
    assert.equal((await patch(valid, {}, '/api/share-admin/content/shares/missing-share')).status, 404);
    await f.shares.edit('alice', made.id, 1, { title: '新版分享', description: '修订后的说明', progress: 'complete', spoiler: true });
    assert.equal((await patch(valid)).status, 409);
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    const nsfw = await patch({ suitability: 'nsfw', revision: 2, reason: '新文案属于敏感内容' });
    assert.equal(nsfw.status, 200);
    assert.equal(await f.service.content.shareSuitability(made.id), 'nsfw');
    const reset = await patch({ suitability: 'unknown', revision: 2, reason: '需要进一步核实文案' });
    assert.equal(reset.status, 200);
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
  } finally { await f.close(); }
});

test('公开分享存在待发布文案时不能审核旧文案，新文案批准后仍须独立分级且撤回后不沿用审核', async () => {
  const f = await shareClassificationFixture();
  try {
    const made = await f.shares.create('alice', { ...f.input, mode: 'public' });
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await f.shares.moderate(made.id, 1, 'approve', '批准当前公开文案');
    await f.service.content.classifyShare(made.id, 'sfw', 1, '已核实当前已发布文案');
    assert.equal(await f.service.content.shareSuitability(made.id), 'sfw');
    await f.shares.edit('alice', made.id, 1, { title: '新的待审标题', description: '内容已更新，待发布审核', progress: 'complete', spoiler: true });
    assert.equal((await f.shares.inspect(made.id)).title, 'Chapter one');
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await assert.rejects(f.service.content.classifyShare(made.id, 'sfw', 2, '不能将仍在展示的旧文案审核绑定到新修订'), { code: 'CONTENT_CONFLICT' });
    await f.shares.moderate(made.id, 2, 'approve', '批准新的公开文案');
    assert.equal((await f.shares.inspect(made.id)).title, '新的待审标题');
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await f.service.content.classifyShare(made.id, 'sfw', 2, '重新核实当前已发布的新文案');
    assert.equal(await f.service.content.shareSuitability(made.id), 'sfw');
    await f.shares.revoke('alice', made.id);
    assert.equal(await f.service.content.shareSuitability(made.id), 'unknown');
    await assert.rejects(f.service.content.classifyShare(made.id, 'sfw', 2, '撤回状态不能再审核为可展示'), { code: 'CONTENT_CONFLICT' });
    const classified = await f.db.prepare("SELECT count(*) AS n FROM wg_content_audit WHERE share_id=$1 AND action='classify_share'").get(made.id);
    assert.equal(classified?.n, 2);
  } finally { await f.close(); }
});
