import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { previewChromiumOptions } from './lib/preview-browser.mjs';

const origin = process.env.WG_ROUTING_URL;
const output = process.env.WG_ROUTING_REPORT;
assert(origin && output, '需要入口和报告目录');
const production = origin === 'https://wg.saop.cc';
assert(production || process.env.WG_ROUTING_CERT, '预览需要指定受信任证书');
fs.mkdirSync(output, { recursive: true });
const options = production
  ? { executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  : previewChromiumOptions(process.env.WG_ROUTING_CERT);
if (process.env.WG_ROUTING_PREVIEW_IP) options.args.push(`--host-resolver-rules=MAP localhost ${process.env.WG_ROUTING_PREVIEW_IP}`);
options.proxy = { server: process.env.WG_BROWSER_PROXY ?? 'http://127.0.0.1:11090', bypass: 'localhost,127.0.0.1' };
const browser = await chromium.launch(options);
const context = await browser.newContext();
const results = [], errors = [], dataRequests = [];
let current;
try {
  for (const slug of ['4', '27448', 'b315601']) {
    const page = await context.newPage();
    current = page;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === origin && url.pathname.endsWith('.data')) dataRequests.push({ path: url.pathname, status: response.status() });
    });
    // 路由发现请求由客户端挂载后发出，确保点击经过客户端路由而非浏览器整页跳转。
    const discovered = page.waitForResponse(r => new URL(r.url()).origin === origin && new URL(r.url()).pathname === '/__manifest');
    assert.equal((await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })).status(), 200);
    await discovered;
    const workData = page.waitForResponse(r => new URL(r.url()).pathname === `/${slug}/_.data`);
    await page.locator(`a.story-card[href="/${slug}/"]`).click();
    assert.equal((await workData).status(), 200, `作品 ${slug} 客户端数据`);
    await page.waitForURL(origin + `/${slug}/`);
    await page.locator('.work-heading h1').waitFor();
    const playData = page.waitForResponse(r => new URL(r.url()).pathname === `/${slug}/1/_.data`);
    await page.getByRole('link', { name: '开始阅读', exact: true }).click();
    assert.equal((await playData).status(), 200, `播放器 ${slug} 客户端数据`);
    await page.waitForURL(origin + `/${slug}/1/`);
    await page.getByRole('button', { name: '开始阅读', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '没有找到这段故事' }).count(), 0);
    results.push({ slug, catalogToWork: 'passed', workToPlayer: 'passed' });
    if (slug === '4') await page.screenshot({ path: `${output}/clannad-player.png` });
    await page.close();
  }
  const page = await context.newPage();
  current = page;
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const data = await page.evaluate(async () => {
    const catalog = await (await fetch('/api/catalog', { credentials: 'omit' })).json();
    const paths = [...new Set(catalog.flatMap(w => [w.url, ...w.versions.map(v => v.url)]))].map(path => path.replace(/\/?$/, '/') + '_.data');
    const statuses = [];
    for (let i = 0; i < paths.length; i += 6) {
      statuses.push(...await Promise.all(paths.slice(i, i + 6).map(async path => {
        const response = await fetch(path, { credentials: 'omit' });
        await response.text();
        return { path, status: response.status };
      })));
    }
    return { works: catalog.length, versions: catalog.reduce((n, w) => n + w.versions.length, 0), statuses };
  });
  assert(data.statuses.length > 0);
  assert.deepEqual(data.statuses.filter(x => x.status !== 200), [], '目录与全部版本的数据地址必须可用');
  assert.deepEqual(errors, [], '实际点击不能产生页面异常');
  const report = { status: 'passed', origin, results, dataRequests, ...data, checkedAt: new Date().toISOString() };
  fs.writeFileSync(`${output}/acceptance.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, origin, results, works: data.works, versions: data.versions, dataPaths: data.statuses.length }));
} catch (error) {
  fs.writeFileSync(`${output}/acceptance.json`, JSON.stringify({ status: 'failed', origin, results, dataRequests, errors, error: error.message }, null, 2));
  if (current && !current.isClosed()) await current.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
