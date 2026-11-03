import { randomUUID } from 'node:crypto';
import type { PgDatabase, PgRow } from '../database/postgres.ts';
import type { ContentAccess, DisplayMode, EligibilityStatus, QuizAttempt, QuizResult } from '../content/types.ts';
import {
  CONTENT_POLICY_VERSION, CONTENT_QUIZ_VERSION, createRuleQuestions, publicRuleQuestions, type RuleQuestion,
} from '../content/quiz.ts';
import { ABSOLUTE_MS } from './auth.server.ts';
import { AccountError } from './errors.server.ts';

const DAY = 86_400_000;
const COOLDOWN = 30 * 60_000;
type Grade = Pick<QuizResult, 'passed' | 'incorrect'>;
export type ContentModeration = 'suspend' | 'unsuspend' | 'revoke' | 'require_retest';
export type ContentEligibilityOptions = { now?: () => number; policyVersion?: () => string };
export type ShareSuitability = 'sfw' | 'nsfw' | 'unknown';

export class ContentEligibilityStore {
  private readonly now: () => number;
  private readonly policyVersion: () => string;

  constructor(private readonly db: PgDatabase, options: ContentEligibilityOptions = {}) {
    this.now = options.now ?? Date.now;
    this.policyVersion = options.policyVersion ?? (() => CONTENT_POLICY_VERSION);
  }

  publicAccess(): ContentAccess {
    return {
      authenticated: false, eligibility: 'unqualified', displayMode: 'public', canViewRestricted: false,
      requiredPolicyVersion: this.policyVersion(), nextAttemptAt: null, attemptsRemaining: 3,
    };
  }

