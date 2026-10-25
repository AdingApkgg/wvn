import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { LocalBlobStore, type BlobStore } from './blob-store.server.ts';
import { AccountError } from './errors.server.ts';
export class RemoteBlobStore implements BlobStore {
  constructor(private origin: string, private token: string, private fetcher: typeof fetch = fetch) {
    const u = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin || u.username || u.password || !/^[a-zA-Z0-9_-]{64}$/.test(token)) throw Error('Invalid private blob service configuration');
  }
  private async request(path: string, init?: RequestInit) {
    try {
      const r = await this.fetcher(this.origin + path, { ...init, headers: { Authorization: 'Bearer ' + this.token }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!r.ok) {
        const code = (await r.json().catch(() => ({})))?.code;
        throw new AccountError(r.status === 507 ? 507 : 503, code === 'SPACE_STOP' ? code : code === 'FILE_CORRUPT' ? code : 'STORAGE_UNAVAILABLE');
      }
      return r;
    } catch (e) { if (e instanceof AccountError) throw e; throw new AccountError(503, 'STORAGE_UNAVAILABLE'); }
  }
  private key(owner: string, hash: string) { if (!/^[a-f0-9]{64}$/.test(owner) || !/^[a-f0-9]{64}$/.test(hash)) throw new AccountError(); return '/blobs/' + owner + '/' + hash; }
  async free() {
    const n = (await (await this.request('/space')).json()).freeBytes;
    if (!Number.isSafeInteger(n) || n < 0) throw new AccountError(503, 'STORAGE_UNAVAILABLE'); return n;
  }
  async read(owner: string, hash: string) {
    const r = await this.request(this.key(owner, hash));
    const reader = r.body?.getReader(); if (!reader) throw new AccountError(503, 'STORAGE_UNAVAILABLE');
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 32 * 1024 ** 2) throw new AccountError(503, 'FILE_CORRUPT'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  }
  async write(owner: string, hash: string, bytes: Uint8Array) { await this.request(this.key(owner, hash), { method: 'PUT', body: new Uint8Array(bytes) }); }
  async remove(owner: string, key: string) {
    // Request parts stay inside the storage service; only final known blobs cross machines.
    if (key.endsWith('.upload')) return;
    await this.request(this.key(owner, key.replace(/\.bin$/, '')), { method: 'DELETE' });
  }
}
export function createBlobApp(options: { root: string; token: string; free?: () => number }) {
  if (options.token.length !== 64) throw Error('Private blob token required');
  const store = new LocalBlobStore(options.root, options.free), app = new Hono(); let writes = 0;
  app.use('*', async (c, next) => {
    const candidate = Buffer.from(c.req.header('authorization') ?? ''), expected = Buffer.from('Bearer ' + options.token);
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return c.json({ code: 'UNAUTHORIZED' }, 401);
    c.header('Cache-Control', 'no-store'); return next();
  });
  app.onError((e, c) => c.json({ code: e instanceof AccountError ? e.code : 'STORAGE_UNAVAILABLE' }, e instanceof AccountError ? e.status as 400 : 503));
  app.get('/space', async c => c.json({ freeBytes: await store.free() }));
  app.all('/blobs/:owner/:hash', async c => {
    const { owner, hash } = c.req.param();
    if (!/^[a-f0-9]{64}$/.test(owner) || !/^[a-f0-9]{64}$/.test(hash)) return c.notFound();
    if (c.req.method === 'GET') {
      try { return c.body(new Uint8Array(await store.read(owner, hash)), 200, { 'Content-Type': 'application/octet-stream' }); }
      catch { return c.json({ code: 'FILE_UNAVAILABLE' }, 503); }
    }
    if (c.req.method === 'DELETE') { await store.remove(owner, hash + '.bin'); return c.json({ ok: true }); }
    if (c.req.method !== 'PUT') return c.body(null, 405);
    if (writes >= 4) return c.json({ code: 'BUSY' }, 429);
    writes++;
    try {
      if (await store.free() < 62 * 1024 ** 3) throw new AccountError(507, 'SPACE_STOP');
      if (!c.req.raw.body) throw new AccountError();
      const parts: Uint8Array[] = []; let size = 0;
      for await (const chunk of c.req.raw.body) {
        size += chunk.length; if (size > 32 * 1024 ** 2) throw new AccountError(413, 'FILE_LIMIT');
        if (await store.free() < 62 * 1024 ** 3 + size) throw new AccountError(507, 'SPACE_STOP');
        parts.push(chunk);
      }
      await store.write(owner, hash, Buffer.concat(parts)); return c.json({ ok: true });
    } finally { writes--; }
  });
  return app;
}
