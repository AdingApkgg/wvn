import type { Hono } from "hono";
import { z } from "zod";
import type { Store } from "../server/store.ts";
import { ClassificationConflict } from "./classification.server.ts";
import type { WorkClassification, VersionClassification, MediaClassification } from "./types.ts";

const update = z.object({
  kind: z.enum(["work", "version", "image"]),
  id: z.string().min(1).max(500),
  expectedRevision: z.number().int().nonnegative(),
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  payload: z.unknown(),
}).strict().superRefine((body, context) => {
  if (body.kind === "work" && !body.expectedFingerprint)
    context.addIssue({ code: "custom", path: ["expectedFingerprint"], message: "页面审核必须提交所见文案的指纹" });
});

/** 仅挂载于已有登录与 Origin 中间件之后的私有管理监听器。 */
export function registerContentClassificationAdmin(app: Hono, store: Store) {
  const path = "/api/manage/content-classification";
  app.get(path, async c => {
    c.header("Cache-Control", "private, no-store");
    return c.json(await store.classifications.reviewList());
  });
  app.patch(path, async c => {
    c.header("Cache-Control", "private, no-store");
    const body = update.parse(await c.req.json());
    try {
      // 分类修订和审核快照分别检查；指纹只能校验已有快照，不能替客户端重绑当前文案。
      const payload = body.payload as Omit<WorkClassification | VersionClassification | MediaClassification, "revision">;
      return c.json(await store.classifications.set(body.kind, body.id, body.expectedRevision, payload, body.expectedFingerprint));
    } catch (error) {
      if (error instanceof ClassificationConflict)
        return c.json({ error: error.message, code: error.code }, 409);
      throw error;
    }
  });
}
