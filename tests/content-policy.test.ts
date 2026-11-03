import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicWork } from '../src/types.ts';
import type { ContentAccess } from '../src/content/types.ts';
import { projectWork, versionAccessError, safeReturnPath } from '../src/content/policy.ts';

const evidence = { reason: '测试证据', source: 'fixture', reviewedAt: '2026-11-04T00:00:00.000Z', revision: 1 };
const anonymous: ContentAccess = { authenticated: false, eligibility: 'unqualified', displayMode: 'public', canViewRestricted: false, requiredPolicyVersion: '2026-11-04-v1', nextAttemptAt: null, attemptsRemaining: 3 };
const allowed: ContentAccess = { ...anonymous, authenticated: true, eligibility: 'qualified', displayMode: 'restricted', canViewRestricted: true };
function fixture(): PublicWork {
  return { id: 'v4', title: '公共作品', originalTitle: 'Story', aliases: [], evidence: '', revision: 1, url: '/4/', defaultVersionId: 'adult',
    classification: { ...evidence, pageSuitability: 'sfw' },
    versions: [
      { id: 'adult', workId: 'v4', number: 1, title: '未审核敏感版本标题', engine: 'ONS', revision: 1, url: '/4/1/', launchPath: '/private-game/', checks: [], language: '中文', notes: '敏感说明', sortOrder: 1, classification: { ...evidence, sexualContent: 'unknown', titleSafe: false } },
      { id: 'safe', workId: 'v4', number: 2, title: '非成人版本', engine: 'ONS', revision: 1, url: '/4/2/', launchPath: '/safe-game/', checks: [], language: '中文', notes: '', sortOrder: 2, classification: { ...evidence, sexualContent: 'none', titleSafe: true } },
    ] } as PublicWork;
}
test('公共页保留受限版本中性摘要，默认指向可读版本且不修改原始目录', () => {
  const raw = fixture();
  const shown = projectWork(raw, anonymous)!;
  assert.equal(shown.defaultVersionId, 'safe');
  assert.equal(shown.versions[0].title, '版本 1 · 受限');
  assert.equal(shown.versions[0].launchPath, '');
  assert.equal(shown.versions[0].notes, '');
  assert.equal(shown.versions[0].contentRestricted, true);
  assert.equal(raw.versions[0].title, '未审核敏感版本标题');
});
test('页面NSFW与版本内容分别判断；页面未审核时不进入任何发现列表', () => {
  const raw = fixture();
  raw.classification = { ...evidence, pageSuitability: 'nsfw' };
  assert.equal(projectWork(raw, anonymous), null);
  assert(projectWork(raw, allowed));
  raw.classification = { ...evidence, pageSuitability: 'unknown' };
  assert.equal(projectWork(raw, allowed), null);
});
test('待核实版本需登录、资格与当前会话开启；不得只信任客户端模式', () => {
  const raw = fixture(), version = raw.versions[0];
  assert.equal(versionAccessError(raw, version, anonymous), 'SIGN_IN_REQUIRED');
  assert.equal(versionAccessError(raw, version, { ...anonymous, authenticated: true }), 'CONTENT_QUALIFICATION_REQUIRED');
  assert.equal(versionAccessError(raw, version, { ...allowed, displayMode: 'public', canViewRestricted: false }), 'CONTENT_MODE_REQUIRED');
  assert.equal(versionAccessError(raw, version, { ...allowed, eligibility: 'suspended' }), 'CONTENT_SUSPENDED');
  assert.equal(versionAccessError(raw, version, allowed), null);
  assert.equal(versionAccessError(raw, raw.versions[1], anonymous), null);
});
test('只返回已核实安全媒体，开启模式也不自动展示敏感或未知图片', () => {
  const raw = fixture() as PublicWork & { metadata: any };
  const media = (url: string, sexual: string) => ({ url, sourceUrl: 'https://example.invalid', source: 'vndb', classification: { ...evidence, sexual, violence: 'tame', spoiler: false } });
  raw.metadata = { cover: media('/explicit', 'explicit'), screenshots: [media('/safe', 'safe'), media('/unknown', 'unknown')], sources: [], warnings: [] };
  const shown = projectWork(raw, allowed)!;
  assert.equal(shown.metadata?.cover, null);
  assert.deepEqual(shown.metadata?.screenshots.map(s => s.url), ['/safe']);
  assert(!JSON.stringify(shown).includes('/explicit'));
});
test('返回目标只允许本站相对路径，拒绝协议相对、反斜杠及控制字符', () => {
  assert.equal(safeReturnPath('/4/1/?x=1'), '/4/1/?x=1');
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%5cevil.test', '/a\n']) assert.equal(safeReturnPath(path), '/');
});
