import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { resolve, relative, sep, extname, isAbsolute } from "node:path";
import { Readable } from "node:stream";
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
export function insideRoot(
  base: string,
  target: string,
  paths = { relative, isAbsolute, sep },
) {
  const rel = paths.relative(base, target);
  return (
    !paths.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + paths.sep)
  );
}
export async function fileResponse(
  req: Request,
  root: string,
  path: string,
  namespace?: string,
): Promise<Response> {
  try {
    const decoded = decodeURIComponent(path);
    if (
      /[\\%\u0000-\u001f]/.test(decoded) ||
      decoded
        .split("/")
        .some((x) => x === "." || x === ".." || x.startsWith(".")) ||
      /\.(?:ps1|py|exe|sqlite|db|env)$/i.test(decoded)
    )
      return new Response(null, { status: 404 });
    const base = await realpath(root);
    const candidate = resolve(
      base,
      "." + (decoded.startsWith("/") ? decoded : "/" + decoded),
    );
    const real = await realpath(candidate);
    if (!insideRoot(base, real) || resolve(real) === base)
      return new Response(null, { status: 404 });
    if (namespace) {
      const bound = await realpath(resolve(base, "." + namespace));
      if (!insideRoot(base, bound) || !insideRoot(bound, real))
        return new Response(null, { status: 404 });
    }
    const info = await stat(real);
    if (!info.isFile()) return new Response(null, { status: 404 });
    const headers = new Headers({
      "content-type":
        mime[extname(real).toLowerCase()] ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "content-length": String(info.size),
      "cache-control":
        extname(real) === ".html" ? "no-cache" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    let start = 0,
      end = info.size - 1,
      status = 200;
    const range = req.headers.get("range");
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2]))
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${info.size}` },
        });
      if (!m[1]) {
        const tail = Number(m[2]);
        start = Math.max(0, info.size - tail);
        if (!tail) start = info.size;
      } else {
        start = Number(m[1]);
        if (m[2]) end = Math.min(end, Number(m[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size
      )
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${info.size}` },
        });
      status = 206;
      headers.set("content-range", `bytes ${start}-${end}/${info.size}`);
      headers.set("content-length", String(end - start + 1));
    }
    if (req.method === "HEAD" || info.size === 0)
      return new Response(null, { status, headers });
    const stream = createReadStream(real, { start, end });
    req.signal.addEventListener("abort", () => stream.destroy(), {
      once: true,
    });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status,
      headers,
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
