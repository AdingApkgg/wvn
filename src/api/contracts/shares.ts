import { z } from "zod";
import { endpoint } from "../endpoint";
import { saveFileSchema, saveProfileSchema, saveRevisionSchema } from "./saves";

export const shareProgressSchema = z.enum(["chapter", "route", "complete", "unlock", "other"]);
export const shareTextSchema = z.object({
  title: z.string(), description: z.string(), progress: shareProgressSchema, spoiler: z.boolean(),
});
export const shareViewSchema = shareTextSchema.extend({
  contentRedacted: z.boolean().optional(), id: z.string(), mode: z.enum(["public", "link"]),
  work: z.object({ id: z.string(), title: z.string(), url: z.string() }),
  version: z.object({ id: z.string(), title: z.string(), number: z.number(), engine: z.string(), url: z.string(), engineReleaseId: z.string().optional() }),
  metadataBasis: z.enum(["published", "legacy-current"]),
  publicSource: z.object({ id: z.string(), title: z.string() }).nullable(),
  author: z.string(), createdAt: z.number(), expiresAt: z.number().nullable(),
  files: z.array(saveFileSchema), bytes: z.number(), claims: z.number(),
  integrity: z.literal("sha256"), compatibility: z.literal("author-declared"),
});
export const ownShareSchema = shareViewSchema.extend({
  state: z.string(), metadataRevision: z.number(), pending: shareTextSchema.nullable(),
});
export const shareClaimSchema = z.object({ profile: saveProfileSchema, revision: saveRevisionSchema });
const shareTextInputSchema = shareTextSchema.extend({ progress: z.string() });
const idParams = z.object({ id: z.string() });
const secret = z.string().optional();
const ok = z.object({ ok: z.literal(true) });
export const shareContract = {
  publicWorkShares: endpoint("GET", "/api/public/works/{work}/save-shares", z.object({
    params: z.object({ work: z.string() }),
    query: z.object({ versionId: z.string().optional(), cursor: z.string().optional(), progress: z.string().optional() }).optional(),
  }), z.object({ items: z.array(shareViewSchema), next: z.string().nullable() })),
  publicShareGet: endpoint("GET", "/api/public/save-shares/{id}", z.object({ params: idParams }), shareViewSchema),
  shareInspect: endpoint("POST", "/api/share-links/{id}/inspect", z.object({
    params: idParams, body: z.object({ secret }),
  }), shareViewSchema),
  sharesOwn: endpoint("GET", "/api/me/save-shares", z.object({
    query: z.object({ cursor: z.string().optional() }).optional(),
  }), z.object({ items: z.array(ownShareSchema), next: z.string().nullable() })),
  shareCreate: endpoint("POST", "/api/me/save-shares", z.object({
    body: shareTextInputSchema.extend({ profileId: z.string(), generation: z.number(), revisionId: z.string(), mode: z.enum(["public", "link"]), days: z.number().optional(), requestId: z.string() }),
  }), z.object({ id: z.string(), secret, state: z.string(), duplicate: z.boolean().optional() })),
  shareEdit: endpoint("PATCH", "/api/me/save-shares/{id}", z.object({
    params: idParams, body: shareTextInputSchema.extend({ revision: z.number() }),
  }), ok),
  shareRevoke: endpoint("POST", "/api/me/save-shares/{id}/revoke", z.object({ params: idParams }), ok),
  shareClaim: endpoint("POST", "/api/me/share-claims", z.object({
    body: z.object({ shareId: z.string(), secret, requestId: z.string() }),
  }), shareClaimSchema),
  shareClaimStatus: endpoint("GET", "/api/me/share-claims/{request}", z.object({
    params: z.object({ request: z.string() }),
  }), z.union([shareClaimSchema.extend({ status: z.literal("complete") }), z.object({ status: z.literal("pending") })])),
  shareReport: endpoint("POST", "/api/me/share-reports", z.object({
    body: z.object({ shareId: z.string(), secret, reason: z.string() }),
  }), ok),
};
