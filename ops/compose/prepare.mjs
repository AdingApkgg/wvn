import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
// 只初始化明确属于 Compose 的新目录；重新运行不轮换密钥或覆盖数据库。
const root = resolve(process.argv[2] ?? "state/compose"),
  marker = join(root, ".wvn-compose-state");
const required = [
  "compose.env",
  "secrets/account-secret",
  "secrets/b2-secret",
  "secrets/blob-token",
  "secrets/tls.key",
  "secrets/tls.crt",
  "analytics/admin.json",
];
if (existsSync(root)) {
  if (lstatSync(root).isSymbolicLink())
    throw Error("Compose state must not be a symbolic link");
  if (existsSync(marker)) {
    if (
      JSON.parse(readFileSync(marker, "utf8")).schema !== 1 ||
      required.some((name) => !existsSync(join(root, name)))
    )
      throw Error(
        "Existing Compose state is incomplete; no secrets were regenerated",
      );
    console.log(JSON.stringify({ status: "preserved", directory: root }));
    process.exit(0);
  }
  if (readdirSync(root).length)
    throw Error("Refusing to initialize an unrelated nonempty directory");
}
mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);
for (const name of [
  "secrets",
  "analytics",
  "catalog",
  "web",
  "b2",
  "manager",
  "blobs",
  "resources",
  "media",
  "player-media",
  "b2-config",
  "reports",
])
  mkdirSync(join(root, name), { mode: 0o700 });
const put = (name, text, mode = 0o600) =>
  writeFileSync(join(root, name), text, { flag: "wx", mode });
for (const name of ["account-secret", "b2-secret", "blob-token"])
  put("secrets/" + name, randomBytes(48).toString("base64url"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(root, "secrets/tls.key"),
    "-out",
    join(root, "secrets/tls.crt"),
    "-days",
    "30",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
chmodSync(join(root, "secrets/tls.key"), 0o600);
chmodSync(join(root, "secrets/tls.crt"), 0o600);
const analytics = {
  username: "admin",
  password: randomBytes(40).toString("base64url"),
  websiteId: randomUUID(),
};
put("analytics/admin.json", JSON.stringify(analytics));
const values = {
  WVN_COMPOSE_PROJECT: "wvn-compose-preview",
  WVN_STATE_ROOT: root,
  WVN_UID: process.getuid?.() ?? 1000,
  WVN_GID: process.getgid?.() ?? 1000,
  WVN_DEPLOYMENT_MODE: "preview",
  WVN_REVISION: "compose-preview",
  WVN_WEB_PORT: 18891,
  WVN_MANAGER_PORT: 18892,
  WVN_ADMIN_PORT: 18893,
  WVN_SHARE_ADMIN_PORT: 18894,
  WVN_B2_PORT: 18895,
  WVN_RESOURCE_PORT: 18896,
  WVN_BLOB_PORT: 18897,
  WVN_B2_SHARE_ADMIN_PORT: 18898,
  WVN_ANALYTICS_PORT: 18961,
  WVN_RESOURCE_ROOT: join(root, "resources"),
  WVN_MEDIA_ROOT: join(root, "media"),
  WVN_B2_CONFIG_ROOT: join(root, "b2-config"),
  WVN_RESOURCE_UPSTREAM: "",
  WVN_TAILSCALE_IP: "",
  WVN_STORAGE_CLIENTS: "",
  WVN_BUILD_PROXY: "",
  WVN_RUNTIME_PROXY: "",
  WVN_UMAMI_WEBSITE_ID: analytics.websiteId,
  WVN_UMAMI_INTERNAL_URL: "http://127.0.0.1:18961",
  POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  UMAMI_DB_PASSWORD: randomBytes(32).toString("hex"),
  UMAMI_APP_SECRET: randomBytes(48).toString("hex"),
};
// Compose 的单引号值不做变量插值；目录中的 $ 或空格也不能改变配置含义。
const quote = (value) => "'" + String(value).replaceAll("'", "\\'") + "'";
put(
  "compose.env",
  Object.entries(values)
    .map(([key, value]) => key + "=" + quote(value))
    .join("\n") + "\n",
);
put(
  ".wvn-compose-state",
  JSON.stringify({ schema: 1, createdAt: new Date().toISOString() }),
);
console.log(
  JSON.stringify({
    status: "prepared",
    directory: root,
    secretsPrinted: false,
  }),
);
