import { execFileSync, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
// 使用 Compose 自己解析私有 env；只把构建字段交给 Buildx，不导出服务秘密。
const envFile = resolve(process.argv[2] ?? "state/compose/compose.env");
const model = JSON.parse(
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      envFile,
      "--profile",
      "qa",
      "config",
      "--format",
      "json",
    ],
    { encoding: "utf8" },
  ),
);
const allowed = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "NODE_IMAGE",
  "QA_BASE_IMAGE",
]);
const targets = process.argv.slice(3);
if (targets.some((name) => !["web", "browser"].includes(name)))
  throw Error("Build targets must be web or browser");
for (const name of targets.length ? targets : ["web", "browser"]) {
  const service = model.services[name],
    build = service?.build;
  if (!build || !service.image)
    throw Error("Compose image build configuration is incomplete");
  if (!build.args?.HTTPS_PROXY)
    throw Error("Set WVN_BUILD_PROXY to the build host existing proxy");
  const entitlements = build.entitlements ?? [];
  if (entitlements.some((value) => value !== "network.host"))
    throw Error("Unexpected build entitlement");
  const args = [
    "buildx",
    "build",
    "--load",
    "--progress=plain",
    "--network",
    build.network ?? "default",
    "--target",
    build.target,
    "--tag",
    service.image,
    "--file",
    join(build.context, build.dockerfile ?? "Dockerfile"),
  ];
  for (const value of entitlements) args.push("--allow", value);
  const env = { ...process.env };
  for (const [key, value] of Object.entries(build.args ?? {})) {
    if (!allowed.has(key)) throw Error("Unexpected image build argument");
    env[key] = String(value);
    args.push("--build-arg", key);
  }
  args.push(build.context);
  const result = spawnSync("docker", args, { env, stdio: "inherit" });
  if (result.status !== 0) throw Error("Image build failed: " + name);
  console.log(
    JSON.stringify({ service: name, image: service.image, status: "built" }),
  );
}
