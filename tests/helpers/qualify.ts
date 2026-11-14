import { expect, type Page } from "@playwright/test";
import { RULE_QUESTIONS } from "../../src/content/quiz";
import { api, authenticator, register } from "./account-browser";

/** 已登录会话补做规则答题并切到受限模式；未登录时先注册。 */
export async function qualifySession(page: Page, nickname = "资格读者") {
  // 相对地址会落到 playwright config 的 baseURL（127.0.0.1:8281），而分享用例跑在
  // https://localhost:8283 上，两者是不同 origin/RP，必须用当前页面的 origin。
  const me = await page.request.get(new URL("/api/me", page.url()).toString());
  if (!me.ok()) expect((await register(page, nickname)).status).toBe(200);
  await qualifyOnly(page);
}

/** 仅补答题与显示模式，不碰注册；调用方已自行注册过时用这个。 */
export async function qualifyOnly(page: Page) {
  // 刚通过分享页表单注册时，set-cookie 可能还没写入下一个上下文，轮询到会话生效为止。
  let attempt: { id: string; questions: { id: string }[] } | undefined;
  let gateOff = false;
  for (let i = 0; i < 10 && !attempt && !gateOff; i++) {
    const response = await api(page, "/api/me/content/attempts", {});
    if (response.status === 200 && Array.isArray(response.data?.questions))
      attempt = response.data;
    // 平台启动器不开内容门禁时没有这些接口，受限内容本就直接可见，无需答题。
    else if (response.status === 404) gateOff = true;
    else await page.waitForTimeout(300);
  }
  if (gateOff) return;
  if (!attempt)
    throw new Error(
      "无法取得规则测试题目：" +
        JSON.stringify((await api(page, "/api/me/content/attempts", {})).data),
    );
  const answers = Object.fromEntries(
    attempt.questions.map((question: { id: string }) => [
      question.id,
      RULE_QUESTIONS.find((rule) => rule.id === question.id)!.correctChoiceId,
    ]),
  );
  expect(
    (await api(page, `/api/me/content/attempts/${attempt.id}/submit`, { answers }))
      .status,
  ).toBe(200);
  expect(
    (await api(page, "/api/me/content/mode", { mode: "restricted" }, "PATCH"))
      .status,
  ).toBe(200);
}

/** 平台启动器把公共站与账号站分在 4281/4283，注册必须打在账号站上。 */
export async function qualify(page: Page, nickname = "资格读者") {
  const origin = process.env.WG_ACCOUNT_TEST_URL ?? "";
  await page.goto(origin + "/health");
  await authenticator(page);
  expect((await register(page, nickname)).status).toBe(200);
  await qualifyOnly(page);
  // 会话 cookie 是 host-only：注册在 localhost:4283，而 baseURL 是 127.0.0.1:4281，
  // 不换 host 复制一份，公共站上就仍是匿名（受限内容只剩「取得资格后阅读」）。
  const target = new URL(process.env.WG_TEST_URL ?? "http://127.0.0.1:8281");
  if (origin && new URL(origin).host !== target.host) {
    const cookies = await page.context().cookies(origin);
    // 会话 cookie 带 __Secure- 前缀，url 形式必须配 https，而公共站是 http，
    // 会报 Invalid cookie fields；改用 domain+path 落地同一台机器即可。
    await page.context().addCookies(
      cookies.map(({ name, value, expires, httpOnly, secure, sameSite }) => ({
        name,
        value,
        domain: target.hostname,
        path: "/",
        ...(expires > 0 ? { expires } : {}),
        httpOnly,
        secure,
        sameSite,
      })),
    );
  }
  await page.goto("/");
}
