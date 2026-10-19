import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccountService } from "../../src/accounts/service.server.ts";
import { registrationFixture } from "./webauthn.ts";
const origin = "https://accounts.wg.test";
export async function shareHttpFixture() {
  const root = mkdtempSync(join(tmpdir(), "wg-share-http-"));
  const catalog = [
    {
      id: "v4",
      title: "Story",
      url: "/4/",
      versions: [
        {
          id: "version-a",
          title: "Build",
          number: 1,
          engine: "ONS",
          url: "/4/1/",
        },
      ],
    },
  ];
  const service = await createAccountService({
    origin,
    database: ":memory:",
    blobRoot: root,
    secret: "synthetic-test-secret-that-is-at-least-48-characters",
    signupInvite: "test-invite",
    shareLedger: join(root, "revoked.jsonl"),
    catalogProvider: async () => catalog,
    catalog,
  });
  async function register(name: string) {
    const options = await service.app.request(
      origin +
        "/api/auth/passkey/generate-register-options?context=" +
        encodeURIComponent(
          JSON.stringify({ nickname: name, invite: "test-invite" }),
        ),
    );
    const data = await options.json();
    const response = await service.app.request(
      origin + "/api/auth/passkey/verify-registration",
      {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: options.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
        },
        body: JSON.stringify({
          response: registrationFixture(data.challenge, origin, true),
          createSession: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    return response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  return {
    service,
    register,
    async api(path: string, cookie = "", body?: unknown, binding?: string) {
      return service.app.request(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          cookie,
          "content-type": "application/json",
          ...(binding ? { "x-wg-binding": binding } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    },
    close() {
      service.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
