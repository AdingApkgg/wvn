import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { createBlobApp } from './src/accounts/blob-remote.server.ts';

const bind = process.env.WG_BLOB_BIND ?? '';
const octets = bind.split('.').map(Number);
const port = Number(process.env.WG_BLOB_PORT);
const root = process.env.WG_BLOB_ROOT;
const tokenFile = process.env.WG_BLOB_TOKEN_FILE;
const clients = new Set((process.env.WG_BLOB_CLIENTS ?? '').split(',').filter(Boolean));
if (isIP(bind) !== 4 || octets[0] !== 100 || octets[1] < 64 || octets[1] > 127 ||
    !Number.isInteger(port) || port < 1024 || port > 65535 || !root || !tokenFile ||
    !clients.size || [...clients].some(client => isIP(client) !== 4))
  throw Error('Explicit private Tailscale blob listener and clients required');
if (process.platform === 'win32' && !/^H:[\\/]/i.test(root))
  throw Error('Windows save storage must remain on H drive');
const blobs = createBlobApp({ root, token: readFileSync(tokenFile, 'utf8').trim() });
const app = new Hono();
app.all('*', c => {
  const peer = getConnInfo(c).remote.address?.replace(/^::ffff:/, '');
  if (!peer || !clients.has(peer)) return c.body(null, 403);
  return blobs.fetch(c.req.raw);
});
const server = serve({ fetch: app.fetch, hostname: bind, port });
if ('requestTimeout' in server) server.requestTimeout = 300_000;
if ('headersTimeout' in server) server.headersTimeout = 10_000;
server.setTimeout(60_000);
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
});
