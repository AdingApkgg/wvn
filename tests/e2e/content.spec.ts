import { test, expect, type Page } from "@playwright/test";
import { authenticator, register, api } from "../helpers/account-browser";
import type { QuizAttempt } from "../../src/content/types";

const origin = process.env.WG_CONTENT_TEST_URL ?? process.env.WG_ACCOUNT_TEST_URL;
test.use({ ignoreHTTPSErrors: false });
test.skip(!origin, "需要已启用内容资格的独立 HTTPS 预览");

// 仅供独立测试进程作答，不进入浏览器应用或题目 HTTP 响应。
const correct: Record<string, string> = {
  "version-content": "specific-version",
  "fiction-boundaries": "respect-consent",
  "public-sharing": "follow-public-rules",
  "stop-reading": "stop-and-report",
  "account-sharing": "keep-account-private",
  "display-preference": "respect-choice",
  "spoiler-separate": "separate-settings",
  "report-content": "report-entry",
  "session-mode": "enable-each-session",
  "qualification-scope": "site-rules-only",
  "unknown-version": "wait-for-review",
  "public-mode-data": "preserve-saves",
};

async function reader(page: Page) {
  await page.goto(origin + "/health");
  await authenticator(page);
  expect((await register(page, "规则阅读者")).status).toBe(200);
  await page.goto(origin + "/content");
}

async function completeQuiz(page: Page, pass = true) {
  const received = page.waitForResponse(response =>
    response.url().endsWith("/api/me/content/attempts") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "开始规则测试", exact: true }).click();
  const response = await received;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["x-wg-binding"]).toBeTruthy();
  const attempt = await response.json() as QuizAttempt;
  expect(attempt.questions).toHaveLength(8);
  await expect(page.locator(".content-question")).toHaveCount(8);
  for (const [index, question] of attempt.questions.entries()) {
    const choice = !pass && index === 0
      ? question.choices.find(choice => choice.id !== correct[question.id])!.id
      : correct[question.id];
    expect(choice).toBeTruthy();
    await page.locator(`input[name="${question.id}"][value="${choice}"]`).check();
  }
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  return attempt;
}

