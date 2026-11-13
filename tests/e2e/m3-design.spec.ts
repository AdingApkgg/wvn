import { test, expect } from "@playwright/test";
import { authenticator, register, api } from "../helpers/account-browser";
import { RULE_QUESTIONS } from "../../src/content/quiz";

test("手机主要控件有48px触控空间且页面不溢出", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const search = page.getByRole("button", { name: "查找", exact: true });
    const box = await search.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThanOrEqual(48);
    for (const link of await page.getByRole("navigation", { name: "主要导航" }).getByRole("link").all()) {
      const target = await link.boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(48);
      expect(target!.width).toBeGreaterThanOrEqual(48);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("减少动态效果时封面悬停不移动且内容可见", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.locator(".story-card").first();
  await expect(card).toBeVisible();
  await card.hover();
  await expect.poll(() => card.evaluate(el => {
    const transform = getComputedStyle(el).transform;
    return transform === "none" || new DOMMatrixReadOnly(transform).isIdentity;
  })).toBe(true);
  await expect.poll(() => card.locator(".card-art").evaluate(el => getComputedStyle(el).translate)).toBe("none");
  await page.locator(".advanced-filters > summary").click();
  const duration = await page.locator(".advanced-filters").evaluate(el => getComputedStyle(el, "::details-content").transitionDuration);
  expect(duration.split(",").every(value => parseFloat(value) === 0)).toBe(true);
  await expect(page.getByRole("heading", { name: "故事目录" })).toBeVisible();
});

test("浏览器后退保持导航语义且阅读器祖先没有变换", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "主要导航" });
  await navigation.getByRole("link", { name: "书架", exact: true }).click();
  await expect(navigation.getByRole("link", { name: "书架", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(navigation.getByRole("link", { name: "发现", exact: true })).toHaveAttribute("aria-current", "page");
  await authenticator(page);
  expect((await register(page, "M3 阅读壳层验收")).status).toBe(200);
  const attempt = (await api(page, "/api/me/content/attempts", {})).data;
  const answers = Object.fromEntries(attempt.questions.map((q: { id: string }) => [q.id, RULE_QUESTIONS.find(rule => rule.id === q.id)!.correctChoiceId]));
  expect((await api(page, `/api/me/content/attempts/${attempt.id}/submit`, { answers })).status).toBe(200);
  expect((await api(page, "/api/me/content/mode", { mode: "restricted" }, "PATCH")).status).toBe(200);
  // 真实播放器外壳和连接协议，游戏正文使用可观测的独立输入夹具。
  await page.route("**/__ons/runtime/clannad**", route => route.fulfill({
    contentType: "text/html; charset=utf-8", headers: { "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "cross-origin" },
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body><input aria-label="夹具输入" id="fixture-input"><script>
    window.instanceId=crypto.randomUUID();
    addEventListener('message',event=>{if(event.data?.type!=='WG_ONS_INIT'||!event.ports[0])return;
      const identity=event.data,port=event.ports[0];port.onmessage=({data})=>{if(data.nonce!==identity.nonce)return;
        if(data.type==='snapshot')port.postMessage({type:'snapshot',pilot:identity.pilot,nonce:identity.nonce,seq:1,requestId:data.requestId,snapshot:{schema:1,pilot:identity.pilot,files:[]}})};
      port.postMessage({type:'started',pilot:identity.pilot,nonce:identity.nonce});});
    </script></body></html>`,
  }));
  await page.goto("/4/1/");
  await expect(page.locator(".reader-surface")).toBeVisible();
  await page.getByRole("button", { name: "开始阅读", exact: true }).click();
  await expect(page.getByRole("button", { name: "全屏", exact: true })).toBeEnabled({ timeout: 30000 });
  const frame = page.frames().find(frame => frame.url().includes("/__ons/runtime/clannad"))!;
  await expect(frame.locator("#fixture-input")).toBeVisible();
  const identity = await frame.evaluate(() => (window as unknown as { instanceId: string }).instanceId);
  await frame.getByLabel("夹具输入").fill("输入保持");
  await page.getByRole("button", { name: "全屏", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole("button", { name: "存档与备份", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  const trigger = page.getByRole("button", { name: "备份到云端", exact: true });
  await expect(page.locator(".reader-surface iframe")).toHaveAttribute("aria-busy", "false");
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "备份到当前账号？" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  await expect.poll(async () => (await dialog.getByRole("button", { name: "取消", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(47.9);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await frame.evaluate(() => (window as unknown as { instanceId: string }).instanceId)).toBe(identity);
  await expect(frame.getByLabel("夹具输入")).toHaveValue("输入保持");
  const transformed = await page.locator(".reader-surface").evaluate(el => {
    const result: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (getComputedStyle(node).transform !== "none") result.push(node.tagName);
    }
    return result;
  });
  expect(transformed).toEqual([]);
});

test("长版本名称在320px选择器中不撑宽页面", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/37021/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "游戏版本", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("提交空注册表单保留原生校验并显示无效状态", async ({ page }) => {
  await page.goto("/account");
  await page.getByRole("tab", { name: "创建账号", exact: true }).click();
  const nickname = page.getByLabel("昵称");
  await nickname.fill("读者");
  await nickname.fill("");
  await page.getByRole("button", { name: "创建通行密钥并注册", exact: true }).click();
  expect(await nickname.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(nickname).toBeFocused();
  expect(await nickname.evaluate(input => input.matches(":user-invalid"))).toBe(true);
});

test("无JavaScript内容可见并可提交搜索", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(process.env.WG_TEST_URL!);
    await expect(page.locator(".story-card").first()).toBeVisible();
    await page.getByRole("searchbox").fill("ATRI");
    await page.getByRole("button", { name: "查找", exact: true }).click();
    await expect(page.locator(".story-card")).toHaveCount(1);
  } finally { await context.close(); }
});

test("登录分区在减少动态效果时仍支持键盘切换", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/account?tab=security");
  const login = page.getByRole("tab", { name: "登录", exact: true });
  await expect(login).toBeVisible();
  await login.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "创建账号", exact: true })).toBeFocused();
  await expect(page.getByLabel("昵称")).toBeVisible();
});
