import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
const modulePath = new URL(
    "../ops/compose/init-analytics.mjs",
    import.meta.url,
  ),
  credentials = {
    username: "admin",
    password: "synthetic-private-password-for-compose-test-only",
    websiteId: "e45a5414-3595-41bd-8821-98a36d5b02a3",
  };
async function service(t, initialPassword) {
  const state = {
    password: initialPassword,
    changes: 0,
    created: 0,
    websites: [],
  };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const bytes of req) raw += bytes;
    const data = raw ? JSON.parse(raw) : {};
    let status = 200,
      body = {};
    if (req.url === "/api/auth/login") {
      if (data.password === state.password) body = { token: "synthetic-token" };
      else status = 401;
    } else if (req.headers.authorization !== "Bearer synthetic-token")
      status = 401;
    else if (req.url === "/api/me/password") {
      state.changes++;
      if (data.currentPassword !== state.password) status = 401;
      else state.password = data.newPassword;
    } else if (req.url === "/api/websites" && req.method === "GET")
      body = state.websites;
    else if (req.url === "/api/websites" && req.method === "POST") {
      state.created++;
      state.websites.push({ id: data.id });
      body = { id: data.id };
    } else status = 404;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return { state, origin: "http://127.0.0.1:" + server.address().port };
}
async function bootstrap(...args) {
  assert(
    existsSync(modulePath),
    "Compose analytics bootstrap is not implemented",
  );
  return (await import(modulePath)).bootstrapAnalytics(...args);
}
test("仅新统计实例替换默认密码并建立站点，不返回管理员秘密", async (t) => {
  const { origin, state } = await service(t, "umami"),
    receipt = await bootstrap({ origin, credentials });
  assert.equal(state.changes, 1);
  assert.equal(state.created, 1);
  assert.equal(state.password, credentials.password);
  assert.equal(receipt.defaultPasswordDisabled, true);
  assert(!JSON.stringify(receipt).includes(credentials.password));
});
test("重跑复用现有管理员和站点，不再次改密或重复建站", async (t) => {
  const { origin, state } = await service(t, "umami");
  await bootstrap({ origin, credentials });
  await bootstrap({ origin, credentials });
  assert.equal(state.changes, 1);
  assert.equal(state.created, 1);
});
test("陌生统计实例凭据不符时停止，不尝试覆盖管理员", async (t) => {
  const { origin, state } = await service(t, "unrelated-existing-password");
  await assert.rejects(bootstrap({ origin, credentials }));
  assert.equal(state.changes, 0);
  assert.equal(state.created, 0);
  assert.equal(state.password, "unrelated-existing-password");
});
