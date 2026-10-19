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
    const change = db
      .prepare("UPDATE passkey SET name=? WHERE userId=? AND id=?")
      .run(name.trim(), session.user.id, c.req.param("id"));
    if (!change.changes) throw new AccountError(404, "NOT_FOUND");
    return c.json({ ok: true });
  });
  app.get("/api/me/export", async (c) => {
    const { session } = await player(c, true);
    return c.json({
      format: "wg-account-export-v1",
      exportedAt: new Date().toISOString(),
      user: { id: session.user.id, name: session.user.name },
      library: library.list(session.user.id),
      saveProfiles:
        saves?.profiles(session.user.id).map((p) => ({
          ...p,
          revisions: saves.history(session.user.id, p.id),
        })) ?? [],
      playSessions: db
        .prepare(
          "SELECT id,work_id,version_id,started_at,seconds FROM wg_plays WHERE user_id=?",
        )
        .all(session.user.id),
    });
  });
  db.exec(
    "CREATE TABLE IF NOT EXISTS wg_deleted_accounts(user_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL)",
  );
  app.delete("/api/me", async (c) => {
    const { session } = await player(c, true);
    const body = await c.req.json();
    if (body.confirmation !== "DELETE")
      throw new AccountError(400, "CONFIRMATION_REQUIRED");
    const cookie = (await auth.$context).authCookies.sessionToken;
    const deletedAt = deletions.record(session.user.id);
    db.exec("BEGIN IMMEDIATE");
    try {
      deleteAccountRows(db, saves, session.user.id, deletedAt);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    deleteCookie(c, cookie.name, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    return c.json({ ok: true });
  });
}