async function enable(page: Page) {
  await page.getByRole("button", { name: "开启 NSFW 显示", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("当前设备");
  await confirmation.getByRole("button", { name: "确认开启", exact: true }).click();
  await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toBeVisible();
}

test("游客只得到中性说明、登录入口和经过校验的本站返回地址", async ({ page }) => {
  await page.goto(origin + "/content?returnTo=" + encodeURIComponent("//outside.invalid/private"));
  await expect(page.getByRole("heading", { name: "敏感内容浏览资格测试", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用通行密钥登录", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始规则测试", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "返回原页面", exact: true })).toHaveAttribute("href", "/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator("main")).toContainText("只确认对本站规则的理解");
});

test("一次答错解释规则，显示剩余次数和重试时间，刷新不能绕过冷却", async ({ page }) => {
  await reader(page);
  await completeQuiz(page, false);
  await expect(page.getByRole("heading", { name: "本次尚未通过", exact: true })).toBeVisible();
  await expect(page.locator(".content-feedback")).toContainText("规则解释");
  await expect(page.getByText("滚动 24 小时内剩余 2 次提交机会。", { exact: true })).toBeVisible();
  await expect(page.locator(".content-retry")).toContainText("可重试时间");
  await expect(page.getByRole("button", { name: "开始规则测试", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("滚动 24 小时内剩余 2 次提交机会。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始规则测试", exact: true })).toBeDisabled();
});

test("通过仅授予资格，主动确认后开启；刷新保持，重新登录默认公共浏览", async ({ page }, testInfo) => {
  await reader(page);
  await completeQuiz(page);
  await expect(page.getByRole("heading", { name: "已取得浏览资格", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
  expect((await api(page, "/api/me/content")).data.canViewRestricted).toBe(false);
  await enable(page);
  await page.reload();
  await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("content-qualified-desktop.png"), fullPage: true });
  expect((await api(page, "/api/auth/sign-out", {})).status).toBe(200);
  await page.goto(origin + "/content");
  await page.getByRole("button", { name: "使用通行密钥登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "已取得浏览资格", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
  expect((await api(page, "/api/me/content")).data.displayMode).toBe("public");
});

test("切回公共浏览立即收起状态，不等待关闭请求返回", async ({ page }) => {
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  const sibling = await page.context().newPage();
  await sibling.goto(origin + "/content");
  await expect(sibling.getByRole("link", { name: "NSFW 已开启", exact: true })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toBeVisible();
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let waiting!: () => void;
  const held = new Promise<void>(resolve => { waiting = resolve; });
  await page.route("**/api/me/content/mode", async route => {
    const response = await route.fetch();
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().headers()["x-wg-binding"]).toBeTruthy();
    waiting();
    await released;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.getByRole("button", { name: "切回公共浏览", exact: true }).click();
    await held;
    await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toHaveCount(0);
    await expect(sibling.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
    await expect(sibling.getByRole("button", { name: "重试同步公共浏览", exact: true })).toBeVisible();
  } finally { release(); await sibling.close(); }
});

test("跨标签页关闭会丢弃延迟的旧权限响应，重新聚焦会复查", async ({ page }) => {
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  let hold = true;
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let waiting!: () => void;
  const held = new Promise<void>(resolve => { waiting = resolve; });
  await page.route("**/api/me/content", async route => {
    if (!hold) return route.continue();
    hold = false;
    const response = await route.fetch();
    waiting();
    await released;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await held;
    expect((await api(page, "/api/me/content/mode", { mode: "public" }, "PATCH")).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "wg-content-change", newValue: "other-tab",
    })));
    await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
    release();
    await expect.poll(async () => (await api(page, "/api/me/content")).data.displayMode).toBe("public");
    await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toHaveCount(0);
  } finally { release(); }
});

test("手机页面可用键盘作答，问题和操作不横向溢出", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reader(page);
  const startButton = page.getByRole("button", { name: "开始规则测试", exact: true });
  await expect(startButton).toBeEnabled();
  await startButton.focus();
  await expect(startButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".content-question")).toHaveCount(8);
  const first = page.getByRole("radio").first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("content-quiz-mobile.png"), fullPage: true });
});

test("公共切换立即隐藏书架、收藏、分享及编辑文案，API延迟不会保留旧标题或删除记录", async ({ page }) => {
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  const works = (await api(page, "/api/account-catalog")).data;
  const work = works.find((item: { title: string }) => item.title !== "受限作品");
  expect(work).toBeTruthy();
  const sensitiveTitle = "仅开启时展示的回归作品标题";
  const sensitiveNote = "仅开启时展示的私人笔记";
  const sensitiveShare = "仅开启时展示的分享标题";
  expect((await api(page, `/api/me/library/${work.id}`, { revision: 0, status: "wanted", note: sensitiveNote }, "PATCH")).status).toBe(200);
  expect((await api(page, `/api/me/work-stats/${work.id}/favorite`, { enabled: true }, "PUT")).status).toBe(200);
  let publicMode = false, delay = false;
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const projectedWork = () => ({ ...work, title: publicMode ? "受限作品" : sensitiveTitle,
    versions: work.versions.map((version: { number: number }) => ({ ...version, title: publicMode ? `版本 ${version.number} · 受限` : "仅开启时展示的版本" })),
  });
  await page.route("**/api/cloud-options", route => route.fulfill({ json: { manual: true, sharing: true } }));
  await page.route("**/api/account-catalog", async route => {
    if (delay) await released;
    await route.fulfill({ json: [projectedWork()] }).catch(() => {});
  });
  await page.route("**/api/me/save-shares", async route => {
    if (delay) await released;
    await route.fulfill({ json: { items: [{
      id: "content-regression-share", title: publicMode ? "受限存档分享" : sensitiveShare,
      description: publicMode ? "" : "仅开启时展示的分享说明", progress: "chapter", spoiler: false,
      mode: "public", state: "active", metadataRevision: 1, pending: null,
      work: { id: work.id, title: projectedWork().title, url: work.url }, version: work.versions[0],
      metadataBasis: "published", publicSource: null, author: "规则阅读者", createdAt: Date.now(),
      expiresAt: null, files: [], bytes: 0, claims: 0, integrity: "sha256", compatibility: "author-declared",
    }], next: null } }).catch(() => {});
  });
  await page.goto(origin + "/account?tab=library");
  const shelf=page.locator(`[data-shelf-work="${work.id}"]`);
  await expect(shelf.getByRole("link", { name: sensitiveTitle, exact: true })).toBeVisible();
  await expect(shelf).toContainText("已收藏");
  await shelf.getByRole("button",{name:"编辑阅读记录",exact:true}).click();
  await expect(page.locator(`#note-${work.id}`)).toHaveValue(sensitiveNote);
  await page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"存档",exact:true}).click();
  await page.getByRole("link", { name: "我的分享", exact: true }).click();
  await expect(page.getByRole("heading", { name: sensitiveShare, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑分享说明", exact: true }).click();
  await expect(page.locator("#edit-share-title")).toHaveValue(sensitiveShare);
  try {
    delay = true;
    publicMode = true;
    expect((await api(page, "/api/me/content/mode", { mode: "public" }, "PATCH")).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "wg-content-change", newValue: "other-tab" })));
    await expect(page.getByRole("link", { name: "公共浏览", exact: true })).toBeVisible();
    await expect(page.getByText(sensitiveTitle, { exact: true })).toHaveCount(0);
    await expect(page.getByText(sensitiveShare, { exact: true })).toHaveCount(0);
    await expect.poll(() => page.locator("input,textarea").evaluateAll((fields, text) => fields.some(field => (field as HTMLInputElement).value === text), sensitiveNote)).toBe(false);
    await expect(page.locator("#edit-share-title")).toHaveCount(0);
    release();
    await expect(page.getByRole("heading", { name: "受限存档分享", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "编辑分享说明", exact: true })).toBeDisabled();
    await page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"书架",exact:true}).click();
    const editRecord=page.locator(`[data-shelf-work="${work.id}"]`).getByRole("button",{name:"编辑阅读记录",exact:true});
    if(await editRecord.count())await editRecord.click();
    await expect(page.locator(`#note-${work.id}`)).toBeDisabled();
    const readingStatus = page.locator(`[data-shelf-work="${work.id}"]`).getByRole("combobox", { name: "阅读状态", exact: true });
    await expect(readingStatus).toBeEnabled();
    await readingStatus.selectOption("paused");
    const patched = page.waitForRequest(request => request.url().endsWith(`/api/me/library/${work.id}`) && request.method() === "PATCH");
    await page.locator("form").filter({ has: page.locator(`#note-${work.id}`) }).getByRole("button", { name: "保存阅读记录", exact: true }).click();
    expect((await patched).postDataJSON()).toEqual({ revision: 1, status: "paused" });
    expect((await api(page, "/api/me/favorites")).data).toContain(work.id);
    expect((await api(page, "/api/me/library")).data.some((item: { workId: string }) => item.workId === work.id)).toBe(true);
    expect((await api(page, "/api/me/content/mode", { mode: "restricted" }, "PATCH")).status).toBe(200);
    expect((await api(page, "/api/me/library")).data.find((item: { workId: string }) => item.workId === work.id).note).toBe(sensitiveNote);
    expect((await api(page, "/api/me/library")).data.find((item: { workId: string }) => item.workId === work.id).status).toBe("paused");
  } finally { release(); }
});

