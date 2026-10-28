import { AccountError } from "./errors.server.ts";
import type { AccountService } from "./service.server.ts";
export function mountLibrary({ app, player, library }: AccountService) {
  app.get("/api/account-catalog", async (c) => c.json(await library.currentCatalog()));
  app.get("/api/me/library", async (c) => {
    const { session } = await player(c);
    return c.json((await library.list(session.user.id)));
  });
  app.patch("/api/me/library/:id", async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    return c.json(
      (await library.edit(session.user.id, c.req.param("id"), body.revision, {
        status: body.status,
        note: body.note,
      })),
    );
  });
  app.post("/api/me/play-sessions", async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    if (typeof body.versionId !== "string" || typeof body.eventId !== "string")
      throw new AccountError();
    return c.json((await library.start(session.user.id, body.versionId, body.eventId)));
  });
  app.post("/api/me/play-sessions/:id/heartbeat", async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    return c.json(
      (await library.heartbeat(
        session.user.id,
        c.req.param("id"),
        body.seq,
        body.active,
      )),
    );
  });
}
