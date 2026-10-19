import type { Page } from "@playwright/test";
export async function authenticator(page: Page, verified = true) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: verified ? "internal" : "usb",
        hasResidentKey: true,
        hasUserVerification: verified,
        isUserVerified: verified,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { cdp, id: authenticatorId };
}
export async function register(
  page: Page,
  nickname: string,
  invite = process.env.WG_ACCOUNT_TEST_INVITE ?? "test-invite",
  relaxUV = false,
) {
  return page.evaluate(
    async ({ nickname, invite, relaxUV }) => {
      const me = await fetch("/api/me");
      const current = me.ok ? await me.json() : null;
      const q = encodeURIComponent(JSON.stringify({ nickname, invite }));
      const options = await fetch(
        "/api/auth/passkey/generate-register-options?context=" + q,
        { headers: current ? { "x-wg-binding": current.binding } : {} },
      );
      if (!options.ok) return { status: options.status };
      const json = await options.json();
      const decode = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        );
      if (relaxUV) json.authenticatorSelection.userVerification = "discouraged";
      json.challenge = decode(json.challenge);
      json.user.id = decode(json.user.id);
      json.excludeCredentials = json.excludeCredentials.map(
        (c: { id: string }) => ({ ...c, id: decode(c.id) }),
      );
      const credential = (await navigator.credentials.create({
        publicKey: json,
      })) as PublicKeyCredential;
      const response = await fetch("/api/auth/passkey/verify-registration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response: credential.toJSON(),
          createSession: true,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { nickname, invite, relaxUV },
  );
}
export async function login(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch(
      "/api/auth/passkey/generate-authenticate-options",
    );
    const json = await response.json();
    const decode = (v: string) =>
      Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      );
    json.challenge = decode(json.challenge);
    json.userVerification = "required";
    if (json.allowCredentials)
      json.allowCredentials = json.allowCredentials.map(
        (c: { id: string }) => ({ ...c, id: decode(c.id) }),
      );
    const credential = (await navigator.credentials.get({
      publicKey: json,
    })) as PublicKeyCredential;
    const result = await fetch("/api/auth/passkey/verify-authentication", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: credential.toJSON() }),
    });
    return result.status;
  });
}
export async function api(
  page: Page,
  path: string,
  body?: unknown,
  method?: string,
) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const me = await fetch("/api/me");
      const current = me.ok ? await me.json() : null;
      const response = await fetch(path, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          "content-type": "application/json",
          ...(current ? { "x-wg-binding": current.binding } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body, method },
  );
}
