import { getConnInfo } from "@hono/node-server/conninfo";
import { randomUUID } from "node:crypto";
import type { AccountService } from "./service.server.ts";
import { AccountError } from "./errors.server.ts";
import type { SaveFile } from "./saves.server.ts";
import { zipFiles } from "./share-zip.server.ts";
import { TransferBudget } from "./share-transfer.server.ts";
export function mountShares(service: AccountService) {
  const { app, player, sharing, claims, withLock } = service;
  if (!sharing || !claims) return;
  const budget = new TransferBudget();
  const peer = (c: Parameters<typeof player>[0]) => {
    try {
      return getConnInfo(c).remote.address ?? "127.0.0.1";
    } catch {
      return "127.0.0.1";
    }
  };
  app.use("/api/public/*", async (_c, next) => {
    await sharing.catalog.refresh();
    return next();
  });
  app.get("/api/public/works/:work/save-shares", (c) =>
    c.json(
      sharing.listPublic(
        c.req.param("work"),
        c.req.query("versionId"),
        c.req.query("cursor"),
        c.req.query("progress"),
      ),
    ),
  );
  app.get("/api/public/save-shares/:id", (c) => {
    const row = sharing.row(c.req.param("id"));
    if (row.mode !== "public") throw new AccountError(404, "SHARE_UNAVAILABLE");
    return c.json(sharing.inspect(c.req.param("id")));
  });
  app.post("/api/share-links/:id/inspect", async (c) => {
    sharing.limit("inspect:" + peer(c), 120, 600_000);
    sharing.limit("inspect-global", 3000, 600_000);
    await sharing.catalog.refresh();
    const body = await c.req.json();
    return c.json(sharing.inspect(c.req.param("id"), body.secret));
  });
  app.get("/api/me/save-shares", async (c) => {
    const { session } = await player(c);
    await sharing.catalog.refresh().catch(() => {});
    return c.json(sharing.listOwn(session.user.id, c.req.query("cursor")));
  });
  app.post("/api/me/save-shares", async (c) => {
    const { session } = await player(c, true);
    await sharing.catalog.refresh(true);
    return c.json(sharing.create(session.user.id, await c.req.json()), 201);
  });
  app.patch("/api/me/save-shares/:id", async (c) => {
    const { session } = await player(c, true),
      b = await c.req.json();
    await sharing.catalog.refresh(true);
    sharing.edit(session.user.id, c.req.param("id"), b.revision, b);
    return c.json({ ok: true });
  });
  app.post("/api/me/save-shares/:id/revoke", async (c) => {
    const { session } = await player(c, true);
    sharing.revoke(session.user.id, c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/me/share-claims", async (c) => {
    const { session } = await withLock(() => player(c));
    const release = budget.acquire(session.user.id, peer(c));
    try {
      await sharing.catalog.refresh(true);
      return c.json(
        await claims.claim(
          session.user.id,
          async () => {
            const current = await player(c);
            if (current.session.user.id !== session.user.id)
              throw new AccountError(409, "IDENTITY_CHANGED");
          },
          await c.req.json(),
          withLock,
        ),
      );
    } finally {
      release();
    }
  });
  app.get("/api/me/share-claims/:request", async (c) => {
    const { session } = await player(c);
    return c.json(claims.status(session.user.id, c.req.param("request")));
  });
  app.post("/api/me/share-reports", async (c) => {
    const { session } = await player(c);
    const b = await c.req.json();
    await sharing.catalog.refresh();
    sharing.report(session.user.id, b.shareId, b.secret, b.reason);
    return c.json({ ok: true });
  });
  app.post("/api/me/share-downloads", async (c) => {
    const { session } = await withLock(() => player(c)),
      input = await c.req.json();
    await sharing.catalog.refresh(true);
    const release = budget.acquire(session.user.id, peer(c));
    let owner = "",
      lease = "";
    try {
      const view = await withLock(() => {
        const source = sharing.authorize(input.shareId, input.secret);
        owner = String(source.owner);
        const files = JSON.parse(String(source.files)) as SaveFile[];
        lease = sharing.leaseDownload(owner, files);
        return sharing.inspect(input.shareId, input.secret);
      });
      const selected =
        input.name === undefined
          ? view.files
          : view.files.filter((f) => f.name === input.name);
      if (!selected.length) throw new AccountError(404, "NOT_FOUND");
      const check = async () => {
        await sharing.catalog.refresh();
        await withLock(async () => {
          const current = await player(c);
          if (
            current.session.user.id !== session.user.id ||
            c.req.raw.signal.aborted
          )
            throw new AccountError(409, "IDENTITY_CHANGED");
          sharing.authorize(input.shareId, input.secret);
        });
      };
      async function* files() {
        if (input.name === undefined)
          yield {
            name: "manifest.json",
            bytes: Buffer.from(
              JSON.stringify({
                format: "wg-shared-save-v1",
                work: view.work,
                version: view.version,
                compatibility: view.compatibility,
                files: view.files,
              }),
            ),
          };
        for (const file of selected) {
          await check();
          yield {
            name: "files/" + file.name,
            bytes: sharing!.saves.readBlob(owner, file),
          };
        }
      }
      const chunks =
        input.name === undefined
          ? zipFiles(files())
          : (async function* () {
              for await (const f of files())
                for (let p = 0; p < f.bytes.length; p += 65536)
                  yield f.bytes.subarray(p, p + 65536);
            })();
      let finished = false;
      const cleanup = async () => {
        if (finished) return;
        finished = true;
        await withLock(() => sharing.releaseDownload(lease));
        release();
      };
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            await check();
            const item = await chunks.next();
            if (item.done) {
              controller.close();
              await cleanup();
            } else {
              await budget.pace(item.value.byteLength);
              controller.enqueue(item.value);
            }
          } catch (error) {
            controller.error(error);
            await cleanup();
          }
        },
        async cancel() {
          await chunks.return(undefined);
          await cleanup();
        },
      });
      c.header(
        "Content-Type",
        input.name === undefined
          ? "application/zip"
          : "application/octet-stream",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(input.name === undefined ? "WG-存档分享.zip" : selected[0].name.split("/").at(-1)!)}`,
      );
      return c.body(body);
    } catch (e) {
      if (lease) await withLock(() => sharing.releaseDownload(lease));
      release();
      throw e;
    }
  });
}
