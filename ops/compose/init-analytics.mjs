import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export async function bootstrapAnalytics({ origin, credentials }) {
  const url = new URL(origin);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !credentials.password ||
    credentials.password === "umami"
  )
    throw Error(
      "Explicit local analytics origin and private credentials are required",
    );
  async function request(method, path, body, token) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
    };
  }
  let login = await request("POST", "/api/auth/login", {
    username: credentials.username,
    password: credentials.password,
  });
  if (login.status !== 200) {
    if (login.status !== 401) throw Error("Analytics login is unavailable");
    const initial = await request("POST", "/api/auth/login", {
      username: "admin",
      password: "umami",
    });
    if (initial.status !== 200 || !initial.data?.token)
      throw Error(
        "Existing analytics credentials differ; no administrator was reset",
      );
    const change = await request(
      "POST",
      "/api/me/password",
      { currentPassword: "umami", newPassword: credentials.password },
      initial.data.token,
    );
    if (change.status !== 200)
      throw Error("Default analytics password replacement failed");
    login = await request("POST", "/api/auth/login", {
      username: credentials.username,
      password: credentials.password,
    });
  }
  if (login.status !== 200 || !login.data?.token)
    throw Error("Private analytics login failed");
  const token = login.data.token;
  const sites = await request("GET", "/api/websites", undefined, token);
  if (sites.status !== 200) throw Error("Analytics websites are unavailable");
  const rows = Array.isArray(sites.data) ? sites.data : sites.data?.data;
  if (!Array.isArray(rows))
    throw Error("Unexpected analytics website response");
  if (!rows.some((row) => row.id === credentials.websiteId)) {
    const created = await request(
      "POST",
      "/api/websites",
      {
        name: "WVN",
        domain: credentials.domain ?? "localhost",
        id: credentials.websiteId,
      },
      token,
    );
    if (created.status !== 200 || created.data?.id !== credentials.websiteId)
      throw Error("Analytics website creation failed");
  }
  if (
    (
      await request("POST", "/api/auth/login", {
        username: "admin",
        password: "umami",
      })
    ).status !== 401 ||
    (await request("GET", "/api/websites")).status !== 401
  )
    throw Error("Analytics management isolation failed");
  return {
    status: "configured",
    websiteId: credentials.websiteId,
    defaultPasswordDisabled: true,
    anonymousManagementStatus: 401,
  };
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const state = process.env.WVN_ANALYTICS_STATE;
  if (!state) throw Error("WVN_ANALYTICS_STATE is required");
  const receipt = await bootstrapAnalytics({
    origin: process.env.WVN_ANALYTICS_ORIGIN,
    credentials: JSON.parse(readFileSync(join(state, "admin.json"), "utf8")),
  });
  writeFileSync(
    join(state, "ready.json"),
    JSON.stringify(
      { ...receipt, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(receipt));
}
