import { findPlayer as findPilot } from "../player/registry.mjs";
export const limits = Object.freeze({ files: 512, fileBytes: 32 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 });
export function validPath(path) {
  return typeof path === "string" && path.length > 0 && path.length <= 240 &&
    !/[\\%:#?\u0000-\u001f\u007f]/u.test(path) &&
    path.split("/").every(p => p && p !== "." && p !== ".." && !p.startsWith(".")) &&
    !/\.(?:html?|[cm]?js|wasm|svg|exe|ps1|py)$/i.test(path);
}
function checkSnapshot(value, pilot, copy) {
  if (!value || value.schema !== 1 || !findPilot(pilot) || value.pilot !== pilot || !Array.isArray(value.files) || value.files.length > limits.files) throw Error("存档版本或文件数量无效");
  let total = 0;
  const names = new Set();
  const files = value.files.map(f => {
    if (!f || !validPath(f.path) || names.has(f.path.toLowerCase()) || !(f.data instanceof Uint8Array) || f.data.byteLength > limits.fileBytes) throw Error("存档路径、文件内容或大小无效");
    if (f.mtime !== undefined && (!Number.isSafeInteger(f.mtime) || f.mtime < 0 || f.mtime > 8640000000000000)) throw Error("存档日期无效");
    names.add(f.path.toLowerCase()); total += f.data.byteLength;
    if (total > limits.totalBytes) throw Error("存档超过 64 MiB");
    return { path: f.path, data: copy ? new Uint8Array(f.data) : f.data, ...(f.mtime === undefined ? {} : { mtime: f.mtime }) };
  });
  return { schema: 1, pilot, files };
}
export function validateSnapshot(value, pilot) { return checkSnapshot(value, pilot, true); }
export async function snapshotDigest(snapshot) {
  // WebCrypto在调用时复制BufferSource；首次await前提交全部文件，保留调用时字节语义，
  // 避免仅为计算摘要再次复制整份快照。入口校验仍返回独立的存档字节。
  const value = checkSnapshot(snapshot, snapshot?.pilot, false);
  const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
  const entries = await Promise.all(value.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => {
    const path = file.path, bytes = file.data.byteLength, mtime = file.mtime;
    return crypto.subtle.digest("SHA-256", file.data).then(hash => [path, bytes, hex(hash), ...(mtime === undefined ? [] : [mtime])]);
  }));
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([1, value.pilot, entries]))));
}
