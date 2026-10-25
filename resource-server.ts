import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { registerOnsPilot } from './src/ons/http.server.ts';
import { registerOtherPlayers } from './src/player/http.server.ts';
import { isPublicGamePath } from './src/player/remote.server.ts';
import { readFileSync } from 'node:fs';
import { createBlobApp } from './src/accounts/blob-remote.server.ts';

const root = process.env.WG_RESOURCE_ROOT;
const bind = process.env.WG_RESOURCE_BIND;
const port = Number(process.env.WG_RESOURCE_PORT ?? 18571);
if (!root || !bind || !/^100\.(?:\d{1,3}\.){2}\d{1,3}$/.test(bind) || !Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Explicit resource root and Tailscale listener required');
const clients = new Set((process.env.WG_RESOURCE_CLIENTS ?? '').split(',').filter(Boolean));
if (!clients.size) throw Error('Explicit resource clients required');
const resources = new Hono();
registerOnsPilot(resources, root);
registerOtherPlayers(resources, root);
const app = new Hono();
app.all('*', async c => {
  const peer = getConnInfo(c).remote.address?.replace(/^::ffff:/, '');
  if (!peer || !clients.has(peer)) return c.body(null, 403);
  if (!isPublicGamePath(c.req.path)) return c.notFound();
  if (!['GET', 'HEAD'].includes(c.req.method)) return c.body(null, 405);
  const url = new URL(c.req.url);
  url.protocol = 'https:'; url.host = 'wg.saop.cc'; url.port = '';
  const headers = new Headers();
  for (const key of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
    const value = c.req.header(key); if (value) headers.set(key, value);
  }
  const response = await resources.fetch(new Request(url, { method: c.req.method, headers, signal: c.req.raw.signal }));
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return response;
});
const server = serve({ fetch: app.fetch, hostname: bind, port });
const blobApp = process.env.WG_BLOB_ROOT ? createBlobApp({ root: process.env.WG_BLOB_ROOT, token: readFileSync(process.env.WG_BLOB_TOKEN_FILE!, 'utf8').trim() }) : null;
const privateApp = new Hono();
privateApp.all('*', c => {
  const peer = getConnInfo(c).remote.address?.replace(/^::ffff:/, '');
  if (!peer || !clients.has(peer) || !blobApp) return c.body(null, 403);
  return blobApp.fetch(c.req.raw);
});
const blobServer = blobApp ? serve({ fetch: privateApp.fetch, hostname: bind, port: Number(process.env.WG_BLOB_PORT ?? 18572) }) : null;
process.on('SIGTERM', () => { blobServer?.close(); server.close(() => process.exit(0)); });
