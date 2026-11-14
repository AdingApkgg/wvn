import test from 'node:test';
import assert from 'node:assert/strict';
import { accountExportSchema, contentAccessSchema, libraryEntrySchema, ownProfileSchema, quizAttemptSchema, quizResultSchema, workCountsSchema } from '../src/api/contracts/account.ts';

const access = { authenticated: true, eligibility: 'qualified', displayMode: 'public', canViewRestricted: false, requiredPolicyVersion: 'v1', nextAttemptAt: null, attemptsRemaining: 3 };
test('account schemas retain redacted library markers and SSR-only session identity', () => {
  const entry = { workId: 'v1', status: 'playing', note: '', noteHidden: true, revision: 2, lastVersionId: null, seconds: 30 };
  assert.deepEqual(libraryEntrySchema.parse(entry), entry);
  assert.deepEqual(contentAccessSchema.parse({ ...access, sessionIdentity: 'snapshot' }), { ...access, sessionIdentity: 'snapshot' });
  assert.equal(contentAccessSchema.safeParse({ ...access, attemptsRemaining: -1 }).success, false);
  assert.equal(contentAccessSchema.safeParse({ ...access, displayMode: 'unexpected' }).success, false);
});
test('quiz schemas validate nested results and never accept missing access checks', () => {
  const attempt = { id: 'quiz', policyVersion: 'v1', quizVersion: 'q1', expiresAt: 123, questions: [{ id: 'q', text: '规则', choices: [{ id: 'a', text: '答案' }] }] };
  assert.deepEqual(quizAttemptSchema.parse(attempt), attempt);
  assert.equal(quizAttemptSchema.safeParse({ ...attempt, questions: [{ id: 'q', text: '规则', choices: [{ text: '缺少标识' }] }] }).success, false);
  assert.equal(quizResultSchema.safeParse({ passed: true, incorrect: [], access }).success, true);
  assert.equal(quizResultSchema.safeParse({ passed: true, incorrect: [] }).success, false);
});
test('account export schema covers private data and revision history rather than accepting arbitrary JSON', () => {
  const profile = { uid: '1', name: '玩家', bio: '', joinedAt: '2026-01-01T00:00:00.000Z', published: false, revision: 0 };
  const exported = { format: 'wg-account-export-v1', profile, exportedAt: '2026-01-01T00:00:00.000Z', user: { id: 'u', name: '玩家' }, content: { eligibility: null, attempts: [], audit: [] }, library: [], workReactions: [], playSessions: [], saveProfiles: [{ id: 'save', versionId: 'v1', head: null, generation: 0, revisions: [{ id: 'r', parent: null, source: null, conflict: false, files: [{ name: 'save.dat', bytes: 3, sha256: 'abc' }], createdAt: 1 }] }] };
  assert.deepEqual(accountExportSchema.parse(exported), exported);
  assert.equal(accountExportSchema.safeParse({ ...exported, saveProfiles: [{ ...exported.saveProfiles[0], revisions: [{}] }] }).success, false);
  assert.equal(ownProfileSchema.safeParse({ ...profile, revision: '0' }).success, false);
  assert.equal(workCountsSchema.safeParse({ reads: 1, likes: 2 }).success, false);
});
