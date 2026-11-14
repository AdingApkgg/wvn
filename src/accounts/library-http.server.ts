import { accountContract } from "../api/contracts/account.ts";
import { registerJsonRoute } from "../api/route.server.ts";
import { AccountError } from "./errors.server.ts";
import type { AccountService } from "./service.server.ts";
export function mountLibrary({ app, player, library }: AccountService) {
  registerJsonRoute(app, accountContract.catalogList, async (c) => c.json(await library.currentCatalog()));
  registerJsonRoute(app, accountContract.libraryList, async (c) => {
    const { session } = await player(c);
    return c.json((await library.list(session.user.id)));
  });
  registerJsonRoute(app, accountContract.libraryEdit, async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new AccountError(400, "LIBRARY_INVALID");
    return c.json(
      (await library.edit(session.user.id, c.req.param("id")!, body.revision, {
        status: body.status,
        ...(Object.hasOwn(body, "note") ? { note: body.note } : {}),
      })),
    );
  }, { invalidCode: "LIBRARY_INVALID" });
  registerJsonRoute(app, accountContract.playStart, async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    if (typeof body.versionId !== "string" || typeof body.eventId !== "string")
      throw new AccountError();
    return c.json((await library.start(session.user.id, body.versionId, body.eventId)));
  });
  registerJsonRoute(app, accountContract.playHeartbeat, async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    return c.json(
      (await library.heartbeat(
        session.user.id,
        c.req.param("id")!,
        body.seq,
        body.active,
      )),
    );
  });
}
