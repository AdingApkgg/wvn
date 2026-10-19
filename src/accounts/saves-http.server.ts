import type { AccountService } from "./service.server.ts";
import { AccountError } from "./errors.server.ts";
export function mountSaves({
  app,
  db,
  player,
  saves,
  library,
  withLock,
  sharing,
}: AccountService) {
  app.get("/api/cloud-options", (c) =>
    c.json({
      manual: !!saves,
      sharing: !!sharing,
      automatic: false,
      maxSnapshotBytes: 64 * 1024 ** 2,
      maxFileBytes: 32 * 1024 ** 2,
      maxFiles: 512,
    }),
  );
  if (!saves) return;
  app.get("/api/me/save-profiles", async (c) => {
    const { session } = await player(c);
    return c.json(saves.profiles(session.user.id, c.req.query("versionId")));
  });
  app.post("/api/me/save-profiles", async (c) => {
    const { session } = await player(c);
    const { versionId } = await c.req.json();
    if (
      !library.catalog.some((w) => w.versions.some((v) => v.id === versionId))
    )
      throw new AccountError(404, "VERSION_NOT_FOUND");
    return c.json(saves.createProfile(session.user.id, versionId), 201);
  });
  app.get("/api/me/save-profiles/:id/revisions", async (c) => {
    const { session } = await player(c);
    return c.json(
      saves.historyPage(
        session.user.id,
        c.req.param("id"),
        c.req.query("cursor"),
      ),
    );
  });
  app.post("/api/me/save-profiles/:id/uploads", async (c) => {
    const { session } = await player(c);
    return c.json(
      saves.reserve(session.user.id, c.req.param("id"), await c.req.json()),
    );
  });
  app.put("/api/me/uploads/:id/files/:file", async (c) => {
    const { session } = await withLock(() => player(c));
    if (!c.req.raw.body) throw new AccountError();
    await saves.write(
      session.user.id,
      c.req.param("id"),
      c.req.param("file"),
      c.req.raw.body,
      (fn) =>
        withLock(async () => {
          const current = await player(c);
          if (current.session.user.id !== session.user.id)
            throw new AccountError(409, "IDENTITY_CHANGED");
          return fn();
        }),
    );
    return c.json({ ok: true });
  });
  app.post("/api/me/uploads/:id/commit", async (c) => {
    const { session } = await player(c);
    const result = saves.commit(session.user.id, c.req.param("id"));
    return c.json(
      { ...result, ...(result.conflict ? { code: "CONTENT_CONFLICT" } : {}) },
      result.conflict ? 409 : 200,
    );
  });
  app.get("/api/me/save-profiles/:id/revisions/:rev/files", async (c) => {
    const { session } = await player(c);
    const name = c.req.query("name") ?? "";
    const bytes = await saves.read(
      session.user.id,
      c.req.param("id"),
      c.req.param("rev"),
      name,
    );
    c.header("Content-Type", "application/octet-stream");
    c.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name.split("/").at(-1) ?? "save.bin")}`,
    );
    return c.body(new Uint8Array(bytes));
  });
  app.post("/api/me/save-profiles/:id/restore", async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    return c.json(
      saves.restore(
        session.user.id,
        c.req.param("id"),
        body.sourceId,
        body.expectedHead,
        body.generation,
      ),
    );
  });
  app.delete("/api/me/save-profiles/:id", async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    saves.remove(
      session.user.id,
      c.req.param("id"),
      body.expectedHead,
      body.generation,
    );
    return c.json({ ok: true });
  });
}
