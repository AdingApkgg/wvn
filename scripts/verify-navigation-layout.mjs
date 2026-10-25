import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { previewChromiumOptions } from './lib/preview-browser.mjs';

const origin = process.env.WG_UI_URL;
const output = process.env.WG_UI_REPORT;
assert(origin && output && process.env.WG_UI_CERT, '需要独立预览入口、报告目录和证书');
fs.mkdirSync(output, { recursive: true });
const options = previewChromiumOptions(process.env.WG_UI_CERT);
if (process.platform === 'win32') options.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
options.proxy = { server: process.env.WG_BROWSER_PROXY ?? `http://127.0.0.1:${process.platform === 'win32' ? 10808 : 11090}`, bypass: 'localhost,127.0.0.1' };
const browser = await chromium.launch(options);
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(8000);
const results = [], errors = [], runtimeFailures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => { if (request.url().includes('/runtime/')) runtimeFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message, frames: page.frames().map(frame => frame.url()), runtimeFailures: [...runtimeFailures] }); }
}
async function goto(path) {
  assert.equal((await page.goto(origin + path)).status(), 200);
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
}
try {
  await check('目录首屏、公共导航和高级筛选', async () => {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      await goto('/');
      await page.locator('.story-card').first().waitFor();
      assert((await page.locator('.story-grid').boundingBox()).y < 570, '作品目录应在首屏可见');
      assert(await page.getByRole('navigation', { name: '主要导航' }).isVisible(), '缺少跨页主导航');
      assert.equal(await page.getByLabel('引擎', { exact: true }).isVisible(), false, '技术筛选应默认收起');
      await page.getByText('高级筛选', { exact: true }).click();
      await page.getByLabel('引擎', { exact: true }).selectOption('Artemis');
      await page.getByRole('searchbox').fill('ATRI');
      await page.getByRole('button', { name: '查找', exact: true }).click();
      await page.waitForURL(/engine=Artemis/);
      assert.equal(await page.locator('.story-card').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width === 390 || width === 1440) { await goto('/'); await page.screenshot({ path: `${output}/catalog-${width}.png`, fullPage: false }); }
    }
  });
  await check('作品先阅读和简介，再展示玩家存档', async () => {
    await page.setViewportSize({ width: 390, height: 960 });
    await goto('/27448/');
    const start = page.getByRole('link', { name: '开始阅读', exact: true });
    await start.waitFor();
    assert((await start.boundingBox()).y < 600, '开始入口太靠后');
    assert((await page.getByRole('heading', { name: '故事简介', exact: true }).boundingBox()).y < (await page.getByRole('heading', { name: '玩家存档', exact: true }).boundingBox()).y);
    assert.equal(await page.getByText('选择一个版本', { exact: true }).count(), 0, '单版本无需独立选择区');
    await page.screenshot({ path: `${output}/work-390.png`, fullPage: true });
  });
  await check('本机历史不变，存档面板折叠保留选择，继续入口来自真实快照', async () => {
    await goto('/4/1/');
    await page.getByRole('button', { name: '开始阅读', exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === '开始阅读')?.disabled);
    const expected = await page.evaluate(async () => {
      const { players } = await import('/player/registry.mjs');
      const pilot = players.find(p => p.route === '/4/1/');
      const { openSaveStore } = await import('/ons/storage.mjs');
      const store = await openSaveStore();
      try {
        const first = await store.commit(pilot.id, (await store.get(pilot.id))?.revision ?? 0, { schema: 1, pilot: pilot.id, files: [{ path: 'save1.dat', data: new Uint8Array([1, 2, 3]), mtime: 123456000 }] }, 'file-import');
        const last = await store.commit(pilot.id, first.revision, { schema: 1, pilot: pilot.id, files: [{ path: 'save1.dat', data: new Uint8Array([4, 5, 6]), mtime: 123456001 }] }, 'file-import');
        return { pilot: pilot.id, count: (await store.history(pilot.id)).length, digest: last.digest, revision: last.revision };
      } finally { store.close(); }
    });
    await page.reload();
    const manager = page.getByRole('button', { name: '存档管理', exact: true });
    await manager.waitFor();
    assert.equal(await page.getByLabel('历史备份', { exact: true }).isVisible(), false);
    await manager.click();
    const history = page.getByLabel('历史备份', { exact: true });
    await history.selectOption({ index: 1 });
    const selected = await history.inputValue();
    await manager.click(); await manager.click();
    assert.equal(await history.inputValue(), selected, '折叠后历史选择丢失');
    await goto('/');
    await page.getByRole('region', { name: '继续阅读', exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: '继续阅读', exact: true }).getByRole('link').first().getAttribute('href'), '/4/1/');
    const actual = await page.evaluate(async pilot => {
      const { openSaveStore } = await import('/ons/storage.mjs'); const store = await openSaveStore();
      try { const row = await store.get(pilot); return { count: (await store.history(pilot)).length, digest: row.digest, revision: row.revision, bytes: [...row.snapshot.files[0].data], mtime: row.snapshot.files[0].mtime }; }
      finally { store.close(); }
    }, expected.pilot);
    assert.deepEqual(actual, { count: expected.count, digest: expected.digest, revision: expected.revision, bytes: [4, 5, 6], mtime: 123456001 });
  });
  await check('登录注册模式分开、恢复次级入口', async () => {
    await goto('/');
    await page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '存档', exact: true }).click();
    await page.waitForURL(/account\?tab=saves/);
    await page.getByRole('button', { name: '使用通行密钥登录', exact: true }).waitFor();
    assert.equal(await page.getByLabel('昵称', { exact: true }).isVisible(), false);
    await page.getByRole('tab', { name: '创建账号', exact: true }).click();
    await page.getByLabel('昵称', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '使用通行密钥登录', exact: true }).isVisible(), false);
    await page.screenshot({ path: `${output}/signup-390.png`, fullPage: true });
  });
  await check('无 JavaScript 的搜索与高级筛选仍可使用', async () => {
    const fallback = await browser.newContext({ javaScriptEnabled: false });
    try {
      const plain = await fallback.newPage();
      await plain.goto(origin + '/');
      await plain.getByText('高级筛选', { exact: true }).click();
      await plain.getByRole('searchbox').fill('ATRI');
      await plain.getByLabel('引擎', { exact: true }).selectOption('Artemis');
      await plain.getByRole('button', { name: '查找', exact: true }).click();
      await plain.waitForURL(/q=ATRI/);
      assert.equal(await plain.locator('.story-card').count(), 1);
    } finally { await fallback.close(); }
  });
  await check('阅读器导航等待存档确认，取消离开与运行中恢复限制有效', async () => {
    // 此处只验证 UI 保存握手，不将协议夹具当作实际游戏可启动证明。
    await page.route('**/__ons/runtime/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', headers: { 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'cross-origin' }, body: `<!doctype html><p>存档握手验收夹具</p><script>addEventListener('message',e=>{if(e.data.type!=='WG_ONS_INIT')return;const port=e.ports[0],init=e.data;let seq=0;port.onmessage=({data})=>{if(data.type==='snapshot')setTimeout(()=>port.postMessage({type:'snapshot',nonce:init.nonce,pilot:init.pilot,seq:++seq,requestId:data.requestId,snapshot:init.snapshot}),400)};port.start();port.postMessage({type:'status',nonce:init.nonce,pilot:init.pilot,message:'验收夹具已连接'})})<\/script>` }));
    await goto('/4/1/');
    await page.getByRole('button', { name: '存档管理', exact: true }).click();
    await page.getByLabel('历史备份', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: /^(开始|继续)阅读$/ }).click();
    await page.locator('.reader-save-status').filter({ hasText: '验收夹具已连接' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '下次启动使用此备份', exact: true }).isDisabled(), true);
    await page.getByRole('link', { name: '发现更多故事', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: '保存后离开故事？' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '继续阅读', exact: true }).click();
    assert.match(new URL(page.url()).pathname, /^\/4\/1\/?$/);
    await page.getByRole('link', { name: '发现更多故事', exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '保存并离开', exact: true }).click();
    assert.match(new URL(page.url()).pathname, /^\/4\/1\/?$/, '读取及持久化确认前不得离开');
    await page.waitForURL(origin + '/');
    await page.unroute('**/__ons/runtime/*');
  });
  assert.deepEqual(errors, []);
} finally {
  const result = { status: results.every(r => r.passed) && !errors.length ? 'passed' : 'failed', origin, results, errors, checkedAt: new Date().toISOString() };
  fs.writeFileSync(`${output}/layout.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close(); await browser.close();
  if (result.status !== 'passed') process.exitCode = 1;
}
