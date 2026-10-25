import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import { isIP } from 'node:net';
import { chromium } from 'playwright';
import { players } from '../public/player/registry.mjs';
import { previewChromiumOptions } from './lib/preview-browser.mjs';
const origin = process.env.WG_SPLIT_URL, report = process.env.WG_SPLIT_REPORT;
const production = process.env.WG_SPLIT_PRODUCTION === '1';
assert(origin && report && (production || process.env.WG_SPLIT_CERT));
if (production) assert.equal(origin, 'https://wg.saop.cc');
fs.mkdirSync(report, { recursive: true });
const options = production ? { executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] } : previewChromiumOptions(process.env.WG_SPLIT_CERT);
options.args.push('--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader');
const connectIP = process.env.WG_SPLIT_CONNECT_IP;
if (connectIP) {
  assert(!production, '正式验收必须经过真实域名');
  assert.equal(isIP(connectIP), 4);
  options.args.push(`--host-resolver-rules=MAP ${new URL(origin).hostname} ${connectIP}`);
}
options.proxy = { server: 'http://127.0.0.1:11090', bypass: 'localhost,127.0.0.1' };
const browser = await chromium.launch(options), routes = [], runtime = [];
const publicRequest = production ? await browser.newContext() : null;
process.once('SIGTERM', () => browser.close().finally(() => process.exit(143)));
// 测试流量直连远程 IP，TLS 仍校验原主机名及固定证书；不改 hosts 或应用来源。
const get = (url, extra = {}) => production ? publicRequest.request.get(url, { ...extra, maxRedirects: 0 }) : new Promise((resolve, reject) => {
  const u = new URL(url); assert.equal(u.origin, origin);
  const req = https.request({ hostname: connectIP ?? u.hostname, port: u.port || 443,
    servername: u.hostname, ca: fs.readFileSync(process.env.WG_SPLIT_CERT),
    path: u.pathname + u.search, headers: { Host: u.host, ...extra.headers }, signal: AbortSignal.timeout(30_000) }, res => {
    const chunks = []; let size = 0;
    res.on('data', chunk => { size += chunk.length; if (size > 64 * 1024 ** 2) res.destroy(Error('验收响应超过限制')); else chunks.push(chunk); });
    res.on('error', reject);
    res.on('end', () => { const bytes = Buffer.concat(chunks); resolve({ status: () => res.statusCode,
      headers: () => res.headers, text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes.toString('utf8')), body: async () => bytes }); });
  });
  req.on('error', reject); req.end();
});
const save = () => fs.writeFileSync(report + '/acceptance.json', JSON.stringify({ origin, routes, runtime, checkedAt: new Date().toISOString() }, null, 2));
try {
  if (process.env.WG_SPLIT_RUNTIME_ONLY !== '1') for (const p of players) {
    const row = { id: p.id, route: p.route };
    try {
      const page = await get(origin + p.route); assert.equal(page.status(), 200);
      const path = p.runtimeKind ? '/__player/runtime/' + p.id : '/__ons/runtime/' + p.id;
      const entry = await get(origin + path, { maxRedirects: 0 });
      assert.equal(entry.status(), p.runtimeKind ? 302 : 200);
      assert.match(entry.headers()['content-security-policy'], /sandbox allow-scripts;/);
      assert.doesNotMatch(entry.headers()['content-security-policy'], /allow-same-origin|100\.74\.207/);
      if (p.runtimeKind) {
        const index = await get(origin + entry.headers().location); assert.equal(index.status(), 200);
        assert.match(await index.text(), /application\/x-wg-script/);
      } else {
        const manifest = await (await get(origin + '/__ons/manifest/' + p.id)).json();
        assert(manifest.files.length > 0); row.files = manifest.files.length;
        const part = await get(origin + manifest.files[0].url, { headers: { Range: 'bytes=0-15' } });
        assert.equal(part.status(), 206); assert((await part.body()).length <= 16);
      }
      row.status = 'passed';
    } catch (e) { row.status = 'failed'; row.error = e.message; }
    routes.push(row); save(); console.log(JSON.stringify(row));
    if (row.status === 'failed' && /ECONNRESET|ECONNREFUSED|TLS connection|ERR_CONNECTION/.test(row.error)) throw Error('预览连接中断，停止本轮验收');
  }
  for (const id of ['clannad', 'artemis-v27448-1', 'renpy-v1286-1', 'tyrano-v18636-1']) {
    const p = players.find(p => p.id === id), context = await browser.newContext(), page = await context.newPage(), errors = [];
    const row = { id, kind: p.runtimeKind ?? 'ONS' }; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept().catch(() => {}));
    try {
      await page.goto(origin + p.route);
      await page.getByRole('button', { name: '开始阅读', exact: true }).click();
      const frameElement = page.locator('iframe').first(); await frameElement.waitFor(); const frame = await frameElement.contentFrame();
      await frame.locator('body').waitFor({ state: 'attached' });
      const actual = page.frames().find(f => f !== page.mainFrame());
      if (!p.runtimeKind) await page.locator('.reader-save-status').filter({ hasText: '引擎已启动' }).waitFor({ timeout: 120_000 });
      await actual.waitForFunction(kind => kind === 'Tyrano'
        ? window.TYRANO?.kag?.stat?.current_scenario && window.TYRANO?.kag?.ftag?.current_order_index >= 0
        : (kind ? window.Module?.calledRun === true : !!window.g_onsyuri_module?.FS) && document.querySelector('canvas')?.width > 400,
        p.runtimeKind, { timeout: 240_000 });
      if (p.runtimeKind === 'Tyrano') {
        const bounds = await frameElement.boundingBox(); assert(bounds);
        await page.mouse.click(bounds.x + Math.min(300, bounds.width / 2), bounds.y + Math.min(250, bounds.height / 2));
        await actual.locator('#tyrano_base').waitFor({ state: 'visible' });
      } else await actual.locator('canvas').first().waitFor({ state: 'visible' });
      // WASM 初始化完成后仍可能处于首帧黑屏；等待实际像素再保存验收截图。
      const renderDeadline = Date.now() + 90_000;
      let rendered = false;
      do {
        const png = await frameElement.screenshot();
        rendered = await page.evaluate(async png => {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(160, 90), ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0, 160, 90); bitmap.close();
          const pixels = ctx.getImageData(0, 0, 160, 90).data;
          let visible = 0;
          for (let n = 0; n < pixels.length; n += 4) if (Math.max(pixels[n], pixels[n+1], pixels[n+2]) > 24) visible++;
          return visible / (160 * 90) > 0.005;
        }, [...png]);
        if (!rendered) await page.waitForTimeout(500);
      } while (!rendered && Date.now() < renderDeadline);
      assert(rendered, '引擎初始化后未出现可见游戏画面');
      row.rendered = true;
      await page.screenshot({ path: report + '/' + id + '-running.png' });
      row.isolation = await actual.evaluate(async () => {
        let parentDenied = false, idbDenied = false;
        try { void parent.document.body; } catch { parentDenied = true; }
        try { indexedDB.open('wg-split-probe'); } catch { idbDenied = true; }
        let privateAPI; try { privateAPI = (await fetch('/api/me')).status; } catch { privateAPI = 'denied'; }
        return { origin: self.origin, parentDenied, idbDenied, privateAPI };
      });
      assert.equal(row.isolation.origin, 'null'); assert(row.isolation.parentDenied && row.isolation.idbDenied);
      assert(['denied', 403].includes(row.isolation.privateAPI));
      await page.getByRole('button', { name: '保存并退出', exact: true }).click();
      await page.getByRole('button', { name: /^(开始|继续)阅读$/ }).waitFor({ timeout: 35_000 });
      row.head = await page.evaluate(async id => { const store = await (await import('/ons/storage.mjs')).openSaveStore(); try { const head = await store.get(id); return head && { revision: head.revision, digest: head.digest, files: head.snapshot.files.length }; } finally { store.close(); } }, id);
      assert(row.head); assert.deepEqual(errors, []); row.status = 'passed';
      await page.screenshot({ path: report + '/' + id + '.png' });
    } catch (e) { row.status = 'failed'; row.error = e.message; row.errors = errors; row.alerts = await page.getByRole('alert').allTextContents().catch(() => []); }
    finally { runtime.push(row); save(); console.log(JSON.stringify(row)); await context.close(); }
  }
} finally { await publicRequest?.close(); await browser.close(); }
if (routes.some(r => r.status !== 'passed') || runtime.some(r => r.status !== 'passed')) process.exitCode = 1;
