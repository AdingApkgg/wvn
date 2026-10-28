import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
const url = new URL(process.env.WVN_HEALTH_URL),
  status = Number(process.env.WVN_HEALTH_STATUS ?? 200);
const options = {
  timeout: 5000,
  headers: {
    ...(process.env.WVN_HEALTH_HOST
      ? { host: process.env.WVN_HEALTH_HOST }
      : {}),
  },
  ...(url.protocol === "https:"
    ? {
        ca: readFileSync(process.env.WVN_HEALTH_CA_FILE),
        ...(process.env.WVN_HEALTH_SERVERNAME
          ? { servername: process.env.WVN_HEALTH_SERVERNAME }
          : {}),
      }
    : {}),
};
await new Promise((resolve, reject) => {
  const req = (url.protocol === "https:" ? https : http).get(
    url,
    options,
    (res) => {
      res.resume();
      res.on("end", () =>
        res.statusCode === status
          ? resolve()
          : reject(Error("Unexpected health status")),
      );
      res.on("error", reject);
    },
  );
  req.on("timeout", () => req.destroy(Error("Health timeout")));
  req.on("error", reject);
});
