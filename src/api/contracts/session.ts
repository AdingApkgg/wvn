import { z } from 'zod';
import { endpoint } from '../endpoint.ts';
const empty = z.object({});
const ok = z.object({ ok: z.literal(true) });
const params = z.object({ id: z.string() });
export const accountViewSchema = z.object({
  sessionIdentity: z.string().optional(), user: z.object({ id: z.string(), name: z.string(), uid: z.string().optional() }),
  admin: z.boolean().optional(), binding: z.string(),
  passkeys: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.number(), backedUp: z.number() }).passthrough()),
  devices: z.array(z.object({ id: z.string(), userAgent: z.string().nullable(), current: z.boolean(), createdAt: z.number(), expiresAt: z.number() })),
  recoveryReady: z.boolean(),
});
export const sessionContract = {
  sessionGet: endpoint('GET', '/api/me', empty, accountViewSchema),
  loginOptions: endpoint('GET', '/api/login-options', empty, z.object({ passkey: z.boolean(), signup: z.string(), password: z.boolean(), mode: z.string(), isolated: z.boolean() })),
  passkeyDelete: endpoint('POST', '/api/me/passkeys/{id}/delete', z.object({ params }), ok),
  deviceRevoke: endpoint('POST', '/api/me/devices/{id}/revoke', z.object({ params }), ok),
  recoveryCodes: endpoint('POST', '/api/me/recovery-codes', empty, z.object({ accountId: z.string(), codes: z.array(z.string()) })),
};