test("独立分享失去显示权限后立即隐藏旧正文，并用资格提示解释403", async ({ page }) => {
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  let publicMode = false;
  await page.route("**/api/public/save-shares/content-regression-detail", route => route.fulfill(publicMode
    ? { status: 403, json: { code: "CONTENT_MODE_REQUIRED" } }
    : { json: {
      id: "content-regression-detail", mode: "public", title: "仅开启时展示的独立分享标题",
      description: "仅开启时展示的独立分享正文", progress: "chapter", spoiler: false,
      work: { id: "v1", title: "回归作品", url: "/1/" },
      version: { id: "version-one", title: "回归版本", number: 1, engine: "krkr", url: "/1/1/" },
      metadataBasis: "published", publicSource: null, author: "规则阅读者", createdAt: Date.now(),
      expiresAt: null, files: [], bytes: 0, claims: 0, integrity: "sha256", compatibility: "author-declared",
    } }));
  await page.goto(origin + "/s/content-regression-detail");
  await expect(page.getByRole("heading", { name: "仅开启时展示的独立分享标题", exact: true })).toBeVisible();
  publicMode = true;
  expect((await api(page, "/api/me/content/mode", { mode: "public" }, "PATCH")).status).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "wg-content-change", newValue: "other-tab" })));
  await expect(page.getByText("仅开启时展示的独立分享标题", { exact: true })).toHaveCount(0);
  await expect(page.getByText("仅开启时展示的独立分享正文", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "此内容暂不可见", exact: true })).toBeVisible();
  await expect(page.getByText("分享已失效或暂不可用。", { exact: true })).toHaveCount(0);
});

