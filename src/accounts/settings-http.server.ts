import { deleteAccountRows } from "./deletion.server.ts";
import { deleteCookie } from "hono/cookie";
import type { AccountService } from "./service.server.ts";
import { AccountError } from "./errors.server.ts";
export function mountSettings({
  app,
  db,
  auth,
  player,
  library,
  workStats,
  saves,
  deletions,
}: AccountService) {
  app.patch("/api/me/passkeys/:id", async (c) => {
    const { session } = await player(c);
    const { name } = await c.req.json();
    if (
      typeof name !== "string" ||
      !name.trim() ||
      [...name.trim()].length > 64 ||
      /[\p{Cc}\p{Cf}]/u.test(name)
    )
      throw new AccountError(400, "NAME_INVALID");
    const change = (await db
      .prepare("UPDATE passkey SET name=$1 WHERE \"userId\"=$2 AND id=$3")
      .run(name.trim(), session.user.id, c.req.param("id")));
    if (!change.changes) throw new AccountError(404, "NOT_FOUND");
    return c.json({ ok: true });
  });
  app.get("/api/me/export", async (c) => {
    const { session } = await player(c, true);
    return c.json({
      format: "wg-account-export-v1",
      exportedAt: new Date().toISOString(),
      user: { id: session.user.id, name: session.user.name },
      library: (await library.list(session.user.id)),
      workReactions: (await workStats.export(session.user.id)),
      saveProfiles: saves ? await Promise.all((await saves.profiles(session.user.id)).map(async p => ({
        ...p, revisions: await saves.allHistory(session.user.id, p.id),
      }))) : [],
      playSessions: (await db
        .prepare(
          "SELECT id,work_id,version_id,started_at,seconds FROM wg_plays WHERE user_id=$1",
        )
        .all(session.user.id)),
    });
  });
  app.delete("/api/me", async (c) => {
    const { session } = await player(c, true);
    const body = await c.req.json();
    if (body.confirmation !== "DELETE")
      throw new AccountError(400, "CONFIRMATION_REQUIRED");
    const cookie = (await auth.$context).authCookies.sessionToken;
    const deletedAt = deletions.record(session.user.id);
    await db.transaction(async () => {
      (await deleteAccountRows(db, saves, session.user.id, deletedAt));
      }, { lock: 'wvn:account-write' });
    deleteCookie(c, cookie.name, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    return c.json({ ok: true });
  });
}
