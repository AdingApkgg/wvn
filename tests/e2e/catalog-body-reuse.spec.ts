import { test, expect } from '@playwright/test';

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__reactRouterDataRouter);
  await page.waitForFunction(() => ['/api/me', '/api/me/content'].every(path => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === path && (entry as PerformanceResourceTiming).responseEnd > 0)));
  // 首次账号绑定可能再次复查权限；命中用例需等公共快照实际播种完成。
  await page.waitForFunction(async () => {
    const path = (window as any).__reactRouterManifest.routes['routes/work']?.imports?.find((path: string) => path.includes('/catalog-body-cache-'));
    if (!path) return false;
    const module = await import(path);
    const cache = Object.values(module).find((value: any) => typeof value?.get === 'function') as { get: (url: URL) => unknown } | undefined;
    const card = document.querySelector<HTMLAnchorElement>('.story-card');
    return !!card && !!cache?.get(new URL(card.href));
  });
}

test('暂停最新主体响应时目录主体已出现，确认后替换且不重载文档', async ({ page }) => {
  const errors: string[] = [];page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  let release!: () => void;const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_.data*', async route => { await held; await route.continue(); });
  await page.evaluate(() => { (window as any).bodyMarker = 'same-document'; });
  try {
    await page.locator('.story-card').first().dispatchEvent('click');
    await expect(page.locator('[data-catalog-preview] .work-heading h1')).toBeVisible({ timeout: 2500 });
    await expect(page.locator('[data-catalog-preview] button').filter({ hasText: '加入书架' })).toBeDisabled();
    expect(await page.evaluate(() => (window as any).bodyMarker)).toBe('same-document');
  } finally { release(); }
  await expect(page.locator('[data-catalog-preview]')).toHaveCount(0);
  await expect(page.locator('.work-heading h1')).toBeVisible();expect(errors).toEqual([]);
  await page.goBack();await expect(page.locator('.story-card').first()).toBeVisible();
});

test('最新请求失败时收起复用主体和阅读入口', async ({ page }) => {
  await ready(page);
  let release!: () => void;const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_.data*', async route => { await held; await route.fulfill({ status: 503, body: 'unavailable' }); });
  try {
    await page.locator('.story-card').first().dispatchEvent('click');
    await expect(page.locator('[data-catalog-preview] .work-heading h1')).toBeVisible({ timeout: 2500 });
  } finally { release(); }
  await expect(page.getByRole('heading', { name: '作品暂时无法确认' })).toBeVisible();
  await expect(page.locator('.work-heading')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '开始阅读', exact: true })).toHaveCount(0);
});

test('跨标签权限失效后，旧目录主体不绕过最新请求', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'wg-content-change', newValue: JSON.stringify({ kind: 'public', id: 'body-invalidation' }) })));
  let release!: () => void;const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_.data*', async route => { await held; await route.continue(); });
  try {
    await page.locator('.story-card').first().dispatchEvent('click');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-catalog-preview]')).toHaveCount(0);
    await expect(page.locator('.work-heading')).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator('.work-heading h1')).toBeVisible();
});

test('带筛选参数的作品导航等待最新主体', async ({ page }) => {
  await ready(page);
  const target = (await page.locator('.story-card').first().getAttribute('href'))! + '?saveVersion=missing';
  let release!: () => void;const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_.data*', async route => { await held; await route.continue(); });
  try {
    await page.evaluate(target => { void (window as any).__reactRouterDataRouter.navigate(target); }, target);
    await page.waitForTimeout(400);
    await expect(page.locator('.work-heading')).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator('.work-heading h1')).toBeVisible();
});

test('显式复查仍请求根loader', async ({ page }) => {
  await ready(page);await page.locator('.story-card').first().click();
  await expect(page.locator('.work-heading h1')).toBeVisible();
  await expect(page.locator('[data-catalog-preview]')).toHaveCount(0);
  const roots: string[] = [];
  let release!: () => void;const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_.data*', async route => {
    const url = new URL(route.request().url());const routes = url.searchParams.get('_routes');
    if (!routes || routes.split(',').includes('root')) roots.push(url.pathname);
    await held;await route.continue();
  });
  try {
    await page.evaluate(() => { void (window as any).__reactRouterDataRouter.revalidate(); });
    await expect.poll(() => roots.length, { timeout: 2500 }).toBeGreaterThan(0);
  } finally { release(); }
});