test("公共分享的中性投影明确说明文字隐藏，不声称仍是发布原文", async ({ page }) => {
  await reader(page);
  await page.route("**/api/public/save-shares/content-redacted-detail", route => route.fulfill({ json: {
    id: "content-redacted-detail", mode: "public", title: "已审核的公开说明", description: "受限文字已隐藏。",
    contentRedacted: true, progress: "chapter", spoiler: false,
    work: { id: "v1", title: "公开作品", url: "/1/" },
    version: { id: "version-one", title: "版本 1 · 受限", number: 1, engine: "krkr", url: "/1/1/" },
    metadataBasis: "published", publicSource: null, author: "规则阅读者", createdAt: Date.now(),
    expiresAt: null, files: [], bytes: 0, claims: 0, integrity: "sha256", compatibility: "author-declared",
  } }));
  await page.goto(origin + "/s/content-redacted-detail");
  await expect(page.getByRole("heading", { name: "已审核的公开说明", exact: true })).toBeVisible();
  await expect(page.getByText("受限文字已隐藏，版本归属保持不变。", { exact: true })).toBeVisible();
  await expect(page.getByText("版本信息已按发布时保存。", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下载完整存档包", exact: true })).toHaveCount(0);
});

test("链接分享的密钥保留在fragment，不进入浏览规则的返回查询串", async ({ page }) => {
  await page.goto(origin + "/s/content-secret#key=synthetic-private-link-key");
  const target = await page.getByRole("link", { name: "公共浏览", exact: true }).getAttribute("href");
  expect(decodeURIComponent(target!)).not.toContain("synthetic-private-link-key");
  expect(new URL(page.url()).hash).toContain("synthetic-private-link-key");
});

test("持续前台页面在15秒复查发现撤销资格后收起显示", async ({ page }) => {
  await page.clock.install();
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  await page.waitForLoadState("networkidle");
  const current = (await api(page, "/api/me/content")).data;
  let checks = 0;
  await page.route("**/api/me/content", route => {
    checks++;
    return route.fulfill({ json: { ...current, eligibility: "suspended", displayMode: "public", canViewRestricted: false } });
  });
  await page.clock.fastForward(15_001);
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "当前资格已暂停", exact: true })).toBeVisible();
});

for (const target of ["work", "catalog"] as const) test(`SSR重验延迟时立即收起旧${target === "work" ? "NSFW作品正文和网页标题" : "NSFW目录卡片"}`, async ({ page }) => {
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  const catalog = (await api(page, "/api/catalog")).data;
  const work = catalog.find((item: { id: string }) => item.id === "v97");
  expect(work).toBeTruthy();
  await page.goto(origin + (target === "work" ? work.url : "/"));
  await expect(page.getByRole("heading", { name: work.title, exact: true })).toBeVisible();
  await page.waitForFunction(() => ["/api/me", "/api/me/content"].every(path =>
    performance.getEntriesByType("resource").some(entry => new URL(entry.name).pathname === path && (entry as PerformanceResourceTiming).responseEnd > 0),
  ));
  await expect(page.getByRole("link", { name: "NSFW 已开启", exact: true })).toBeVisible();
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const held = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\.data(?:\?|$)/, async route => {
    requested();
    await released;
    await route.continue().catch(() => {});
  });
  try {
    expect((await api(page, "/api/me/content/mode", { mode: "public" }, "PATCH")).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "wg-content-change", newValue: "other-tab" })));
    await held;
    await expect(page.getByText(work.title, { exact: true })).toHaveCount(0);
    if (target === "work") {
      await expect(page.locator(".work-summary")).toHaveCount(0);
      await expect(page.locator(".work-cover")).toHaveCount(0);
      await expect.poll(() => page.title()).not.toContain(work.title);
      await expect(page.getByRole("heading", { name: "此内容暂不可见", exact: true })).toBeVisible();
    }
  } finally { release(); }
});

test("仍然可见但未聚焦的窗口也会定期发现资格撤销", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false }));
  await reader(page);
  await completeQuiz(page);
  await enable(page);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  const current = (await api(page, "/api/me/content")).data;
  let checks = 0;
  await page.route("**/api/me/content", route => {
    checks++;
    return route.fulfill({ json: { ...current, eligibility: "suspended", displayMode: "public", canViewRestricted: false } });
  });
  await page.clock.fastForward(15_001);
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "当前资格已暂停", exact: true })).toBeVisible();
});

test("SSR重验延迟时立即收起播放器NSFW网页标题", async ({page})=>{
 await reader(page);await completeQuiz(page);await enable(page);
 const work=(await api(page,'/api/catalog')).data.find((w:{id:string})=>w.id==='v97');
 expect(work).toBeTruthy();await page.goto(origin+work.versions[0].url);
 await expect(page.getByRole('button',{name:'开始阅读',exact:true})).toBeVisible();
 await expect.poll(()=>page.title()).toContain(work.title);
 let release!:()=>void;const released=new Promise<void>(r=>release=r);
 let requested!:()=>void;const held=new Promise<void>(r=>requested=r);
 await page.route(/\.data(?:\?|$)/,async route=>{requested();await released;await route.continue().catch(()=>{})});
 try {
  expect((await api(page,'/api/me/content/mode',{mode:'public'},'PATCH')).status).toBe(200);
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'wg-content-change',newValue:'title-review'})));
  await held;await expect(page.getByRole('heading',{name:'敏感内容已收起',exact:true})).toBeVisible();
  await expect.poll(()=>page.title()).not.toContain(work.title);
 }finally{release()}
});
