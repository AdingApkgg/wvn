import { test, expect } from '@playwright/test';
import { authenticator, register, api } from '../helpers/account-browser';
import { RULE_QUESTIONS } from '../../src/content/quiz';

// 从实际框架清单取目标模块，验证浏览器请求而非源码文本。
test('悬停只预加载作品模块，点击后才请求权限数据并保持同一文档', async ({ page }) => {
  const errors: string[] = [], dataRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  await page.waitForFunction(() => (window as any).__reactRouterManifest.routes['routes/work']?.module);
  const module = await page.evaluate(() => (window as any).__reactRouterManifest.routes['routes/work'].module as string);
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.data')) dataRequests.push(request.url()); });
  const card = page.locator('.story-card').first();
  await page.evaluate(() => { (window as any).navigationMarker = 'same-document'; });
  const prefetched = page.waitForRequest(request => new URL(request.url()).pathname === new URL(module, page.url()).pathname);
  await card.hover();
  await prefetched;
  await expect(page.locator('link[rel="prefetch"][as="fetch"]')).toHaveCount(0);
  expect(dataRequests).toEqual([]);
  await card.click();
  await expect(page.locator('.work-heading h1')).toBeVisible();
  expect(await page.evaluate(() => (window as any).navigationMarker)).toBe('same-document');
  expect(dataRequests.length).toBeGreaterThan(0);
  await page.goBack();
  await expect(page.locator('.story-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('键盘聚焦只预加载账号模块，确认导航后再读取数据', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  await page.waitForFunction(() => (window as any).__reactRouterManifest.routes['routes/account']?.module);
  const module = await page.evaluate(() => (window as any).__reactRouterManifest.routes['routes/account'].module as string);
  const dataRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.data')) dataRequests.push(request.url()); });
  const target = page.getByRole('navigation', { name: '主要导航' }).getByRole('link', { name: '书架', exact: true });
  const prefetched = page.waitForRequest(request => new URL(request.url()).pathname === new URL(module, page.url()).pathname);
  await target.focus();
  await prefetched;
  await expect(page.locator('link[rel="prefetch"][as="fetch"]')).toHaveCount(0);
  expect(dataRequests).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(target).toHaveAttribute('aria-current', 'page');
  expect(dataRequests.length).toBeGreaterThan(0);
});

test('附属接口慢时先显示作品主体并随后补齐统计和存档', async ({ page }, info) => {
  const { writeFile, rm } = await import('node:fs/promises');
  const flag = process.env.NAVIGATION_TEST_DELAY;
  test.skip(!flag, '需要本任务隔离预览的延迟夹具');
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  const card = page.locator('.story-card').first();
  // 延迟标记只控制本任务预览，不改变业务数据。
  await writeFile(flag!, 'delayed');
  try {
    const started = Date.now();
    await card.dispatchEvent('click');
    await expect(page.locator('.work-heading h1')).toBeVisible();
    const mainVisibleMs = Date.now() - started;
    await expect(page.getByText('正在加载玩家存档…', { exact: true })).toBeVisible();
    await expect(page.getByText('正在加载作品统计…', { exact: true })).toBeVisible();
    await expect(page.locator('[data-work-stats]')).toBeVisible();
    await expect(page.getByRole('button', { name: '筛选玩家存档' })).toBeVisible();
    await info.attach('streaming-timing.json', { body: JSON.stringify({ injectedDelayMs: 1400, mainVisibleMs, auxiliaryVisibleMs: Date.now() - started }), contentType: 'application/json' });
    await expect(page.getByText('正在加载玩家存档…', { exact: true })).toHaveCount(0);
    await expect(page.locator('.work-heading h1')).toBeVisible();
  } finally { await rm(flag!, { force: true }); }
});

test('作品页进场逐帧收敛，不在内容出现后反向跳动', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  await page.evaluate(() => {
    const state = window as typeof window & { routeFrames?: number[] };
    state.routeFrames = [];
    const sample = () => {
      const root = document.querySelector('.route-motion');
      if (root && document.querySelector('.work-heading')) {
        const transform = getComputedStyle(root).transform;
        state.routeFrames!.push(transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42);
      }
      if (state.routeFrames!.length < 40) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('.story-card').first().dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { routeFrames?: number[] }).routeFrames?.length)).toBe(40);
  const frames = await page.evaluate(() => (window as typeof window & { routeFrames: number[] }).routeFrames);
  await info.attach('route-frames.json', { body: JSON.stringify(frames), contentType: 'application/json' });
  for (let i = 1; i < frames.length; i++) expect(frames[i] - frames[i - 1]).toBeLessThanOrEqual(0.5);
  expect(Math.abs(frames.at(-1)!)).toBeLessThan(0.5);
});


test('公共浏览切换后，延迟完成的旧权限分享不会重新出现', async ({ page }) => {
  const { writeFile, rm } = await import('node:fs/promises');
  const flag = process.env.NAVIGATION_TEST_DELAY;
  test.skip(!flag, '需要本任务隔离预览的延迟夹具');
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  const publicPath = (await page.locator('.story-card').first().getAttribute('href'))!;
  await authenticator(page);
  expect((await register(page, '流式权限验证')).status).toBe(200);
  const attempt = (await api(page, '/api/me/content/attempts', {})).data;
  const answers = Object.fromEntries(attempt.questions.map((q: { id: string }) => [q.id, RULE_QUESTIONS.find(rule => rule.id === q.id)!.correctChoiceId]));
  expect((await api(page, '/api/me/content/attempts/' + attempt.id + '/submit', { answers })).data.passed).toBe(true);
  expect((await api(page, '/api/me/content/mode', { mode: 'restricted' }, 'PATCH')).status).toBe(200);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  await expect(page.getByRole('link', { name: 'NSFW 已开启', exact: true })).toBeVisible();
  // 等首次账号/权限复查完成，再制造慢分享响应，避免把 SSR 标签当作客户端已就绪。
  await page.waitForFunction(() => ['/api/me', '/api/me/content'].every(path =>
    performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === path && (entry as PerformanceResourceTiming).responseEnd > 0),
  ));
  await writeFile(flag!, 'delayed');
  let release!: () => void;
  const revalidation = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.locator(`.story-card[href="${publicPath}"]`).dispatchEvent('click');
    await expect(page.getByText('正在加载玩家存档…', { exact: true })).toBeVisible();
    // 留住公共模式的 SSR 重验，让旧 Promise 在旧快照仍存在时完成。
    await page.route(/\.data(?:\?|$)/, async route => {
      await revalidation;
      await route.continue().catch(() => {});
    });
    expect((await api(page, '/api/me/content/mode', { mode: 'public' }, 'PATCH')).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'wg-content-change', newValue: 'other-tab' })));
    await expect(page.getByRole('link', { name: 'NSFW 已开启', exact: true })).toHaveCount(0);
    await expect(page.locator('#player-saves')).toHaveCount(0);
    // 统计与分享使用同一延迟；统计显示说明旧数据流已到达客户端。
    await expect(page.locator('[data-work-stats]')).toBeVisible();
    await expect(page.locator('#player-saves')).toHaveCount(0);
    await expect(page.locator('.work-heading h1')).toBeVisible();
  } finally {
    release();
    await rm(flag!, { force: true });
  }
});
