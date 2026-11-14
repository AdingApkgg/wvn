import { z } from "zod";
import { endpoint } from "../endpoint";

export const saveFileSchema = z.object({
  name: z.string(), bytes: z.number(), sha256: z.string(),
});
export const saveProfileSchema = z.object({
  id: z.string(), versionId: z.string(), engineReleaseId: z.string().optional(),
  head: z.string().nullable(), generation: z.number(),
});
export const saveRevisionSchema = z.object({
  id: z.string(), parent: z.string().nullable(), source: z.string().nullable(),
  files: z.array(saveFileSchema), conflict: z.boolean(),
  originKind: z.literal("share").optional(), createdAt: z.number(),
});
export const saveHistorySchema = z.object({
  items: z.array(saveRevisionSchema), current: saveRevisionSchema.nullable(), next: z.string().nullable(),
});
export const saveCommitSchema = z.object({
  conflict: z.boolean(), revision: saveRevisionSchema, code: z.literal("CONTENT_CONFLICT").optional(),
});
const idParams = z.object({ id: z.string() });
const head = { expectedHead: z.string().nullable(), generation: z.number() };
export const savesContract = {
  cloudOptions: endpoint("GET", "/api/cloud-options", z.object({}), z.object({
    manual: z.boolean(), sharing: z.boolean(), automatic: z.boolean(),
    maxSnapshotBytes: z.number(), maxFileBytes: z.number(), maxFiles: z.number(),
  })),
  saveProfilesList: endpoint("GET", "/api/me/save-profiles", z.object({
    query: z.object({ versionId: z.string().optional(), engineReleaseId: z.string().optional() }).optional(),
  }), z.array(saveProfileSchema)),
  saveProfileCreate: endpoint("POST", "/api/me/save-profiles", z.object({
    body: z.object({ versionId: z.string(), engineReleaseId: z.string().optional() }),
  }), saveProfileSchema),
  saveHistory: endpoint("GET", "/api/me/save-profiles/{id}/revisions", z.object({
    params: idParams, query: z.object({ cursor: z.string().optional() }).optional(),
  }), saveHistorySchema),
  saveUploadReserve: endpoint("POST", "/api/me/save-profiles/{id}/uploads", z.object({
    params: idParams, body: z.object({ ...head, captureId: z.string(), files: z.array(saveFileSchema) }),
  }), z.object({ id: z.string(), files: z.array(saveFileSchema.extend({ id: z.string() })), complete: z.boolean() })),
  saveUploadCommit: endpoint("POST", "/api/me/uploads/{id}/commit", z.object({ params: idParams }), saveCommitSchema),
  saveRestore: endpoint("POST", "/api/me/save-profiles/{id}/restore", z.object({
    params: idParams, body: z.object({ ...head, sourceId: z.string() }),
  }), saveRevisionSchema),
  saveProfileDelete: endpoint("DELETE", "/api/me/save-profiles/{id}", z.object({
    params: idParams, body: z.object(head),
  }), z.object({ ok: z.literal(true) })),
};
