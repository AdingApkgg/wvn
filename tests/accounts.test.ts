import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountService } from "../src/accounts/service.server.ts";
const config = {
  origin: "https://accounts.wg.test",
  database: ":memory:",
  secret: "test-only-secret-with-at-least-48-random-ish-characters",
};
test("account listener exposes Passkey only and protects private data", async () => {
  const service = await createAccountService(config);
  try {
    const options = await service.app.request(
      config.origin + "/api/login-options",
    );
    assert.equal(options.status, 200);
    assert.deepEqual(await options.json(), {
      passkey: true,
      signup: "open",
      mode: "preview",
      isolated: false,
      password: false,
    });
    const me = await service.app.request(config.origin + "/api/me");
    assert.equal(me.status, 401);
    assert.match(me.headers.get("cache-control") ?? "", /no-store/);
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/sign-up/email",
      "/api/auth/request-password-reset",
    ]) {
      assert.equal(
        (
          await service.app.request(config.origin + path, {
            method: "POST",
            headers: {
              origin: config.origin,
              "content-type": "application/json",
            },
            body: "{}",
          })
        ).status,
        404,
      );
    }
  } finally {
    service.close();
  }
});
test("game origin and unexpected hosts cannot write account state", async () => {
  const service = await createAccountService(config);
  try {
    const response = await service.app.request(
      config.origin + "/api/recovery/start",
      {
        method: "POST",
        headers: {
          origin: "https://wg.saop.cc",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(response.status, 403);
    assert.equal(
      (await service.app.request("https://other.test/api/login-options"))
        .status,
      421,
    );
  } finally {
    service.close();
  }
});
test("account startup rejects weak secrets and non-HTTPS origins", async () => {
  await assert.rejects(() =>
    createAccountService({ ...config, secret: "short" }),
  );
  await assert.rejects(() =>
    createAccountService({ ...config, origin: "http://untrusted.example" }),
  );
});

test("registration needs only a nickname and never a configured invitation", async () => {
  const service = await createAccountService(config);
  try {
    const path = config.origin + "/api/auth/passkey/generate-register-options?context=" + encodeURIComponent(JSON.stringify({nickname:"Open Reader"}));
    const response = await service.app.request(path);
    assert.equal(response.status,200);
    const body = await response.json();
    assert.equal(body.authenticatorSelection.userVerification,"required");
    assert.equal(body.user.name,"Open Reader");
    assert.equal((await service.app.request(config.origin + "/api/auth/passkey/generate-register-options?context=" + encodeURIComponent(JSON.stringify({nickname:""})))).status,400);
  } finally {service.close()}
});
test("open registration retains the database limiter and ignores spoofed client IPs", async () => {
  const service = await createAccountService(config);
  try {
    const path=config.origin+"/api/auth/passkey/generate-register-options?context="+encodeURIComponent(JSON.stringify({nickname:"Limited Reader"}));
    assert.equal((await service.app.request(path)).status,200);
    let limited=false;
    for(let n=0;n<45;n++){
      const response=await service.app.request(path,{headers:{"x-forwarded-for":`192.0.2.${n}`,"cf-connecting-ip":`192.0.2.${n}`,"x-wg-client-ip":`192.0.2.${n}`}});
      if(response.status===429){limited=true;break}
      assert.equal(response.status,200);
    }
    assert(limited,"registration must stay rate limited");
    assert.equal((await service.app.request(path,{headers:{"x-forwarded-for":"198.51.100.99"}})).status,429);
  } finally {service.close()}
});
