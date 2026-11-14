import { savesContract } from "../api/contracts/saves";
import { registerJsonRoute } from "../api/route.server";
import type { AccountService } from "./service.server.ts";
import { AccountError } from "./errors.server.ts";
export function mountSaves({
  app,
  config,
  db,
  player,
  saves,
  library,
  withLock,
  sharing,
}: AccountService) {
  registerJsonRoute(app, savesContract.cloudOptions, (c) =>
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
  registerJsonRoute(app, savesContract.saveProfilesList, async (c) => {
    const { session } = await player(c);
    return c.json((await saves.profiles(session.user.id, c.req.query("versionId"), c.req.query("engineReleaseId"))));
  });
  registerJsonRoute(app, savesContract.saveProfileCreate, async (c) => {
    const { session } = await player(c);
    const { versionId, engineReleaseId } = await c.req.json();
    if(engineReleaseId !== undefined && !config.engineCloud?.some(b=>b.versionId===versionId && b.releaseId===engineReleaseId)) throw new AccountError(400,"ENGINE_NOT_COMPATIBLE");
    if (
      !(await library.currentCatalog()).some((w) => w.versions.some((v) => v.id === versionId))
    )
      throw new AccountError(404, "VERSION_NOT_FOUND");
    return c.json((await saves.createProfile(session.user.id, versionId,engineReleaseId)), 201);
  });
  registerJsonRoute(app, savesContract.saveHistory, async (c) => {
    const { session } = await player(c);
    return c.json(
      (await saves.historyPage(
        session.user.id,
        c.req.param("id")!,
        c.req.query("cursor"),
      )),
    );
  });
  registerJsonRoute(app, savesContract.saveUploadReserve, async (c) => {
    const { session } = await player(c);
    return c.json(
      await saves.reserve(session.user.id, c.req.param("id")!, await c.req.json()),
    );
  });
  app.put("/api/me/uploads/:id/files/:file", async (c) => {
    const { session } = await withLock(async () => (await player(c)));
    if (!c.req.raw.body) throw new AccountError();
    await saves.write(
      session.user.id,
      c.req.param("id")!,
      c.req.param("file")!,
      c.req.raw.body,
      async (fn) =>
        (await withLock(async () => {
          const current = await player(c);
          if (current.session.user.id !== session.user.id)
            throw new AccountError(409, "IDENTITY_CHANGED");
          return fn();
        })),
    );
    return c.json({ ok: true });
  });
  registerJsonRoute(app, savesContract.saveUploadCommit, async (c) => {
    const { session } = await player(c);
    const result = await saves.commit(session.user.id, c.req.param("id")!);
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
      c.req.param("id")!,
      c.req.param("rev")!,
      name,
    );
    c.header("Content-Type", "application/octet-stream");
    c.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name.split("/").at(-1) ?? "save.bin")}`,
    );
    return c.body(new Uint8Array(bytes));
  });
  registerJsonRoute(app, savesContract.saveRestore, async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    return c.json(
      await saves.restore(
        session.user.id,
        c.req.param("id")!,
        body.sourceId,
        body.expectedHead,
        body.generation,
      ),
    );
  });
  registerJsonRoute(app, savesContract.saveProfileDelete, async (c) => {
    const { session } = await player(c);
    const body = await c.req.json();
    (await saves.remove(
      session.user.id,
      c.req.param("id")!,
      body.expectedHead,
      body.generation,
    ));
    return c.json({ ok: true });
  });
}