  // 与账号删除、恢复使用同一事务锁，避免跨进程组合操作重建已删除账号或旧权限。
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(fn, { lock: 'wvn:account-write' });
  }

  private async requireSession(userId: string, sessionId: string) {
    const now = this.now();
    const session = await this.db.prepare(`SELECT s.id FROM session s JOIN wg_account a ON a.user_id=s."userId"
      WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">$3 AND s."createdAt">$4
      FOR UPDATE OF s`).get(sessionId, userId, new Date(now), new Date(now - ABSOLUTE_MS));
    if (!session) throw new AccountError(401, 'SIGN_IN_REQUIRED');
  }

  private async eligibility(userId: string) {
    return this.db.prepare('SELECT * FROM wg_content_eligibility WHERE user_id=$1').get(userId);
  }

  private status(row: PgRow | undefined, policy = this.policyVersion()): EligibilityStatus {
    if (!row) return 'unqualified';
    if (row.status === 'qualified' && row.policy_version !== policy) return 'needs_retest';
    return row.status as EligibilityStatus;
  }

  private async access(userId: string, sessionId: string): Promise<ContentAccess> {
    const now = this.now(), policy = this.policyVersion();
    const row = await this.eligibility(userId);
    const status = this.status(row, policy);
    const mode = await this.db.prepare(`SELECT mode,policy_version FROM wg_content_session_modes
      WHERE user_id=$1 AND session_id=$2`).get(userId, sessionId);
    const recent = await this.db.prepare(`SELECT submitted_at,result FROM wg_content_attempts
      WHERE user_id=$1 AND submitted_at>$2 ORDER BY submitted_at`).all(userId, now - DAY);
    const failures = recent.filter(attempt => attempt.result.passed === false);
    const cooldownAt = failures.length ? failures[failures.length - 1].submitted_at + COOLDOWN : 0;
    const quotaAt = recent.length >= 3 ? recent[recent.length - 3].submitted_at + DAY : 0;
    const retryAt = Math.max(cooldownAt, quotaAt);
    const displayMode: DisplayMode = status === 'qualified' && mode?.policy_version === policy && mode.mode === 'restricted'
      ? 'restricted' : 'public';
    return {
      authenticated: true, eligibility: status, displayMode, canViewRestricted: displayMode === 'restricted',
      requiredPolicyVersion: policy, nextAttemptAt: retryAt > now ? retryAt : null,
      attemptsRemaining: Math.max(0, 3 - recent.length),
    };
  }

  async getAccess(userId: string, sessionId: string): Promise<ContentAccess> {
    return this.transaction(async () => {
      await this.requireSession(userId, sessionId);
      return this.access(userId, sessionId);
    });
  }

  private attempt(row: PgRow): QuizAttempt {
    return {
      id: row.id, policyVersion: row.policy_version, quizVersion: row.quiz_version,
      expiresAt: row.expires_at, questions: publicRuleQuestions(row.questions),
    };
  }

  async createAttempt(userId: string, sessionId: string): Promise<QuizAttempt> {
    return this.transaction(async () => {
      await this.requireSession(userId, sessionId);
      const access = await this.access(userId, sessionId);
      if (access.eligibility === 'suspended') throw new AccountError(403, 'CONTENT_SUSPENDED');
      if (access.nextAttemptAt !== null) throw new AccountError(429, 'CONTENT_RETRY_LATER');
      const now = this.now(), policy = this.policyVersion();
      await this.db.prepare(`UPDATE wg_content_attempts SET invalidated_at=$2,questions=NULL
        WHERE user_id=$1 AND submitted_at IS NULL AND invalidated_at IS NULL
        AND (expires_at<=$2 OR policy_version<>$3 OR quiz_version<>$4)`)
        .run(userId, now, policy, CONTENT_QUIZ_VERSION);
      const existing = await this.db.prepare(`SELECT * FROM wg_content_attempts
        WHERE user_id=$1 AND submitted_at IS NULL AND invalidated_at IS NULL`).get(userId);
      if (existing) return this.attempt(existing);
      const id = randomUUID(), questions = createRuleQuestions();
      await this.db.prepare(`INSERT INTO wg_content_attempts
        (id,user_id,policy_version,quiz_version,created_at,expires_at,questions)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`).run(id, userId, policy, CONTENT_QUIZ_VERSION, now, now + DAY, JSON.stringify(questions));
      return { id, policyVersion: policy, quizVersion: CONTENT_QUIZ_VERSION, expiresAt: now + DAY, questions: publicRuleQuestions(questions) };
    });
  }

  async submitAttempt(userId: string, sessionId: string, attemptId: string, answers: unknown): Promise<QuizResult> {
    return this.transaction(async () => {
      await this.requireSession(userId, sessionId);
      if (this.status(await this.eligibility(userId)) === 'suspended') throw new AccountError(403, 'CONTENT_SUSPENDED');
      const row = await this.db.prepare('SELECT * FROM wg_content_attempts WHERE id=$1 AND user_id=$2 FOR UPDATE').get(attemptId, userId);
      if (!row) throw new AccountError(404, 'CONTENT_ATTEMPT_NOT_FOUND');
      if (row.policy_version !== this.policyVersion() || row.quiz_version !== CONTENT_QUIZ_VERSION)
        throw new AccountError(409, 'CONTENT_POLICY_CHANGED');
      // 重试只读取已结算结果，不再次计次或授予资格；权限始终重新查询。
      if (row.submitted_at !== null) return { ...row.result as Grade, access: await this.access(userId, sessionId) };
      if (row.invalidated_at !== null || row.expires_at <= this.now()) throw new AccountError(410, 'CONTENT_ATTEMPT_EXPIRED');
      const questions = row.questions as RuleQuestion[];
      if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) throw new AccountError(400, 'CONTENT_ANSWERS_INVALID');
      const selected = answers as Record<string, unknown>;
      if (Object.keys(selected).length !== questions.length || questions.some(question =>
        !Object.hasOwn(selected, question.id) || typeof selected[question.id] !== 'string' ||
        !question.choices.some(choice => choice.id === selected[question.id]))) throw new AccountError(400, 'CONTENT_ANSWERS_INVALID');
      const current = await this.access(userId, sessionId);
      if (current.nextAttemptAt !== null) throw new AccountError(429, 'CONTENT_RETRY_LATER');
      const incorrect = questions.filter(question => question.correctChoiceId !== selected[question.id])
        .map(question => ({ questionId: question.id, explanation: question.explanation }));
      const result: Grade = { passed: incorrect.length === 0, incorrect };
      const now = this.now();
      if (row.policy_version !== this.policyVersion()) throw new AccountError(409, 'CONTENT_POLICY_CHANGED');
      if (result.passed) {
        await this.db.prepare(`INSERT INTO wg_content_eligibility
          (user_id,status,policy_version,quiz_version,qualified_at,granted_by,updated_at)
          VALUES($1,'qualified',$2,$3,$4,$5,$4)
          ON CONFLICT(user_id) DO UPDATE SET status='qualified',policy_version=excluded.policy_version,
          quiz_version=excluded.quiz_version,qualified_at=excluded.qualified_at,granted_by=excluded.granted_by,updated_at=excluded.updated_at`)
          .run(userId, row.policy_version, row.quiz_version, now, 'quiz:' + row.id);
        await this.db.prepare('DELETE FROM wg_content_session_modes WHERE user_id=$1').run(userId);
      }
      await this.db.prepare(`UPDATE wg_content_attempts SET submitted_at=$2,result=$3::jsonb,questions=NULL WHERE id=$1`)
        .run(row.id, now, JSON.stringify(result));
      return { ...result, access: await this.access(userId, sessionId) };
    });
  }

  async setMode(userId: string, sessionId: string, mode: DisplayMode): Promise<ContentAccess> {
    if (mode !== 'public' && mode !== 'restricted') throw new AccountError(400, 'CONTENT_MODE_INVALID');
    return this.transaction(async () => {
      await this.requireSession(userId, sessionId);
      const access = await this.access(userId, sessionId);
      if (mode === 'restricted' && access.eligibility !== 'qualified') {
        const code = access.eligibility === 'suspended' ? 'CONTENT_SUSPENDED'
          : access.eligibility === 'needs_retest' ? 'CONTENT_RETEST_REQUIRED' : 'CONTENT_UNQUALIFIED';
        throw new AccountError(403, code);
      }
      await this.db.prepare(`INSERT INTO wg_content_session_modes(session_id,user_id,policy_version,mode,updated_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id) DO UPDATE SET
        policy_version=excluded.policy_version,mode=excluded.mode,updated_at=excluded.updated_at`)
        .run(sessionId, userId, this.policyVersion(), mode, this.now());
      return this.access(userId, sessionId);
    });
  }

  async moderate(userId: string, action: ContentModeration, reason: string) {
    if (!['suspend', 'unsuspend', 'revoke', 'require_retest'].includes(action) || typeof reason !== 'string' ||
      !reason.trim() || [...reason.trim()].length > 1000 || /[\p{Cc}\p{Cf}]/u.test(reason)) throw new AccountError(400, 'CONTENT_MODERATION_INVALID');
    return this.transaction(async () => {
      if (!await this.db.prepare('SELECT user_id FROM wg_account WHERE user_id=$1').get(userId)) throw new AccountError(404, 'NOT_FOUND');
      const previous = this.status(await this.eligibility(userId));
      if (previous === 'suspended' && action !== 'unsuspend' && action !== 'suspend') throw new AccountError(403, 'CONTENT_SUSPENDED');
      if (action === 'unsuspend' && previous !== 'suspended') throw new AccountError(409, 'CONTENT_NOT_SUSPENDED');
      const status: EligibilityStatus = action === 'suspend' ? 'suspended' : action === 'revoke' ? 'unqualified' : 'needs_retest';
      const now = this.now();
      await this.db.prepare(`INSERT INTO wg_content_eligibility(user_id,status,updated_at) VALUES($1,$2,$3)
        ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,policy_version=NULL,quiz_version=NULL,
        qualified_at=NULL,granted_by=NULL,updated_at=excluded.updated_at`).run(userId, status, now);
      await this.db.prepare('DELETE FROM wg_content_session_modes WHERE user_id=$1').run(userId);
      await this.db.prepare(`UPDATE wg_content_attempts SET invalidated_at=$2,questions=NULL
        WHERE user_id=$1 AND submitted_at IS NULL AND invalidated_at IS NULL`).run(userId, now);
      await this.db.prepare(`INSERT INTO wg_content_audit(user_id,action,reason,actor,created_at)
        VALUES($1,$2,$3,'private-admin',$4)`).run(userId, action, reason.trim(), now);
      return { status };
    });
  }

  async shareSuitability(id: string): Promise<ShareSuitability> {
    const share = await this.db.prepare(`SELECT content_suitability,content_reviewed_revision,metadata_revision,pending,state,approved
      FROM wg_save_shares WHERE id=$1`).get(id);
    if (!share || share.state !== 'active' || share.pending !== null || !share.approved ||
      share.content_reviewed_revision !== share.metadata_revision) return 'unknown';
    return share.content_suitability as ShareSuitability;
  }

  async classifyShare(id: string, suitability: ShareSuitability, expectedMetadataRevision: number, reason: string) {
    if (!['sfw', 'nsfw', 'unknown'].includes(suitability) || !Number.isSafeInteger(expectedMetadataRevision) || expectedMetadataRevision < 1 ||
      typeof reason !== 'string' || !reason.trim() || [...reason.trim()].length > 1000 || /[\p{Cc}\p{Cf}]/u.test(reason))
      throw new AccountError(400, 'CONTENT_SHARE_CLASSIFICATION_INVALID');
    return this.transaction(async () => {
      const share = await this.db.prepare(`SELECT s.owner,s.metadata_revision,s.pending,s.state,s.approved FROM wg_save_shares s
        JOIN "user" u ON u.id=s.owner WHERE s.id=$1 FOR UPDATE OF s`).get(id);
      if (!share) throw new AccountError(404, 'NOT_FOUND');
      if (share.metadata_revision !== expectedMetadataRevision || share.state !== 'active' || share.pending !== null || !share.approved)
        throw new AccountError(409, 'CONTENT_CONFLICT');
      const updated = await this.db.prepare(`UPDATE wg_save_shares SET content_suitability=$2,
        content_reviewed_revision=$3,content_reason=$4 WHERE id=$1 AND metadata_revision=$3`)
        .run(id, suitability, expectedMetadataRevision, reason.trim());
      if (!updated.changes) throw new AccountError(409, 'CONTENT_CONFLICT');
      await this.db.prepare(`INSERT INTO wg_content_audit
        (user_id,action,reason,actor,created_at,share_id,content_suitability,metadata_revision)
        VALUES($1,'classify_share',$2,'private-admin',$3,$4,$5,$6)`)
        .run(share.owner, reason.trim(), this.now(), id, suitability, expectedMetadataRevision);
      return { id, suitability, revision: expectedMetadataRevision };
    });
  }

  async export(userId: string) {
    const row = await this.eligibility(userId);
    const attempts = await this.db.prepare(`SELECT id,policy_version,quiz_version,created_at,expires_at,submitted_at,
      invalidated_at,result FROM wg_content_attempts WHERE user_id=$1 ORDER BY created_at,id`).all(userId);
    const audit = await this.db.prepare(`SELECT action,reason,actor,created_at,share_id,content_suitability,metadata_revision FROM wg_content_audit
      WHERE user_id=$1 ORDER BY created_at,id`).all(userId);
    return {
      eligibility: row ? { status: this.status(row), policyVersion: row.policy_version, quizVersion: row.quiz_version,
        qualifiedAt: row.qualified_at, grantedBy: row.granted_by, updatedAt: row.updated_at } : null,
      attempts: attempts.map(attempt => ({ id: attempt.id, policyVersion: attempt.policy_version, quizVersion: attempt.quiz_version,
        createdAt: attempt.created_at, expiresAt: attempt.expires_at, submittedAt: attempt.submitted_at,
        invalidatedAt: attempt.invalidated_at, passed: attempt.result?.passed ?? null,
        incorrectQuestionIds: attempt.result?.incorrect.map((incorrect: Grade['incorrect'][number]) => incorrect.questionId) ?? [] })),
      audit: audit.map(entry => ({ action: entry.action, reason: entry.reason, actor: entry.actor, createdAt: entry.created_at,
        ...(entry.share_id === null ? {} : { shareId: entry.share_id, suitability: entry.content_suitability, metadataRevision: entry.metadata_revision }) })),
    };
  }

  async gc() {
    const cutoff = this.now() - 30 * DAY;
    await this.transaction(async () => {
      await this.db.prepare(`DELETE FROM wg_content_attempts WHERE submitted_at<$1 OR
        (submitted_at IS NULL AND expires_at<$1)`).run(cutoff);
    });
  }
}
