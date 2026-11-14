import { z } from 'zod';
import { endpoint } from '../endpoint.ts';
import { saveProfileSchema, saveRevisionSchema } from './saves.ts';
import { shareViewSchema } from './shares.ts';

const empty = z.object({});
const id = z.string();
const params = z.object({ id });
const number = z.number().finite();
const ok = z.object({ ok: z.literal(true) });
export const contentAccessSchema = z.object({
  sessionIdentity: z.string().optional(), authenticated: z.boolean(),
  eligibility: z.enum(['unqualified', 'qualified', 'suspended', 'needs_retest']),
  displayMode: z.enum(['public', 'restricted']), canViewRestricted: z.boolean(),
  requiredPolicyVersion: z.string(), nextAttemptAt: number.nullable(),
  attemptsRemaining: z.number().int().nonnegative(),
});
export const libraryEntrySchema = z.object({ workId: id, status: z.string(), note: z.string(), noteHidden: z.boolean().optional(), revision: number, lastVersionId: id.nullable(), seconds: number });
export const catalogVersionSchema = z.object({ id, number, title: z.string(), engine: z.string(), url: z.string() });
export const catalogItemSchema = z.object({ id, title: z.string(), url: z.string(), versions: z.array(catalogVersionSchema) });
export const publicProfileSchema = z.object({ uid: id, name: z.string(), bio: z.string(), joinedAt: z.string() });
export const ownProfileSchema = publicProfileSchema.extend({ published: z.boolean(), revision: number });
export const workCountsSchema = z.object({ reads: number, likes: number, favorites: number });
const mine = z.object({ liked: z.boolean(), favorited: z.boolean() });
export const quizAttemptSchema = z.object({ id, policyVersion: z.string(), quizVersion: z.string(), expiresAt: number, questions: z.array(z.object({ id, text: z.string(), choices: z.array(z.object({ id, text: z.string() })) })) });
export const quizResultSchema = z.object({ passed: z.boolean(), incorrect: z.array(z.object({ questionId: id, explanation: z.string() })), access: contentAccessSchema });
// 数据库导出保留历史值；这些字段不是新写入输入的校验入口。
const scalar = z.union([z.string(), number, z.boolean(), z.null()]);
const contentExport = z.object({
  eligibility: z.object({ status: z.string(), policyVersion: scalar, quizVersion: scalar, qualifiedAt: scalar, grantedBy: scalar, updatedAt: scalar }).nullable(),
  attempts: z.array(z.object({ id: scalar, policyVersion: scalar, quizVersion: scalar, createdAt: scalar, expiresAt: scalar, submittedAt: scalar, invalidatedAt: scalar, passed: z.boolean().nullable(), incorrectQuestionIds: z.array(z.string()) })),
  audit: z.array(z.object({ action: scalar, reason: scalar, actor: scalar, createdAt: scalar, shareId: scalar.optional(), suitability: scalar.optional(), metadataRevision: scalar.optional() })),
});
const saveProfile = saveProfileSchema.extend({ revisions: z.array(saveRevisionSchema) });
export const accountExportSchema = z.object({
  format: z.literal('wg-account-export-v1'), profile: ownProfileSchema, exportedAt: z.string(), user: z.object({ id, name: z.string() }), content: contentExport,
  library: z.array(libraryEntrySchema), workReactions: z.array(z.object({ work_id: z.string(), kind: z.string(), updated_at: scalar })), saveProfiles: z.array(saveProfile),
  playSessions: z.array(z.object({ id, work_id: z.string(), version_id: z.string(), started_at: scalar, seconds: scalar })),
});
export const accountContract = {
  catalogList: endpoint('GET', '/api/account-catalog', empty, z.array(catalogItemSchema)),
  libraryList: endpoint('GET', '/api/me/library', empty, z.array(libraryEntrySchema)),
  libraryEdit: endpoint('PATCH', '/api/me/library/{id}', z.object({ params, body: z.object({ revision: number, status: z.string(), note: z.string().optional() }) }), libraryEntrySchema),
  playStart: endpoint('POST', '/api/me/play-sessions', z.object({ body: z.object({ versionId: id, eventId: z.string() }) }), z.object({ id })),
  playHeartbeat: endpoint('POST', '/api/me/play-sessions/{id}/heartbeat', z.object({ params, body: z.object({ seq: number, active: z.boolean() }) }), z.object({ seconds: number })),
  profileGet: endpoint('GET', '/api/me/profile', empty, ownProfileSchema),
  profileUpdate: endpoint('PATCH', '/api/me/profile', z.object({ body: z.object({ name: z.string(), bio: z.string(), published: z.boolean(), revision: number }).strict() }), ownProfileSchema),
  publicProfileGet: endpoint('GET', '/api/public/users/{uid}', z.object({ params: z.object({ uid: id }) }), publicProfileSchema),
  publicProfileShares: endpoint('GET', '/api/public/users/{uid}/save-shares', z.object({ params: z.object({ uid: id }), query: z.object({ page: z.string().optional() }).optional() }), z.object({ items: z.array(shareViewSchema), next: number.nullable() })),
  contentGet: endpoint('GET', '/api/me/content', empty, contentAccessSchema),
  contentAttemptCreate: endpoint('POST', '/api/me/content/attempts', empty, quizAttemptSchema),
  contentAttemptSubmit: endpoint('POST', '/api/me/content/attempts/{id}/submit', z.object({ params, body: z.object({ answers: z.record(z.string(), z.string()) }).strict() }), quizResultSchema),
  contentModeSet: endpoint('PATCH', '/api/me/content/mode', z.object({ body: z.object({ mode: z.enum(['public', 'restricted']) }).strict() }), contentAccessSchema),
  statsGet: endpoint('GET', '/api/public/work-stats', z.object({ query: z.object({ ids: z.string().optional() }).optional() }), z.record(z.string(), workCountsSchema)),
  statsRead: endpoint('POST', '/api/public/works/{id}/read', z.object({ params, body: z.object({ versionId: id }).strict() }), z.union([z.object({ visitorRequired: z.literal(true) }), z.object({ counted: z.boolean(), stats: workCountsSchema })])),
  statsMine: endpoint('GET', '/api/me/work-stats/{id}', z.object({ params }), mine),
  statsReact: endpoint('PUT', '/api/me/work-stats/{id}/{kind}', z.object({ params: params.extend({ kind: z.string() }), body: z.object({ enabled: z.boolean() }).strict() }), mine.extend({ stats: workCountsSchema })),
  favoritesList: endpoint('GET', '/api/me/favorites', empty, z.array(id)),
  passkeyRename: endpoint('PATCH', '/api/me/passkeys/{id}', z.object({ params, body: z.object({ name: z.string() }) }), ok),
  accountExport: endpoint('GET', '/api/me/export', empty, accountExportSchema),
  accountDelete: endpoint('DELETE', '/api/me', z.object({ body: z.object({ confirmation: z.string() }) }), ok),
};
